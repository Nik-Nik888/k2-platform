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

// Режимы расчёта
export const CALC_MODE_LABELS: Record<string, string> = {
  perim: '📐периметр',
  width: '↔низ',
  width_top: '↔верх',
  height: '↕бок×2',
  fixed: '🔢фикс.',
  per_sqm: '📐м²',
  step: '📊шаг',
  area_sheet: '📐лист',
};

export interface CalcResult {
  qty: number;
  hint: string;
}

export function calcByMode(
  baseQty: number, mode: string, mat: Material | undefined,
  hMm: number, wMm: number, direction: string
): CalcResult {
  if (!baseQty || baseQty <= 0) return { qty: 0, hint: '' };
  const hM = hMm / 1000;
  const wM = wMm / 1000;
  const perimM = hM > 0 && wM > 0 ? 2 * (hM + wM) : 0;
  const areaSqm = hM * wM;

  const md = parseDims(mat?.description);
  const matLen = md.d > 0 ? md.d / 1000 : 0;

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
    if (baseQty <= 0) return { qty: 0, hint: '' };
    const stepMm = baseQty;
    let strips: number, stripLen: number;
    if (direction === 'vertical') { strips = Math.floor(wMm / stepMm) + 1; stripLen = hMm; }
    else { strips = Math.floor(hMm / stepMm) + 1; stripLen = wMm; }
    const totalM = strips * stripLen / 1000;
    const sht = toSht(totalM);
    return { qty: sht, hint: 'шаг ' + stepMm + 'мм → ' + strips + 'полос × ' + (stripLen / 1000).toFixed(1) + 'м = ' + totalM.toFixed(1) + 'п.м. → ' + sht + 'шт.' };
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
