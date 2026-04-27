/**
 * Логика размерных отметок (dimensions) на канвасе.
 *
 * Типы отметок:
 * - "w" (width) — горизонтальная под корпусом, показывает ширину колонки
 * - "h" (height) — вертикальная слева, показывает высоту секции внутри колонки
 *
 * Дедупликация: если одинаковая высота повторяется в соседних колонках
 * через полку — отметка показывается только в самой левой.
 */
import { MIN_S } from "../constants";

export interface TopLevelCol {
  left: number;
  right: number;
  sl: number;
  sw: number;
}

export interface Dim {
  t: "w" | "h";
  x: number;
  y?: number;
  w?: number;
  h?: number;
  si: number;
  topY?: number;
}

/**
 * Колонки верхнего уровня — прямоугольники между стойками/стенами корпуса.
 */
export function computeTopLevelCols(
  elements: any[],
  iW: number,
  t: number,
): TopLevelCol[] {
  const studs = elements.filter(e => e.type === "stud").sort((a, b) => a.x - b.x);
  const xs = [...new Set([0, ...studs.map(s => s.x), iW])].sort((a, b) => a - b);
  return xs.slice(0, -1).map((left, i) => {
    const hasLeftStud = studs.some(st => Math.abs(st.x - left) < 5);
    const sl = left + (hasLeftStud ? t : 0);
    return { left, right: xs[i + 1], sl, sw: xs[i + 1] - sl };
  });
}

/**
 * Сбор всех размерных отметок: горизонтальные (по ширине) и вертикальные (по высоте).
 */
export function computeDims(
  elements: any[],
  topLevelCols: TopLevelCol[],
  iH: number,
  iW: number,
): Dim[] {
  const res: Dim[] = [];
  topLevelCols.forEach((col, i) => res.push({ t: "w", x: col.sl, w: col.sw, si: i }));

  // Вертикальные сегменты по колонкам
  const hSegments: { x: number; y: number; h: number; topY: number; si: number; xRight: number }[] = [];
  topLevelCols.forEach((col, ci) => {
    const breaks = [{ y: 0 }];
    elements.forEach(el => {
      if (el.type === "stud" || el.type === "door") return;
      if (el.type === "shelf") {
        // Полка создаёт break только если её X-диапазон перекрывает эту колонку
        const shL = el.x || 0, shR = shL + (el.w || iW);
        if (shR > col.sl + 1 && shL < col.sl + col.sw - 1) breaks.push({ y: el.y });
        return;
      }
      const cx = (el.x || 0) + (el.w || 0) / 2;
      if (cx < col.sl - 5 || cx > col.sl + col.sw + 5) return;
      if (el.type === "drawers") {
        breaks.push({ y: el.y });
        breaks.push({ y: el.y + (el.h || 450) });
      }
      if (el.type === "rod") breaks.push({ y: el.y });
    });
    breaks.push({ y: iH });
    const sorted = [...new Set(breaks.map(b => b.y))].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur === undefined || next === undefined) continue;
      const h = next - cur;
      if (h > 25) {
        hSegments.push({
          x: col.sl,
          y: cur,
          h,
          topY: cur,
          si: ci,
          xRight: col.sl + col.sw,
        });
      }
    }
  });

  // Дедупликация: соседние колонки с одинаковым topY и h — один размер в самой левой
  const used = new Array(hSegments.length).fill(false);
  for (let i = 0; i < hSegments.length; i++) {
    if (used[i]) continue;
    const seg = hSegments[i];
    if (!seg) continue;
    for (let j = 0; j < hSegments.length; j++) {
      if (i === j || used[j]) continue;
      const other = hSegments[j];
      if (!other) continue;
      if (other.topY === seg.topY && other.h === seg.h && other.x !== seg.x) {
        used[j] = true;
      }
    }
    res.push({ t: "h", x: seg.x, y: seg.y, h: seg.h, si: seg.si, topY: seg.topY });
  }

  return res;
}

/**
 * Изменение горизонтального размера: двигает соответствующую стойку либо меняет ширину корпуса.
 * Возвращает команды для вызывающего кода.
 */
export function applyHorizDimChange(
  d: Dim,
  v: number,
  dir: "left" | "right",
  topLevelCols: TopLevelCol[],
  elements: any[],
  iW: number,
  t: number,
): { type: "updateStud"; id: string; x: number } | { type: "updateCorpusWidth"; width: number } | null {
  const studs = elements.filter(e => e.type === "stud").sort((a, b) => a.x - b.x);
  if (topLevelCols.length <= 1) {
    return { type: "updateCorpusWidth", width: Math.max(300, Math.min(3000, v + 2 * t)) };
  }

  const tryRight = () => {
    if (d.si >= studs.length) return null;
    const st = studs[d.si];
    const col = topLevelCols[d.si];
    if (!st || !col) return null;
    const nx = col.sl + v;
    if (nx >= MIN_S && nx <= iW - MIN_S) {
      return { type: "updateStud" as const, id: st.id, x: nx };
    }
    return null;
  };
  const tryLeft = () => {
    if (d.si <= 0) return null;
    const st = studs[d.si - 1];
    const col = topLevelCols[d.si];
    if (!st || !col) return null;
    const nx = col.sl + col.sw - v;
    if (nx >= MIN_S && nx <= iW - MIN_S) {
      return { type: "updateStud" as const, id: st.id, x: nx };
    }
    return null;
  };

  const result = dir === "left" ? (tryRight() || tryLeft()) : (tryLeft() || tryRight());
  if (result) return result;

  // Fallback: обе стороны — стены корпуса → расширяем корпус
  if (d.si === 0 && d.si === studs.length) {
    return { type: "updateCorpusWidth", width: Math.max(300, Math.min(3000, v + 2 * t)) };
  }
  return null;
}

/**
 * Изменение вертикального размера: находит ближайший элемент снизу/сверху
 * и двигает его так чтобы высота сегмента стала v.
 */
export function applyVertDimChange(
  d: Dim,
  v: number,
  dir: "top" | "bottom",
  topLevelCols: TopLevelCol[],
  elements: any[],
  iH: number,
): { id: string; y: number } | null {
  const col = topLevelCols[d.si];
  if (!col) return null;

  const secEls = elements
    .filter(e => e.type !== "stud" && e.type !== "door")
    .filter(e => {
      if (e.type === "shelf") return true;
      const cx = (e.x || 0) + (e.w || 0) / 2;
      return cx >= col.sl - 5 && cx <= col.sl + col.sw + 5;
    })
    .sort((a, b) => (a.y || 0) - (b.y || 0));

  const gT = d.topY ?? 0;
  const gB = gT + (d.h ?? 0);

  const tryTop = () => {
    const tgt = secEls.find(e => Math.abs((e.y || 0) - gB) < 8);
    if (tgt) return { id: tgt.id, y: Math.max(0, Math.min(iH, gT + v)) };
    return null;
  };
  const tryBottom = () => {
    const tgt = secEls.find(e => Math.abs((e.y || 0) - gT) < 8 && gT > 5);
    if (tgt) return { id: tgt.id, y: Math.max(0, Math.min(iH, gB - v)) };
    return null;
  };

  return dir === "top" ? (tryTop() || tryBottom()) : (tryBottom() || tryTop());
}
