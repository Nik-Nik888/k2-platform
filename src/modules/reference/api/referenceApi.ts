import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';

// ═══════════════════════════════════════════════════════════════════
// Reference API — единая точка работы со справочником материалов.
//
// Данные хранятся в существующих таблицах material_categories и materials.
// Категории фильтруются по полю module_scope ('calc' | 'glazing' | 'both').
//
// Эта же таблица используется страницей /materials (плоский UI),
// но теперь у нас есть структурированный доступ по модулям.
// ═══════════════════════════════════════════════════════════════════

// ── Типы ────────────────────────────────────────────────────────────

export type ModuleScope = 'calc' | 'glazing' | 'both';

export interface RefCategory {
  id: string;
  org_id: string | null;       // null = системная категория
  name: string;
  icon: string;
  color: string;
  parent_id: string | null;
  sort_order: number;
  module_scope: ModuleScope;
}

export interface RefMaterial {
  id: string;
  org_id: string;
  name: string;
  category_id: string | null;
  unit: string;
  price: number;
  description: string | null;
  sku: string | null;
  type: string | null;
  created_at: string;
}

// ── Загрузка ────────────────────────────────────────────────────────

/**
 * Загружает категории справочника. Если scope не указан — возвращает все.
 * При scope='glazing' возвращает категории с module_scope IN ('glazing', 'both').
 * При scope='calc' — IN ('calc', 'both').
 */
export async function loadCategories(scope?: ModuleScope): Promise<RefCategory[]> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  let q = supabase
    .from('material_categories')
    .select('*')
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .order('sort_order');

  if (scope === 'glazing') {
    q = q.in('module_scope', ['glazing', 'both']);
  } else if (scope === 'calc') {
    q = q.in('module_scope', ['calc', 'both']);
  } else if (scope === 'both') {
    q = q.eq('module_scope', 'both');
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as RefCategory[];
}

/**
 * Загружает материалы. Можно отфильтровать по списку категорий
 * (например, только материалы из glazing-категорий).
 */
export async function loadMaterials(categoryIds?: string[]): Promise<RefMaterial[]> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  let q = supabase
    .from('materials')
    .select('*')
    .eq('org_id', orgId)
    .order('name');

  if (categoryIds && categoryIds.length > 0) {
    q = q.in('category_id', categoryIds);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as RefMaterial[];
}

// ── CRUD категорий ──────────────────────────────────────────────────

export async function createCategory(input: {
  name: string;
  icon: string;
  color: string;
  module_scope: ModuleScope;
  parent_id?: string | null;
}): Promise<RefCategory> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const { data, error } = await supabase
    .from('material_categories')
    .insert({
      org_id: orgId,
      name: input.name,
      icon: input.icon,
      color: input.color,
      module_scope: input.module_scope,
      parent_id: input.parent_id || null,
      sort_order: 999,
    })
    .select()
    .single();

  if (error) throw error;
  return data as RefCategory;
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<RefCategory, 'name' | 'icon' | 'color' | 'module_scope' | 'sort_order'>>
): Promise<void> {
  const { error } = await supabase
    .from('material_categories')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  // ВАЖНО: удалить можно только если в категории нет материалов.
  // Проверяем заранее, чтобы дать понятную ошибку.
  const { count, error: countErr } = await supabase
    .from('materials')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);

  if (countErr) throw countErr;
  if (count && count > 0) {
    throw new Error(
      `Нельзя удалить категорию: в ней ${count} материал(ов). ` +
      `Сначала перенесите или удалите их.`
    );
  }

  const { error } = await supabase
    .from('material_categories')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── CRUD материалов ─────────────────────────────────────────────────

export async function createMaterial(input: {
  name: string;
  category_id: string | null;
  unit: string;
  price: number;
  description?: string | null;
  sku?: string | null;
}): Promise<RefMaterial> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const { data, error } = await supabase
    .from('materials')
    .insert({
      org_id: orgId,
      name: input.name,
      category_id: input.category_id,
      unit: input.unit,
      price: input.price,
      description: input.description || null,
      sku: input.sku || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as RefMaterial;
}

export async function updateMaterial(
  id: string,
  patch: Partial<Omit<RefMaterial, 'id' | 'org_id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('materials')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase
    .from('materials')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Константы UI ────────────────────────────────────────────────────

export const SCOPE_LABELS: Record<ModuleScope, string> = {
  calc: 'Калькулятор',
  glazing: 'Остекление',
  both: 'Общее',
};

export const SCOPE_DESCRIPTIONS: Record<ModuleScope, string> = {
  calc: 'Категории для калькулятора материалов (отделка, стены, потолок и т.д.)',
  glazing: 'Категории для модуля остекления (профили, стеклопакеты, фурнитура)',
  both: 'Общие категории, доступные обоим модулям (работы, доставка)',
};

export const UNITS = ['шт.', 'п.м.', 'м²', 'л.', 'уп.', 'кг', 'компл.', 'рул.', 'усл.'];

export const ICONS = ['📦', '🔧', '🚛', '⬆️', '🔩', '🪟', '🧱', '⚡', '🎨', '🪑', '🔨', '🧰', '📐', '🪵', '🧲'];

export const COLORS = [
  '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899',
  '#EF4444', '#06B6D4', '#6B7280', '#F97316', '#84CC16',
];
