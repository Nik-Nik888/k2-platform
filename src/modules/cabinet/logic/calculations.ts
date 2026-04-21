/**
 * Расчёт фурнитуры и раскроя для шкафа.
 * Используется в сводке (Summary) и экспорте.
 */
import { GUIDES } from "../constants";

interface Corpus {
  width: number;
  height: number;
  depth: number;
  thickness: number;
}

export interface HardwareItem {
  n: string;
  i: string;
  q: number;
  r: string;
}

export interface PartItem {
  n: string;
  q: number;
  l: number;
  w: number;
  m?: number;
}

export function calcHW(c: Corpus, els: any[], showCorpus: boolean): HardwareItem[] {
  const hw: HardwareItem[] = [];
  if (els.length === 0) return hw;

  // Корпус только при включённом showCorpus
  if (showCorpus) {
    hw.push({ n: "Конфирмат 5×50", i: "🔩", q: 8, r: "Корпус" });
    hw.push({ n: "Шкант 8×30", i: "🪵", q: 8, r: "Усиление" });
    hw.push({ n: "Гвоздь", i: "📍", q: Math.ceil(2 * (c.width + c.height) / 200), r: "Задн.ст" });
    hw.push({ n: "Опора", i: "🦿", q: c.width > 800 ? 6 : 4, r: "Опоры" });
  }

  const np = els.filter(e => e.type === "stud").length;
  if (np) hw.push({ n: "Конфирмат", i: "🔩", q: np * 4, r: `Стойки: ${np}` });

  const ns = els.filter(e => e.type === "shelf").length;
  if (ns) hw.push({ n: "Полкодерж.", i: "📌", q: ns * 4, r: `Полки: ${ns}` });

  els.filter(e => e.type === "drawers").forEach(dr => {
    const cnt = dr.count || 3;
    const gt = GUIDES.find(g => g.id === (dr.guideType || "roller")) || GUIDES[0];
    hw.push({ n: gt.label, i: "↔️", q: cnt * 2, r: `Ящ×${cnt}` });
    hw.push({ n: "Конф.(ящики)", i: "🔩", q: cnt * 8, r: `Ящ×${cnt}` });
  });

  const nr = els.filter(e => e.type === "rod").length;
  if (nr) hw.push({ n: "Штангодерж.", i: "🪝", q: nr * 2, r: `Шт: ${nr}` });

  els.filter(e => e.type === "door").forEach(d => {
    const hn = (d.h || 600) > 1800 ? 4 : (d.h || 600) > 1200 ? 3 : 2;
    hw.push({
      n: (d.hingeType || "overlay") === "insert" ? "Петля вкладн." : "Петля накл.",
      i: "🚪", q: hn, r: "Дв",
    });
    hw.push({ n: "Евровинт", i: "🔧", q: hn * 2, r: "Планки" });
  });

  return hw;
}

/**
 * Фактическая глубина элемента: el.depth если задана, иначе corpus.depth.
 * Используется для расчёта раскроя ЛДСП (чтобы полки/стойки нестандартной
 * глубины попали в спецификацию с правильным размером).
 */
function elementDepth(el: any, corpusDepth: number): number {
  return typeof el.depth === "number" && el.depth > 0 ? el.depth : corpusDepth;
}

export function calcParts(c: Corpus, els: any[], showCorpus: boolean): PartItem[] {
  const { width: W, height: H, depth: D, thickness: tt } = c;
  const p: PartItem[] = [];
  if (els.length === 0) return p;

  if (showCorpus) {
    p.push({ n: "Боковина", q: 2, l: H, w: D });
    p.push({ n: "Крыша", q: 1, l: W - 2 * tt, w: D });
    p.push({ n: "Дно", q: 1, l: W - 2 * tt, w: D });
    p.push({ n: "Задн.ст", q: 1, l: H - 4, w: W - 4, m: 1 });
  }

  els.filter(e => e.type === "stud").forEach((st, i) =>
    p.push({ n: `Стойка${i + 1}`, q: 1, l: Math.round((st.pBot || H) - (st.pTop || 0)), w: elementDepth(st, D) - 4 }),
  );

  els.filter(e => e.type === "shelf").forEach((s, i) =>
    p.push({ n: `Полка${i + 1}`, q: 1, l: Math.round(s.w), w: elementDepth(s, D) - 4 }),
  );

  els.filter(e => e.type === "door").forEach((d, i) =>
    p.push({ n: `Дверь${i + 1}`, q: 1, l: Math.round(d.doorH || d.h || 0), w: Math.round(d.doorW || d.w || 0) }),
  );

  els.filter(e => e.type === "panel").forEach((pn, i) =>
    p.push({
      n: `Панель${i + 1}`, q: 1,
      l: Math.round(pn.panelH || pn.h || 0),
      w: Math.round(pn.panelW || pn.w || 0),
    }),
  );

  els.filter(e => e.type === "drawers").forEach((dr, i) => {
    const cnt = dr.count || 3;
    const heights = dr.drawerHeights || [];
    const drD = elementDepth(dr, D);
    for (let j = 0; j < cnt; j++) {
      const dH = heights[j] || Math.floor((dr.h || 450) / cnt);
      p.push({ n: `Фас.ящ${i + 1}.${j + 1}`, q: 1, l: dH - 6, w: Math.round(dr.w || 400) - 4 });
      p.push({ n: `Бок.ящ${i + 1}.${j + 1}`, q: 2, l: drD - 50, w: dH - 36 });
    }
  });

  return p;
}
