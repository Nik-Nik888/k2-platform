import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';

// ── Типы ────────────────────────────────────────────────

/** Корпус шкафа (габариты). */
export interface CabinetCorpus {
  width: number;
  height: number;
  depth: number;
  thickness: number;
}

/** Запись о шкафе в БД. */
export interface CabinetRow {
  id: string;
  org_id: string;
  client_id: string | null;
  name: string;
  corpus: CabinetCorpus;
  elements: any[];
  corpus_texture_id: string | null;
  facade_texture_id: string | null;
  preview: string | null;  // base64 PNG для миниатюры (опционально)
  created_at: string;
  updated_at: string;
}

/** Сводка для списка (без тяжёлого preview). */
export interface CabinetSummary {
  id: string;
  name: string;
  corpus: CabinetCorpus;
  client_id: string | null;
  client_name?: string;  // подгружается через join
  preview: string | null;
  element_count: number;
  created_at: string;
  updated_at: string;
}

// ── Список шкафов ─────────────────────────────────────────
export async function listCabinets(): Promise<CabinetSummary[]> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('No organization');

  // JOIN с clients чтобы сразу получить имя клиента — без второго запроса.
  // foreign key: cabinets.client_id → clients.id
  const { data, error } = await supabase
    .from('cabinets')
    .select('id, name, corpus, client_id, preview, elements, created_at, updated_at, clients(name)')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    corpus: row.corpus,
    client_id: row.client_id,
    client_name: row.clients?.name ?? undefined,
    preview: row.preview,
    element_count: Array.isArray(row.elements) ? row.elements.length : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

// ── Список шкафов конкретного клиента (для карточки клиента в CRM) ───
export async function listCabinetsByClient(clientId: string): Promise<CabinetSummary[]> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('No organization');

  const { data, error } = await supabase
    .from('cabinets')
    .select('id, name, corpus, client_id, preview, elements, created_at, updated_at')
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    corpus: row.corpus,
    client_id: row.client_id,
    preview: row.preview,
    element_count: Array.isArray(row.elements) ? row.elements.length : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

// ── Загрузка одного шкафа ────────────────────────────────
export async function loadCabinet(id: string): Promise<CabinetRow> {
  const { data, error } = await supabase
    .from('cabinets')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as CabinetRow;
}

// ── Создание ─────────────────────────────────────────────
export async function createCabinet(payload: {
  name: string;
  corpus: CabinetCorpus;
  elements: any[];
  client_id?: string | null;
  corpus_texture_id?: string | null;
  facade_texture_id?: string | null;
  preview?: string | null;
}): Promise<CabinetRow> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('No organization');

  const { data, error } = await supabase
    .from('cabinets')
    .insert({
      org_id: orgId,
      name: payload.name,
      corpus: payload.corpus,
      elements: payload.elements,
      client_id: payload.client_id ?? null,
      corpus_texture_id: payload.corpus_texture_id ?? null,
      facade_texture_id: payload.facade_texture_id ?? null,
      preview: payload.preview ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as CabinetRow;
}

// ── Обновление ───────────────────────────────────────────
export async function updateCabinet(id: string, patch: Partial<{
  name: string;
  corpus: CabinetCorpus;
  elements: any[];
  client_id: string | null;
  corpus_texture_id: string | null;
  facade_texture_id: string | null;
  preview: string | null;
}>): Promise<CabinetRow> {
  const { data, error } = await supabase
    .from('cabinets')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as CabinetRow;
}

// ── Удаление ─────────────────────────────────────────────
export async function deleteCabinet(id: string): Promise<void> {
  const { error } = await supabase
    .from('cabinets')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
