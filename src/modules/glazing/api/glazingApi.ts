import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';
import {
  loadCategories, loadMaterials,
  type RefCategory, type RefMaterial,
} from '@modules/reference/api/referenceApi';
import type { GlazingFormData } from '../types';

// ═══════════════════════════════════════════════════════════════════
// Glazing API.
// Источник материалов — общий справочник (material_categories + materials)
// с фильтром module_scope IN ('glazing', 'both').
// ═══════════════════════════════════════════════════════════════════

// ── Имена категорий, которые ищет UI остекления ───────────────────
// Они должны совпадать с теми, что создаёт миграция 013_glazing_seed.sql.
export const GLAZING_CATEGORY_NAMES = {
  profiles:    'Профильные системы',
  glass:       'Стеклопакеты',
  hardware:    'Фурнитура',
  sills:       'Подоконники',
  ebbs:        'Отливы',
  mosquito:    'Москитные сетки',
  laminationIn:  'Ламинация внутренняя',
  laminationOut: 'Ламинация внешняя',
  addons:      'Дополнения по размеру',
  connectors:  'Соединительные профили',
  bones:       'Кости (усиленные соединители)',
  extensions:  'Доборные профили',
  overlaps:    'Нащельники',
  works:       'Работы (остекление)',
  miscs:       'Расходники монтажа',
} as const;

export type GlazingCategoryKey = keyof typeof GLAZING_CATEGORY_NAMES;

// ── Тип для удобной работы в UI: категория + её материалы ─────────
export interface GlazingCategoryWithItems {
  category: RefCategory;
  materials: RefMaterial[];
}

/**
 * Загружает все категории и материалы для модуля остекления,
 * группирует материалы по категориям и возвращает map по «логическому» ключу
 * (profiles, glass, hardware, ...).
 *
 * Использование в UI:
 *   const data = await loadGlazingReference();
 *   const profiles = data.profiles?.materials ?? [];
 */
export async function loadGlazingReference(): Promise<
  Partial<Record<GlazingCategoryKey, GlazingCategoryWithItems>>
> {
  // Параллельно загружаем категории (только glazing/both) и все glazing-материалы.
  const cats = await loadCategories('glazing');
  const catIds = cats.map((c) => c.id);
  const mats = catIds.length ? await loadMaterials(catIds) : [];

  // Раскладываем материалы по категориям.
  const byCat = new Map<string, RefMaterial[]>();
  for (const m of mats) {
    if (!m.category_id) continue;
    if (!byCat.has(m.category_id)) byCat.set(m.category_id, []);
    byCat.get(m.category_id)!.push(m);
  }

  // Маппим имена категорий обратно на логические ключи.
  const result: Partial<Record<GlazingCategoryKey, GlazingCategoryWithItems>> = {};
  for (const cat of cats) {
    const key = (Object.entries(GLAZING_CATEGORY_NAMES)
      .find(([, name]) => name === cat.name)?.[0]) as GlazingCategoryKey | undefined;
    if (key) {
      result[key] = {
        category: cat,
        materials: byCat.get(cat.id) ?? [],
      };
    }
  }

  return result;
}

/**
 * Утилита: проверить, что справочник заполнен (есть ли хотя бы
 * профильные системы и стеклопакеты). Если нет — UI покажет
 * подсказку «Прогоните миграцию 013_glazing_seed.sql».
 */
export function isReferenceReady(
  ref: Partial<Record<GlazingCategoryKey, GlazingCategoryWithItems>>
): boolean {
  return (
    (ref.profiles?.materials.length ?? 0) > 0 &&
    (ref.glass?.materials.length ?? 0) > 0
  );
}

// ═══════════════════════════════════════════════════════════════════
// Сохранение / загрузка проекта остекления внутри orders.form_data
// ═══════════════════════════════════════════════════════════════════

/**
 * Загружает glazing-данные из orders.form_data для конкретного заказа.
 * Возвращает null если для заказа ещё ничего не сохранено.
 */
export async function loadGlazingByOrder(orderId: string): Promise<GlazingFormData | null> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  const { data, error } = await supabase
    .from('orders')
    .select('form_data')
    .eq('id', orderId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const fd = data.form_data as Record<string, unknown> | null;
  if (!fd || typeof fd !== 'object') return null;

  const glazing = (fd as { glazing?: unknown }).glazing;
  if (!glazing || typeof glazing !== 'object') return null;

  return glazing as GlazingFormData;
}

/**
 * Сохраняет glazing-данные в orders.form_data.glazing.
 * Не перезаписывает другие поля form_data (calculator и т.д.).
 */
export async function saveGlazingForOrder(
  orderId: string,
  glazing: GlazingFormData
): Promise<void> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Нет организации');

  // Сначала читаем текущий form_data чтобы не затереть другие модули.
  const { data: current, error: readErr } = await supabase
    .from('orders')
    .select('form_data')
    .eq('id', orderId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (readErr) throw readErr;

  const merged = {
    ...((current?.form_data as Record<string, unknown>) || {}),
    glazing,
  };

  const { error } = await supabase
    .from('orders')
    .update({ form_data: merged })
    .eq('id', orderId)
    .eq('org_id', orgId);

  if (error) throw error;
}
