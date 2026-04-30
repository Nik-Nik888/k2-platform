import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';
import type { GlazingFormData } from '../types';

// ═══════════════════════════════════════════════════════════════════
// glazingProjectApi.ts — CRUD проектов остекления.
//
// Архитектура аналогична cabinets: проект остекления — отдельная
// сущность, привязанная к клиенту CRM. Один клиент имеет несколько
// проектов (балкон + окна + лоджия и т.п.).
//
// Отличие от справочника материалов (glazingApi.ts) и пользовательских
// шаблонов (glazingTemplatesApi.ts) — здесь ИНСТАНСЫ проектов.
// ═══════════════════════════════════════════════════════════════════

export interface GlazingSummary {
  id: string;
  name: string;
  total_cost: number;
  preview: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
  // Краткая сводка для отображения в сетке (число рам/сегментов)
  segment_count: number;
  frame_count: number;
}

export interface GlazingFull {
  id: string;
  org_id: string;
  client_id: string | null;
  name: string;
  data: GlazingFormData;
  total_cost: number;
  preview: string | null;
  created_at: string;
  updated_at: string;
}

interface DbGlazing {
  id: string;
  org_id: string;
  client_id: string | null;
  name: string;
  data: GlazingFormData;
  total_cost: number;
  preview: string | null;
  created_at: string;
  updated_at: string;
}

function toFull(row: DbGlazing): GlazingFull {
  return {
    id: row.id,
    org_id: row.org_id,
    client_id: row.client_id,
    name: row.name,
    data: row.data,
    total_cost: Number(row.total_cost) || 0,
    preview: row.preview,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toSummary(row: DbGlazing): GlazingSummary {
  // Считаем сегменты и рамы для отображения в карточке.
  // Берём из всех проектов внутри data.projects[].
  let segments = 0;
  let frames = 0;
  if (row.data?.projects) {
    for (const p of row.data.projects) {
      segments += p.segments?.length ?? 0;
      for (const s of p.segments ?? []) {
        frames += s.frames?.length ?? 0;
      }
    }
  }
  return {
    id: row.id,
    name: row.name,
    total_cost: Number(row.total_cost) || 0,
    preview: row.preview,
    client_id: row.client_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    segment_count: segments,
    frame_count: frames,
  };
}

// ═══════════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════════

/** Получить все проекты остекления клиента (для сетки в ClientGlazings). */
export async function listGlazingsByClient(clientId: string): Promise<GlazingSummary[]> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const { data, error } = await supabase
    .from('glazings')
    .select('id, org_id, client_id, name, data, total_cost, preview, created_at, updated_at')
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => toSummary(row as DbGlazing));
}

/**
 * Получить все проекты остекления организации (для GlazingListPage).
 * Возвращает summary + имя клиента (через JOIN на clients).
 */
export interface GlazingSummaryWithClient extends GlazingSummary {
  client_name: string | null;
}

export async function listAllGlazings(): Promise<GlazingSummaryWithClient[]> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const { data, error } = await supabase
    .from('glazings')
    .select(`
      id, org_id, client_id, name, data, total_cost, preview, created_at, updated_at,
      clients ( name )
    `)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => {
    const summary = toSummary(row as DbGlazing);
    // supabase возвращает clients как объект (если single relation) или массив
    let clientName: string | null = null;
    const c = (row as unknown as { clients: { name: string } | { name: string }[] | null }).clients;
    if (c) {
      if (Array.isArray(c)) {
        clientName = c[0]?.name ?? null;
      } else {
        clientName = c.name ?? null;
      }
    }
    return { ...summary, client_name: clientName };
  });
}

/** Загрузить полные данные одного проекта по id. */
export async function loadGlazingById(glazingId: string): Promise<GlazingFull> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const { data, error } = await supabase
    .from('glazings')
    .select('*')
    .eq('id', glazingId)
    .eq('org_id', orgId)
    .single();

  if (error) throw error;
  if (!data) throw new Error(`Проект остекления ${glazingId} не найден`);
  return toFull(data as DbGlazing);
}

// ═══════════════════════════════════════════════════════════════════
// CREATE / UPDATE / DELETE
// ═══════════════════════════════════════════════════════════════════

/**
 * Создать новый проект остекления.
 * Если clientId передан — проект сразу привязан к клиенту.
 * Если null — это черновик (но в новой архитектуре черновики не используются).
 */
export async function createGlazing(params: {
  clientId: string | null;
  name?: string;
  data: GlazingFormData;
  totalCost?: number;
  preview?: string | null;
}): Promise<GlazingFull> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const { data, error } = await supabase
    .from('glazings')
    .insert({
      org_id: orgId,
      client_id: params.clientId,
      name: params.name || 'Без названия',
      data: params.data,
      total_cost: params.totalCost ?? 0,
      preview: params.preview ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return toFull(data as DbGlazing);
}

/**
 * Сохранить (UPDATE) проект.
 *
 * @param glazingId — ID проекта
 * @param patch — поля для обновления (имя, данные, цена, превью)
 */
export async function saveGlazing(
  glazingId: string,
  patch: Partial<{
    name: string;
    data: GlazingFormData;
    total_cost: number;
    preview: string | null;
    client_id: string | null;
  }>,
): Promise<GlazingFull> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const { data, error } = await supabase
    .from('glazings')
    .update(patch)
    .eq('id', glazingId)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) throw error;
  return toFull(data as DbGlazing);
}

/** Удалить проект остекления. */
export async function deleteGlazing(glazingId: string): Promise<void> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const { error } = await supabase
    .from('glazings')
    .delete()
    .eq('id', glazingId)
    .eq('org_id', orgId);

  if (error) throw error;
}
