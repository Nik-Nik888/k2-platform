import {
  TABS, SURFACE_IDS, parseDims, calcMatQty, calcInsulation,
} from '@modules/calculator/api/calcApi';
import type { CalcDB, Material } from '@modules/calculator/api/calcApi';
import type { FurnitureItem, WindowItem } from '@store/calcStore';

// ── Типы результатов ────────────────────────────────────
export interface ResultItem {
  name: string;
  qty: number;
  unit: string;
  price: number;
  cost: number;
  auto: boolean;
  isInfo?: boolean;
}

export type CalcResults = Record<string, ResultItem[]>;

// ── Утилита: п.м. → штуки (для длиномеров) ─────────────
function toSht(pm: number, mat: Material | undefined): number {
  if (pm <= 0) return 0;
  const md = parseDims(mat?.description);
  return md.d > 0 ? Math.ceil(pm / (md.d / 1000)) : Math.ceil(pm);
}

// ── Универсальный расчёт по calc_mode ───────────────────
function calcByModeNum(
  baseQty: number, mode: string, mat: Material | undefined,
  hMm: number, wMm: number, direction?: string
): number {
  if (!baseQty || baseQty <= 0) return 0;
  const hM = hMm / 1000;
  const wM = wMm / 1000;
  const perimM = hM > 0 && wM > 0 ? 2 * (hM + wM) : 0;
  const areaSqm = hM * wM;

  if (mode === 'fixed') return baseQty;
  if (mode === 'width' || mode === 'width_top') return toSht(baseQty * wM, mat);
  if (mode === 'height') return toSht(baseQty * hM * 2, mat);
  if (mode === 'per_sqm') return Math.ceil(baseQty * areaSqm);
  if (mode === 'step') {
    const dir = direction || 'vertical';
    let strips: number, stripLen: number;
    if (dir === 'vertical') { strips = Math.floor(wMm / baseQty) + 1; stripLen = hMm; }
    else { strips = Math.floor(hMm / baseQty) + 1; stripLen = wMm; }
    return toSht(strips * stripLen / 1000, mat);
  }
  if (mode === 'step_whole') {
    // Нестыкуемые рейки: целое число реек на каждую полосу отдельно.
    const dir = direction || 'vertical';
    let strips: number, stripLen: number;
    if (dir === 'vertical') { strips = Math.floor(wMm / baseQty) + 1; stripLen = hMm; }
    else { strips = Math.floor(hMm / baseQty) + 1; stripLen = wMm; }
    const md = parseDims(mat?.description);
    const matLenM = md.d > 0 ? md.d / 1000 : 0;
    if (matLenM <= 0) return strips; // нет длины материала — возвращаем хотя бы число полос
    const perStrip = Math.ceil((stripLen / 1000) / matLenM);
    return strips * perStrip;
  }
  // ⟂-режимы: каркас под отделку — направление инвертировано
  if (mode === 'step_cross') {
    const inverted = (direction || 'vertical') === 'vertical' ? 'horizontal' : 'vertical';
    return calcByModeNum(baseQty, 'step', mat, hMm, wMm, inverted);
  }
  if (mode === 'step_whole_cross') {
    const inverted = (direction || 'vertical') === 'vertical' ? 'horizontal' : 'vertical';
    return calcByModeNum(baseQty, 'step_whole', mat, hMm, wMm, inverted);
  }
  if (mode === 'area_sheet') {
    const md = parseDims(mat?.description);
    const ma = md.d * md.s / 1e6;
    if (ma > 0 && areaSqm > 0) return Math.ceil(areaSqm / ma * 1.1 * baseQty);
    return baseQty;
  }
  // perim (default)
  return toSht(baseQty * perimM, mat);
}

// ════════════════════════════════════════════════════════
// doCalc — главный расчёт
// ════════════════════════════════════════════════════════

export function doCalc(
  sel: Record<string, Record<string, unknown>>,
  db: CalcDB
): CalcResults {
  const res: CalcResults = {};

  TABS.forEach((tab) => {
    const items: ResultItem[] = [];
    const ts = sel[tab.id] || {};
    const dims = (ts._dims as Record<string, number>) || {};
    const direction = (ts._dir as string) || 'vertical';
    const isSurface = SURFACE_IDS.includes(tab.id);
    const isMainWall = tab.id === 'main_wall';
    const heightMm = dims.height || 0;
    const widthMm = dims.length || 0;
    const rawAreaSqm = (heightMm / 1000) * (widthMm / 1000);

    const hasWindow = isMainWall && !!ts._hasWindow;
    const mwDoorH = (ts._mwBbDoorH as number) || 2100;
    const mwDoorW = (ts._mwBbDoorW as number) || 700;
    const mwWinH = (ts._mwBbWinH as number) || 1400;
    const mwWinW = (ts._mwBbWinW as number) || 900;
    const windowAreaSqm = (mwDoorH / 1000) * (mwDoorW / 1000) + (mwWinH / 1000) * (mwWinW / 1000);
    const areaSqm = hasWindow ? Math.max(0, rawAreaSqm - windowAreaSqm) : rawAreaSqm;

    // Удалённые материалы
    const isRm = (catId: number, omId: number) => !!ts['_rm_' + catId + '_' + omId];
    // Пользовательское кол-во
    const uq = (catId: number, matId: string) => {
      const v = ts['_q_' + catId + '_' + matId];
      return v !== undefined ? Number(v) : undefined;
    };

    // ══════════════════════════════════════════════════
    // Остекление
    // ══════════════════════════════════════════════════
    if (tab.id === 'glazing') {
      const tabCats = db.categories.filter((c) => c.tab_id === 'glazing');

      // Обработка привязанных материалов для категории
      const processCatMats = (catNamePart: string, hMm: number, wMm: number, label?: string) => {
        const cat = tabCats.find((c) => c.name.toLowerCase().includes(catNamePart));
        if (!cat) return;
        const optId = ts[cat.id] as number | undefined;
        if (!optId) return;
        const opt = db.options.find((o) => o.id === optId);
        if (!opt || opt.name === 'Нет' || opt.name === 'НЕТ') return;
        if (label) items.push({ name: label + ': ' + opt.name, qty: 1, unit: 'компл.', price: 0, cost: 0, auto: false, isInfo: true });

        db.optionMaterials.filter((om) => om.option_id === optId).forEach((om) => {
          const mat = om.materials;
          if (!mat) return;
          if (isRm(cat.id, om.id)) return;
          const base = om.quantity || 0;
          const mode = om.calc_mode || 'fixed';
          const autoQty = calcByModeNum(base, mode, mat, hMm, wMm);
          const userQty = uq(cat.id, om.material_id);
          const qty = userQty !== undefined ? userQty : autoQty;
          if (qty > 0) items.push({ name: mat.name, qty, unit: mat.unit, price: mat.price || 0, cost: qty * (mat.price || 0), auto: !om.visible });
        });
      };

      // Основная Рама
      const gd = (ts._glazingDims as Record<string, number>) || { height: 0, length: 0 };
      processCatMats('основная рама', gd.height || 0, gd.length || 0, 'Остекление');

      // Замена балконного блока
      const bbCat = tabCats.find((c) => c.name.toLowerCase().includes('балконн'));
      if (bbCat) {
        const bbOptId = ts[bbCat.id] as number | undefined;
        const bbOpt = bbOptId ? db.options.find((o) => o.id === bbOptId) : null;
        if (bbOpt && bbOpt.name !== 'Нет' && bbOpt.name !== 'НЕТ') {
          const doorH = (ts._bbDoorH as number) || 2100;
          const doorW = (ts._bbDoorW as number) || 700;
          const winH2 = (ts._bbWinH as number) || 1400;
          const winW2 = (ts._bbWinW as number) || 900;
          const maxH = Math.max(doorH, winH2);
          const totalW = doorW + winW2;
          items.push({ name: 'Замена балк.блока', qty: 1, unit: 'компл.', price: 0, cost: 0, auto: false, isInfo: true });

          db.optionMaterials.filter((om) => om.option_id === bbOptId!).forEach((om) => {
            const mat = om.materials;
            if (!mat) return;
            if (isRm(bbCat.id, om.id)) return;
            const base = om.quantity || 0;
            const mode = om.calc_mode || 'fixed';
            const autoQty = calcByModeNum(base, mode, mat, maxH, totalW);
            const userQty = uq(bbCat.id, om.material_id);
            const qty = userQty !== undefined ? userQty : autoQty;
            if (qty > 0) items.push({ name: mat.name, qty, unit: mat.unit, price: mat.price || 0, cost: qty * (mat.price || 0), auto: !om.visible });
          });
        }
      }

      // Окна — массив
      const winCat = tabCats.find((c) => {
        const n = c.name.toLowerCase();
        return n.includes('окно') && !n.includes('материалы') && !n.includes('балконн');
      });
      if (winCat) {
        const winOptId = ts[winCat.id] as number | undefined;
        const winOpt = winOptId ? db.options.find((o) => o.id === winOptId) : null;
        if (winOpt && winOpt.name !== 'Нет' && winOpt.name !== 'НЕТ') {
          const windows = (ts._windows as WindowItem[]) || [{ h: 1400, w: 1200 }];
          let totalP = 0, totalA = 0, totalW2 = 0, totalH2 = 0;
          windows.forEach((w) => {
            totalP += 2 * (w.h / 1000 + w.w / 1000);
            totalA += (w.h / 1000) * (w.w / 1000);
            totalW2 += w.w / 1000;
            totalH2 += w.h / 1000;
          });
          items.push({ name: 'Окна (' + windows.length + ' шт.)', qty: windows.length, unit: 'компл.', price: 0, cost: 0, auto: false, isInfo: true });

          db.optionMaterials.filter((om) => om.option_id === winOptId!).forEach((om) => {
            const mat = om.materials;
            if (!mat) return;
            if (isRm(winCat.id, om.id)) return;
            const base = om.quantity || 0;
            const mode = om.calc_mode || 'fixed';
            let qty = base;
            if (mode === 'fixed') qty = base * windows.length;
            else if (mode === 'perim') qty = toSht(base * totalP, mat);
            else if (mode === 'per_sqm') qty = Math.ceil(base * totalA);
            else if (mode === 'width' || mode === 'width_top') qty = toSht(base * totalW2, mat);
            else if (mode === 'height') qty = toSht(base * totalH2 * 2, mat);
            const userQty = uq(winCat.id, om.material_id);
            const q = userQty !== undefined ? userQty : qty;
            if (q > 0) items.push({ name: mat.name, qty: q, unit: mat.unit, price: mat.price || 0, cost: q * (mat.price || 0), auto: !om.visible });
          });
        }
      }

      // Крыша
      const roofCat = tabCats.find((c) => c.name.toLowerCase().includes('крыш'));
      if (roofCat) {
        const roofOptId = ts[roofCat.id] as number | undefined;
        const roofOpt = roofOptId ? db.options.find((o) => o.id === roofOptId) : null;
        if (roofOpt && roofOpt.name !== 'Нет' && roofOpt.name !== 'НЕТ') {
          const rd = (ts._roofDims as Record<string, number>) || { height: 0, length: 0 };
          processCatMats('крыш', rd.height || 0, rd.length || 0, 'Крыша');
        }
      }

      // Сайдинг
      const sidCat = tabCats.find((c) => c.name.toLowerCase().includes('сайдинг'));
      const sidOptId = sidCat ? (ts[sidCat.id] as number | undefined) : undefined;
      const sidOpt = sidOptId ? db.options.find((o) => o.id === sidOptId) : null;
      const sidName = (sidOpt?.name || '').toLowerCase();
      if (sidOpt && sidName !== 'нет' && sidName !== '') {
        const sDims = (ts._sidingDims as Record<string, number>) || { height: 0, length: 0 };
        const sH = sDims.height || 0;
        const sW = sDims.length || 0;
        const sArea = (sH / 1000) * (sW / 1000);
        if (sArea > 0) {
          db.optionMaterials.filter((om) => om.option_id === sidOpt.id).forEach((om) => {
            const mat = om.materials;
            if (!mat) return;
            const sDir = (ts._sidingDir as string) || 'horizontal';
            const qty = calcMatQty(sH, sW, mat.description, sDir);
            if (qty > 0) items.push({ name: mat.name + ' (сайдинг)', qty, unit: mat.unit, price: mat.price || 0, cost: qty * (mat.price || 0), auto: !om.visible });
          });
        }
      }
    }

    // ══════════════════════════════════════════════════
    // Мебель — массив позиций
    // ══════════════════════════════════════════════════
    if (tab.id === 'furniture') {
      const furnitureItems = (ts._furnitureItems as FurnitureItem[]) || [];
      furnitureItems.forEach((fi, idx) => {
        const names: string[] = [];
        Object.entries(fi.catSelections || {}).forEach(([, optId]) => {
          if (!optId) return;
          const opt = db.options.find((o) => o.id === Number(optId));
          if (opt && opt.name !== 'Нет') names.push(opt.name);
        });
        const label = names.join(' / ') || ('Позиция ' + (idx + 1));

        Object.entries(fi.catSelections || {}).forEach(([, optId]) => {
          if (!optId) return;
          const opt = db.options.find((o) => o.id === Number(optId));
          if (!opt || opt.name === 'Нет') return;
          db.optionMaterials.filter((om) => om.option_id === Number(optId)).forEach((om) => {
            const mat = om.materials;
            if (!mat) return;
            const qty = om.quantity || 0;
            if (qty > 0) items.push({ name: mat.name + ' (' + label + ')', qty, unit: mat.unit, price: mat.price || 0, cost: qty * (mat.price || 0), auto: !om.visible });
          });
        });
      });
    }

    // ══════════════════════════════════════════════════
    // Все остальные вкладки (стены, потолок, пол, электрика, заезд, доп.)
    // ══════════════════════════════════════════════════
    if (tab.id !== 'glazing' && tab.id !== 'furniture') {
      const cats = db.categories.filter((c) => c.tab_id === tab.id);

      cats.forEach((cat) => {
        const cn = cat.name.toLowerCase();
        if (cn.includes('материалы для установки') || cn.includes('материалы установки')) return;

        const optId = ts[cat.id] as number | undefined;
        if (!optId) return;
        const opt = db.options.find((o) => o.id === optId);
        if (!opt || opt.name === 'Нет' || opt.name === 'НЕТ') return;

        const mats = db.optionMaterials.filter((om) => om.option_id === optId);

        // Отделка поверхностей
        if (isSurface && cat.name === 'Вид отделки' && areaSqm > 0) {
          let effH = heightMm, effW = widthMm;
          if (hasWindow && rawAreaSqm > 0) {
            effW = Math.round(widthMm * (areaSqm / rawAreaSqm));
          }

          mats.forEach((om) => {
            const mat = om.materials;
            if (!mat) return;
            if (isRm(cat.id, om.id)) return;

            if (om.visible) {
              const defQty = calcMatQty(effH, effW, mat.description, direction);
              const userQty = uq(cat.id, om.material_id);
              const qty = userQty !== undefined ? userQty : defQty;
              if (qty > 0) items.push({ name: mat.name, qty, unit: mat.unit, price: mat.price || 0, cost: qty * (mat.price || 0), auto: false });
            } else {
              const base = om.quantity || 0;
              const mode = om.calc_mode || 'fixed';
              const effHM = effH / 1000, effWM = effW / 1000;
              const effPerimM = effHM > 0 && effWM > 0 ? 2 * (effHM + effWM) : 0;
              const effArea = effHM * effWM;
              let autoQty = base;
              if (mode === 'perim' && effPerimM > 0) autoQty = toSht(base * effPerimM, mat);
              else if ((mode === 'width' || mode === 'width_top') && effWM > 0) autoQty = toSht(base * effWM, mat);
              else if (mode === 'height' && effHM > 0) autoQty = toSht(base * effHM * 2, mat);
              else if (mode === 'per_sqm' && effArea > 0) autoQty = Math.ceil(base * effArea);
              else if (mode === 'step' && effH > 0 && effW > 0) {
                let strips: number, stripLen: number;
                if (direction === 'vertical') { strips = Math.floor(effW / base) + 1; stripLen = effH; }
                else { strips = Math.floor(effH / base) + 1; stripLen = effW; }
                autoQty = toSht(strips * stripLen / 1000, mat);
              } else if (mode === 'step_whole' && effH > 0 && effW > 0) {
                // Нестыкуемые рейки: целая рейка на каждую полосу
                let strips: number, stripLen: number;
                if (direction === 'vertical') { strips = Math.floor(effW / base) + 1; stripLen = effH; }
                else { strips = Math.floor(effH / base) + 1; stripLen = effW; }
                const md = parseDims(mat.description);
                const matLenM = md.d > 0 ? md.d / 1000 : 0;
                if (matLenM > 0) {
                  const perStrip = Math.ceil((stripLen / 1000) / matLenM);
                  autoQty = strips * perStrip;
                } else {
                  autoQty = strips;
                }
              } else if ((mode === 'step_cross' || mode === 'step_whole_cross') && effH > 0 && effW > 0) {
                // ⟂-режимы: переиспользуем calcByModeNum, он сам инвертирует direction
                autoQty = calcByModeNum(base, mode, mat, effH, effW, direction);
              } else if (mode === 'area_sheet' && effArea > 0) {
                const md = parseDims(mat.description);
                const matA = md.d * md.s / 1e6;
                if (matA > 0) autoQty = Math.ceil(effArea / matA * 1.1 * base);
              }
              const userQty = uq(cat.id, om.material_id);
              const qty = userQty !== undefined ? userQty : autoQty;
              if (qty > 0) items.push({ name: mat.name, qty, unit: mat.unit, price: mat.price || 0, cost: qty * (mat.price || 0), auto: true });
            }
          });
          return;
        }

        // Утепление
        if (isSurface && cn.includes('утепл') && areaSqm > 0) {
          mats.forEach((om) => {
            const mat = om.materials;
            if (!mat) return;
            if (isRm(cat.id, om.id)) return;
            const userQty = uq(cat.id, om.material_id);
            const qty = userQty !== undefined ? userQty : calcInsulation(areaSqm);
            if (qty > 0) items.push({ name: mat.name, qty, unit: mat.unit, price: mat.price || 0, cost: qty * (mat.price || 0), auto: !om.visible });
          });
          return;
        }

        // Покраска
        if (isSurface && cn.includes('покраск') && areaSqm > 0) {
          const pq = Math.round(areaSqm / 7 * 100) / 100;
          if (pq > 0) items.push({ name: 'Краска', qty: pq, unit: 'л.', price: 0, cost: 0, auto: true });
          return;
        }

        // Всё остальное — с calc_mode
        mats.forEach((om) => {
          const mat = om.materials;
          if (!mat) return;
          if (isRm(cat.id, om.id)) return;
          const base = om.quantity || 0;
          const mode = om.calc_mode || 'fixed';
          const autoQty = calcByModeNum(base, mode, mat, heightMm, widthMm, direction);
          const userQty = uq(cat.id, om.material_id);
          const qty = userQty !== undefined ? userQty : autoQty;
          if (qty <= 0) return;
          items.push({ name: mat.name, qty, unit: mat.unit, price: mat.price || 0, cost: qty * (mat.price || 0), auto: !om.visible });
        });
      });
    }

    res[tab.id] = items;
  });

  return res;
}

// ── Объединение дубликатов для сводной таблицы ──────────
export function mergeResults(results: CalcResults): ResultItem[] {
  const map: Record<string, ResultItem> = {};
  const info: ResultItem[] = [];

  Object.values(results).flat().forEach((it) => {
    if (it.isInfo) { info.push({ ...it }); return; }
    const key = it.name + '|' + it.unit;
    if (map[key]) { map[key].qty += it.qty; map[key].cost += it.cost; }
    else { map[key] = { ...it }; }
  });

  return [...info, ...Object.values(map).sort((a, b) => a.name.localeCompare(b.name))];
}

// ── Генерация PDF (открывает в новом окне для печати) ───
export function exportPDF(
  results: CalcResults,
  orderInfo: { order_number: string; address: string; phone: string },
  view: 'sections' | 'merged' = 'merged'
): void {
  const merged = mergeResults(results);
  const total = merged.reduce((s, r) => s + (r.cost || 0), 0);
  const date = new Date().toLocaleDateString('ru');

  let html = `<html><head><meta charset="utf-8"><title>Заказ ${orderInfo.order_number || ''}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:20px;color:#333;font-size:12px;max-width:800px;margin:0 auto}
    h1{font-size:18px;margin-bottom:4px}
    .info{margin-bottom:16px;color:#666;font-size:13px}
    .info span{margin-right:20px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th{background:#f5f5f5;text-align:left;padding:6px 8px;border:1px solid #ddd;font-size:11px;font-weight:600}
    td{padding:6px 8px;border:1px solid #ddd}
    .r{text-align:right;font-family:monospace}
    .total{margin-top:16px;text-align:right;font-size:16px;font-weight:bold;padding:10px;background:#f0f8f0;border-radius:6px}
    .section{margin-top:20px}
    .section h3{font-size:14px;margin-bottom:6px;color:#2563eb;border-bottom:1px solid #e0e0e0;padding-bottom:4px}
    @media print{body{padding:10px}button{display:none!important}}
  </style></head><body>
  <h1>К2 Балкон — Заказ на монтаж</h1>
  <div class="info">
    <span><b>№</b> ${orderInfo.order_number || '—'}</span>
    <span><b>Адрес:</b> ${orderInfo.address || '—'}</span>
    <span><b>Тел:</b> ${orderInfo.phone || '—'}</span>
    <span><b>Дата:</b> ${date}</span>
  </div>`;

  if (view === 'sections') {
    // Детальная ведомость по секциям
    html += '<h2 style="font-size:15px;margin-top:20px">Детальная ведомость</h2>';
    Object.entries(results).forEach(([tabId, tabItems]) => {
      if (!tabItems || tabItems.length === 0) return;
      const tabInfo = TABS.find((t) => t.id === tabId);
      html += `<div class="section"><h3>${tabInfo?.icon || ''} ${tabInfo?.label || tabId}</h3><table>
        <tr><th>Материал</th><th class="r">Кол-во</th><th>Ед.</th><th class="r">Цена</th><th class="r">Сумма</th></tr>`;
      tabItems.forEach((it) => {
        if (it.isInfo) {
          html += `<tr style="background:#e8f0fe;font-weight:bold"><td colspan="2">📌 ${it.name}</td><td class="r">${it.qty}</td><td>${it.unit}</td><td class="r">—</td></tr>`;
        } else {
          html += `<tr><td>${it.auto ? '🔒 ' : ''}${it.name}</td><td class="r">${Math.round(it.qty * 100) / 100}</td><td>${it.unit}</td><td class="r">${it.price ? it.price + '₽' : '—'}</td><td class="r">${it.cost ? it.cost.toLocaleString('ru') + '₽' : '—'}</td></tr>`;
        }
      });
      html += '</table></div>';
    });
  } else {
    // Сводная ведомость
    html += '<h2 style="font-size:15px;margin-top:20px">Сводная ведомость</h2><table><tr><th>№</th><th>Материал</th><th class="r">Кол-во</th><th>Ед.</th><th class="r">Цена</th><th class="r">Сумма</th></tr>';
    merged.forEach((it, i) => {
      if (it.isInfo) return;
      html += `<tr><td>${i + 1}</td><td>${it.name}</td><td class="r">${Math.round(it.qty * 100) / 100}</td><td>${it.unit}</td><td class="r">${it.price ? it.price + '₽' : '—'}</td><td class="r">${it.cost ? Math.round(it.cost).toLocaleString('ru') + '₽' : '—'}</td></tr>`;
    });
    html += '</table>';
  }

  html += `<div class="total">ИТОГО: ${total.toLocaleString('ru')} ₽</div>`;
  html += `<br><button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer">🖨 Печать</button>`;
  html += `<div style="margin-top:30px;font-size:10px;color:#999;text-align:center">К2 Балкон — ${date}</div></body></html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  }
}