import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';
import type { Segment, Corner } from '../types';

// ═══════════════════════════════════════════════════════════════════
// glazingTemplatesApi.ts — CRUD пользовательских шаблонов остекления.
//
// Шаблон — это сохранённая ГЕОМЕТРИЯ проекта (рамы, импосты, ячейки,
// кости, углы) без config'а (профиль, стеклопакет — настраивается
// отдельно для каждого заказа).
//
// Хранится в таблице public.glazing_templates с RLS-политикой
// «видят только участники своей организации».
// ═══════════════════════════════════════════════════════════════════

export type ConstructionType = 'window' | 'balcony' | 'balcony_block' | 'loggia';

export interface GlazingTemplateGeometry {
  segments: Segment[];
  corners: Corner[];
}

export interface UserTemplate {
  id: string;
  orgId: string;
  name: string;
  constructionType: ConstructionType;
  geometry: GlazingTemplateGeometry;
  createdAt: string;
  updatedAt: string;
}

interface DbTemplate {
  id: string;
  org_id: string;
  name: string;
  construction_type: ConstructionType;
  geometry: GlazingTemplateGeometry;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

function toDomain(row: DbTemplate): UserTemplate {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    constructionType: row.construction_type,
    geometry: row.geometry,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Загрузить все пользовательские шаблоны организации.
 * Сортировка: сначала самые свежие.
 */
export async function loadUserTemplates(): Promise<UserTemplate[]> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const { data, error } = await supabase
    .from('glazing_templates')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toDomain);
}

/**
 * Создать новый шаблон.
 *
 * @param name — название (например «Балкон 4 створки»)
 * @param constructionType — тип конструкции
 * @param geometry — геометрия (сегменты + углы)
 * @returns созданный шаблон с присвоенным id
 */
export async function createUserTemplate(
  name: string,
  constructionType: ConstructionType,
  geometry: GlazingTemplateGeometry,
): Promise<UserTemplate> {
  const orgId = useAuthStore.getState().organization?.id;
  const userId = useAuthStore.getState().user?.id;
  if (!orgId) throw new Error('Нет организации');

  const { data, error } = await supabase
    .from('glazing_templates')
    .insert({
      org_id: orgId,
      name,
      construction_type: constructionType,
      geometry,
      created_by: userId ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return toDomain(data as DbTemplate);
}

/**
 * Удалить шаблон по id (только если он принадлежит этой организации,
 * RLS-политика на стороне БД защищает от чужих).
 */
export async function deleteUserTemplate(templateId: string): Promise<void> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const { error } = await supabase
    .from('glazing_templates')
    .delete()
    .eq('id', templateId)
    .eq('org_id', orgId);

  if (error) throw error;
}

/**
 * Обновить шаблон (например переименовать или изменить тип).
 */
export async function updateUserTemplate(
  templateId: string,
  patch: Partial<{ name: string; constructionType: ConstructionType; geometry: GlazingTemplateGeometry }>
): Promise<UserTemplate> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.constructionType !== undefined) update.construction_type = patch.constructionType;
  if (patch.geometry !== undefined) update.geometry = patch.geometry;

  const { data, error } = await supabase
    .from('glazing_templates')
    .update(update)
    .eq('id', templateId)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) throw error;
  return toDomain(data as DbTemplate);
}
