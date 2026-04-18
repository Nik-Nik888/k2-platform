import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';

// ── Типы ────────────────────────────────────────────────
export interface Material {
  id: string;
  name: string;
  unit: string;
  price: number;
  description: string | null; // dimensions string like "3000*96"
  sku: string | null;
}

export interface Category {
  id: number;
  tab_id: string;
  name: string;
  sort_order: number;
}

export interface CategoryOption {
  id: number;
  category_id: number;
  name: string;
  sort_order: number;
}

export interface OptionMaterial {
  id: number;
  option_id: number;
  material_id: string;
  quantity: number;
  visible: boolean;
  calc_mode: string;
  cross_direction: boolean; // true = направление поперёк отделки (для каркаса)
  materials?: Material;
}

export interface CalcDB {
  materials: Material[];
  categories: Category[];
  options: CategoryOption[];
  optionMaterials: OptionMaterial[];
}

// ── Вкладки ─────────────────────────────────────────────
export const TABS = [
  { id: 'arrival', label: 'На заезд', icon: '🚛' },
  { id: 'glazing', label: 'Остекление', icon: '🪟' },
  { id: 'main_wall', label: 'Главная стена', icon: '🧱' },
  { id: 'facade_wall', label: 'Фасадная стена', icon: '🏢' },
  { id: 'bl_wall', label: 'БЛ стена', icon: '◧' },
  { id: 'bp_wall', label: 'БП стена', icon: '◨' },
  { id: 'ceiling', label: 'Потолок', icon: '⬆' },
  { id: 'floor', label: 'Полы', icon: '⬇' },
  { id: 'electric', label: 'Электрика', icon: '⚡' },
  { id: 'furniture', label: 'Мебель', icon: '🪑' },
  { id: 'extras', label: 'Доп. параметр', icon: '➕' },
];

export const SURFACE_IDS = ['main_wall', 'facade_wall', 'bl_wall', 'bp_wall', 'ceiling', 'floor'];

// ── Загрузка данных ─────────────────────────────────────
export async function loadCalcData(): Promise<CalcDB> {
  const orgId = useAuthStore.getState().organization?.id;

  const [mR, cR, oR, omR] = await Promise.all([
    supabase.from('materials').select('*').eq('org_id', orgId).order('name'),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('category_options').select('*').order('sort_order'),
    supabase.from('option_materials').select('*, materials(*)'),
  ]);

  if (mR.error) throw mR.error;
  if (cR.error) throw cR.error;
  if (oR.error) throw oR.error;
  if (omR.error) throw omR.error;

  return {
    materials: mR.data || [],
    categories: cR.data || [],
    options: oR.data || [],
    optionMaterials: omR.data || [],
  };
}

// ── Утилиты расчётов ────────────────────────────────────
export function parseDims(s: string | null | undefined): { d: number; s: number } {
  if (!s) return { d: 0, s: 0 };
  const p = String(s).replace(/\s/g, '').split(/[x*×хХ]/i).map(Number).filter(n => n > 0);
  return { d: p[0] || 0, s: p[1] || 0 };
}

export function calcMatQty(
  heightMm: number, widthMm: number, matDims: string | null | undefined,
  direction: string, isLinear?: boolean | null
): number {
  const md = parseDims(matDims);
  if (md.s <= 0) return 0;
  const linear = isLinear === undefined || isLinear === null ? true : isLinear;
  const matLength = md.d || 3000;
  const matWidth = md.s;

  if (linear) {
    const dir = direction || 'vertical';
    let spanDim: number, crossDim: number;
    if (dir === 'vertical') { spanDim = heightMm; crossDim = widthMm; }
    else { spanDim = widthMm; crossDim = heightMm; }
    const strips = Math.ceil(crossDim / matWidth);
    const piecesPerStrip = Math.ceil(spanDim / matLength);
    return strips * piecesPerStrip;
  } else {
    const wallArea = (heightMm / 1000) * (widthMm / 1000);
    const matArea = (matLength / 1000) * (matWidth / 1000);
    if (matArea <= 0) return 0;
    return Math.ceil(wallArea / matArea * 1.1);
  }
}

export function calcInsulation(areaSqm: number): number {
  const sheetArea = 1.2 * 0.6;
  return Math.ceil(areaSqm / sheetArea);
}

// Режимы расчёта.
// 'step' — умная резка рейки на равные части (1/2, 1/3, 1/4...) с учётом
// стыковки если полоса длиннее рейки. Направление инвертируется через
// отдельный флаг cross_direction (не через отдельный режим).
export const CALC_MODE_LABELS: Record<string, string> = {
  perim: '📐 периметр',
  width: '↔ низ',
  width_top: '↔ верх',
  height: '↕ бок×2',
  fixed: '🔢 фикс.',
  per_sqm: '📐 м²',
  step: '📊 шаг расстановки',
  area_sheet: '📐 лист',
};

export interface CalcResult {
  qty: number;
  hint: string;
}

// ══════════════════════════════════════════════════════════
// calcRails — универсальный расчёт реек для шага расстановки.
//
// Логика:
// 1. Считаем полосы: stripsCount = floor(поперечный размер / шаг) + 1
// 2. Для каждой полосы длиной stripLen нужен материал длиной railLen.
// 3. Если полоса помещается в рейку (stripLen ≤ railLen):
//    - Рейку можно порезать на РАВНЫЕ части: 1/1, 1/2, 1/3, ...
//    - Берём самую короткую часть, которой хватит: ceil(railLen / stripLen) частей с рейки
//    - Одной рейки хватит на floor(railLen / stripLen) полос
//    - Итого реек: ceil(полос / часть_на_рейку)
// 4. Если полоса больше рейки (stripLen > railLen):
//    - На каждую полосу идёт ≥1 целая рейка плюс остаток.
//    - Для остатка — тот же алгоритм (рекурсивно).
//
// Возвращает { qty: число реек, hint: текстовое объяснение }.
// ══════════════════════════════════════════════════════════
export function calcRails(
  stripsCount: number,
  stripLenMm: number,
  railLenMm: number
): { qty: number; hint: string } {
  if (stripsCount <= 0 || stripLenMm <= 0) {
    return { qty: 0, hint: '' };
  }
  if (railLenMm <= 0) {
    // Длина рейки неизвестна — fallback: одна рейка на полосу
    return { qty: stripsCount, hint: '⚠️ укажите длину рейки; принято 1 рейка/полоса' };
  }

  // Случай 1: полоса ≤ рейки — можно делить рейку на части
  if (stripLenMm <= railLenMm) {
    const partsPerRail = Math.floor(railLenMm / stripLenMm);
    const rails = Math.ceil(stripsCount / partsPerRail);
    const partLen = (stripLenMm / 1000).toFixed(2);
    const railLenM = (railLenMm / 1000).toFixed(1);
    return {
      qty: rails,
      hint: `${stripsCount} полос × ${partLen}м; рейка ${railLenM}м даёт ${partsPerRail} часть(ей) → ${rails} рейк${rails === 1 ? 'а' : 'и'}`,
    };
  }

  // Случай 2: полоса длиннее рейки — нужна стыковка
  // На каждую полосу: целая рейка + остаток. Остаток считаем рекурсивно.
  const fullRailsPerStrip = Math.floor(stripLenMm / railLenMm);
  const remainderLen = stripLenMm - fullRailsPerStrip * railLenMm;
  const fullRails = stripsCount * fullRailsPerStrip;

  if (remainderLen <= 0) {
    // Полоса делится на целые рейки без остатка
    return {
      qty: fullRails,
      hint: `${stripsCount} полос × ${fullRailsPerStrip} целых реек = ${fullRails} шт.`,
    };
  }

  // Для остатков применяем ту же логику (они помещаются в рейку)
  const remainderResult = calcRails(stripsCount, remainderLen, railLenMm);
  const total = fullRails + remainderResult.qty;
  const remM = (remainderLen / 1000).toFixed(2);

  return {
    qty: total,
    hint: `${stripsCount} полос × (${fullRailsPerStrip} целых + остаток ${remM}м): ${fullRails} целых + ${remainderResult.qty} на остатки = ${total} шт.`,
  };
}

export function calcByMode(
  baseQty: number, mode: string, mat: Material | undefined,
  hMm: number, wMm: number, direction: string,
  crossDirection = false
): CalcResult {
  if (!baseQty || baseQty <= 0) return { qty: 0, hint: '' };
  const hM = hMm / 1000;
  const wM = wMm / 1000;
  const perimM = hM > 0 && wM > 0 ? 2 * (hM + wM) : 0;
  const areaSqm = hM * wM;

  const md = parseDims(mat?.description);
  const matLenMm = md.d > 0 ? md.d : 0;
  const matLen = matLenMm / 1000;

  const toSht = (pm: number) => {
    if (pm <= 0) return 0;
    return matLen > 0 ? Math.ceil(pm / matLen) : Math.ceil(pm);
  };

  if (mode === 'fixed') return { qty: baseQty, hint: baseQty + ' шт. (фикс.)' };

  if (mode === 'width' || mode === 'width_top') {
    const pm = baseQty * wM;
    const sht = toSht(pm);
    return { qty: sht, hint: baseQty + '/м × ' + wM.toFixed(1) + 'м = ' + pm.toFixed(1) + 'п.м. → ' + sht + 'шт.' };
  }
  if (mode === 'height') {
    const pm = baseQty * hM * 2;
    const sht = toSht(pm);
    return { qty: sht, hint: baseQty + '/м × ' + hM.toFixed(1) + 'м × 2бок = ' + pm.toFixed(1) + 'п.м. → ' + sht + 'шт.' };
  }
  if (mode === 'per_sqm') {
    const q = Math.ceil(baseQty * areaSqm);
    return { qty: q, hint: baseQty + '/м² × ' + areaSqm.toFixed(2) + 'м² = ' + q + 'шт.' };
  }
  if (mode === 'step') {
    // Шаг расстановки. Если crossDirection=true — направление инвертируется
    // (каркас под чистовую отделку идёт поперёк).
    const stepMm = baseQty;
    const effDir = crossDirection
      ? (direction === 'vertical' ? 'horizontal' : 'vertical')
      : direction;

    let strips: number, stripLen: number;
    if (effDir === 'vertical') {
      strips = Math.floor(wMm / stepMm) + 1;
      stripLen = hMm;
    } else {
      strips = Math.floor(hMm / stepMm) + 1;
      stripLen = wMm;
    }

    const r = calcRails(strips, stripLen, matLenMm);
    const prefix = crossDirection ? '⟂ поперёк отделки: ' : '';
    return { qty: r.qty, hint: prefix + `шаг ${stepMm}мм → ` + r.hint };
  }
  if (mode === 'area_sheet') {
    const matAreaSqm = md.d * md.s / 1e6;
    if (matAreaSqm > 0 && areaSqm > 0) {
      const q = Math.ceil(areaSqm / matAreaSqm * 1.1 * baseQty);
      return { qty: q, hint: areaSqm.toFixed(2) + 'м² ÷ ' + matAreaSqm.toFixed(3) + 'м² ×1.1 = ' + q + 'шт.' };
    }
    return { qty: baseQty, hint: '⚠️ укажите размеры материала' };
  }
  // perim (default)
  const pm = baseQty * perimM;
  const sht = toSht(pm);
  return { qty: sht, hint: baseQty + '/м × P' + perimM.toFixed(1) + 'м = ' + pm.toFixed(1) + 'п.м. → ' + sht + 'шт.' };
}
