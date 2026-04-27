/**
 * Расчёт зон внутри шкафа.
 * Зоны — это прямоугольники между стойками и полками,
 * в которые можно класть элементы при placeMode.
 * Каждая зона соответствует пересечению колонки (между стойками)
 * и полосы (между полками).
 */

export interface Zone {
  left: number;
  right: number;
  /** Usable left (с учётом толщины стойки-границы). */
  sl: number;
  /** Usable width. */
  sw: number;
  top: number;
  bot: number;
  bandIdx: number;
  colIdx: number;
  id: string;
}

export function computeZones(
  els: any[],
  iW: number,
  iH: number,
  t: number,
): Zone[] {
  const shelves = els.filter(e => e.type === "shelf").sort((a, b) => a.y - b.y);
  const studs = els.filter(e => e.type === "stud");

  const studXs = studs.map(st => st.x).sort((a, b) => a - b);
  const colBreaks = [0, ...studXs, iW];
  const uniqueColX = [...new Set(colBreaks)].sort((a, b) => a - b);

  const zones: Zone[] = [];

  for (let ci = 0; ci < uniqueColX.length - 1; ci++) {
    const colLeft = uniqueColX[ci];
    const colRight = uniqueColX[ci + 1];

    // Стойка на левой границе?
    const hasLeftStud = studs.some(st => Math.abs(st.x - colLeft) < 5);
    // Стойка на правой? (она занимает x..x+t — значит её x = colRight)

    const colShelves = shelves.filter(sh => {
      const shLeft = sh.x || 0;
      const shRight = shLeft + (sh.w || iW);
      return shRight > colLeft + 5 && shLeft < colRight - 5;
    });

    const yBreaks = [0, ...colShelves.map(s => s.y), iH];
    const uniqueY = [...new Set(yBreaks)].sort((a, b) => a - b);

    for (let yi = 0; yi < uniqueY.length - 1; yi++) {
      const bandTop = uniqueY[yi];
      const bandBot = uniqueY[yi + 1];

      // Usable area с учётом толщины стойки-границы
      const sl = colLeft + (hasLeftStud ? t : 0);
      const sr = colRight;

      zones.push({
        left: colLeft, right: colRight,
        sl, sw: sr - sl,
        top: bandTop, bot: bandBot,
        bandIdx: yi, colIdx: ci,
        id: `z_${ci}_${yi}`,
      });
    }
  }
  return zones;
}

/**
 * Поиск зоны по точке клика.
 * Небольшие допуски по краям чтобы тап рядом с границей попадал в правильную зону.
 */
export function findZone(zones: Zone[], x: number, y: number): Zone {
  const found = zones.find(z =>
    x >= z.sl - 10 && x < z.right + 10 &&
    y >= z.top - 5 && y < z.bot + 5,
  );
  if (found) return found;
  if (zones[0]) return zones[0];
  // Дегенеративный случай — пустой массив зон. По API функция всегда возвращает Zone,
  // поэтому возвращаем "нулевую" зону. На практике сюда не должно попадать.
  return { left: 0, right: 0, sl: 0, sw: 0, top: 0, bot: 0, bandIdx: 0, colIdx: 0, id: "empty" };
}
