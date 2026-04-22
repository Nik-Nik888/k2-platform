/**
 * Поиск границ для размещения двери и snap-таргетов при resize.
 */

export interface DoorBound {
  x?: number;
  y?: number;
  isWall: boolean;
  xLeft?: number;
  xRight?: number;
}

export interface DoorBoundsResult {
  left: DoorBound;
  right: DoorBound;
  top: DoorBound;
  bottom: DoorBound;
}

/**
 * Найти 4 ближайшие границы (стены/стойки/полки) вокруг точки клика.
 * Используется при постановке двери.
 */
export function findDoorBounds(
  elements: any[],
  clickX: number,
  clickY: number,
  iW: number,
  iH: number,
  t: number,
): DoorBoundsResult {
  const allShelves = elements.filter(e => e.type === "shelf");
  const allStuds = elements.filter(e => e.type === "stud");

  /**
   * Реальный Y-диапазон стойки с учётом полок которые её пересекают.
   * Только полки которые идут ЧЕРЕЗ стойку (перекрывают с обеих сторон) ограничивают её.
   */
  const getStudRealRange = (stud: any) => {
    const sx = stud.x || 0;
    const anchorY = stud.anchorY ?? iH / 2;
    const spanning = allShelves.filter(sh => {
      const shLeft = sh.x || 0;
      const shRight = shLeft + (sh.w || iW);
      return shLeft < sx - 5 && shRight > sx + t + 5;
    });
    let sTop = 0, sBot = iH;
    spanning.forEach(sh => {
      if (sh.y <= anchorY && sh.y > sTop) sTop = sh.y;
      if (sh.y > anchorY && sh.y < sBot) sBot = sh.y;
    });
    return { sTop, sBot };
  };

  // Краевые стойки/полки: если стойка/полка стоит у самого края корпуса
  // (в пределах t+2), она физически заменяет стенку корпуса. Для логики дверей
  // она должна трактоваться как СТЕНА (isWall: true) — иначе insert дверь
  // будет пытаться обойти её изнутри, а накладная — даст неправильный напуск.
  //
  // ВАЖНО: проверка учитывает Y клика (для стоек) и X клика (для полок) —
  // полка слева не отменяет стену сверху для клика справа, если полка туда не доходит.
  const studNearLeft = allStuds.some(st =>
    st.x < t + 2 && (() => {
      const { sTop, sBot } = getStudRealRange(st);
      return clickY >= sTop - 5 && clickY <= sBot + 5;
    })(),
  );
  const studNearRight = allStuds.some(st =>
    st.x > iW - 2 * t - 2 && (() => {
      const { sTop, sBot } = getStudRealRange(st);
      return clickY >= sTop - 5 && clickY <= sBot + 5;
    })(),
  );
  const shelfNearTop = allShelves.some(sh => {
    if (sh.y >= t + 2) return false;
    const shLeft = sh.x || 0, shRight = shLeft + (sh.w || iW);
    return clickX >= shLeft - 5 && clickX <= shRight + 5;
  });
  const shelfNearBot = allShelves.some(sh => {
    if (sh.y <= iH - t - 2) return false;
    const shLeft = sh.x || 0, shRight = shLeft + (sh.w || iW);
    return clickX >= shLeft - 5 && clickX <= shRight + 5;
  });

  // Вертикальные границы: стены + стойки которые действительно проходят через этот Y.
  // Краевые стойки выступают в роли стен (isWall: true).
  const vBounds: DoorBound[] = [
    ...(studNearLeft ? [] : [{ x: 0, isWall: true }]),
    ...allStuds.filter(st => {
      const { sTop, sBot } = getStudRealRange(st);
      return clickY >= sTop - 5 && clickY <= sBot + 5;
    }).map(st => ({
      x: st.x,
      // Краевая стойка = стена: её x у самого края корпуса
      isWall: st.x < t + 2 || st.x > iW - 2 * t - 2,
    })),
    ...(studNearRight ? [] : [{ x: iW, isWall: true }]),
  ].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));

  // Горизонтальные границы: стены + полки на этом X.
  // Краевая полка (сверху/снизу у края корпуса) выступает в роли стены.
  const hBounds: DoorBound[] = [
    ...(shelfNearTop ? [] : [{ y: 0, isWall: true }]),
    ...allShelves.filter(sh => {
      const shLeft = sh.x || 0, shRight = shLeft + (sh.w || iW);
      return clickX >= shLeft - 5 && clickX <= shRight + 5;
    }).map(sh => ({
      y: sh.y,
      // Краевая полка = стена: её y у верха/низа корпуса
      isWall: sh.y < t + 2 || sh.y > iH - t - 2,
      xLeft: sh.x || 0,
      xRight: (sh.x || 0) + (sh.w || iW),
    })),
    ...(shelfNearBot ? [] : [{ y: iH, isWall: true }]),
  ].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

  // LEFT: самая правая V-граница слева от клика
  let left = vBounds[0];
  for (const v of vBounds) { if ((v.x ?? 0) <= clickX + 5) left = v; else break; }
  // RIGHT: самая левая V-граница справа от клика
  let right = vBounds[vBounds.length - 1];
  for (let i = vBounds.length - 1; i >= 0; i--) {
    if ((vBounds[i].x ?? 0) >= clickX - 5) right = vBounds[i]; else break;
  }
  if ((left.x ?? 0) >= (right.x ?? 0)) {
    const li = vBounds.indexOf(left);
    if (li > 0) left = vBounds[li - 1];
    else if (li < vBounds.length - 1) right = vBounds[li + 1];
  }

  // TOP: самая нижняя H-граница над кликом (только полки перекрывающие X)
  let top = hBounds[0];
  for (const h of hBounds) {
    if ((h.y ?? 0) > clickY - 5) break;
    if (h.isWall || (h.xLeft !== undefined && clickX >= h.xLeft - 5 && clickX <= (h.xRight ?? 0) + 5)) {
      top = h;
    }
  }
  // BOTTOM: самая верхняя H-граница под кликом
  let bottom = hBounds[hBounds.length - 1];
  for (let i = hBounds.length - 1; i >= 0; i--) {
    if ((hBounds[i].y ?? 0) < clickY + 5) break;
    if (hBounds[i].isWall || (hBounds[i].xLeft !== undefined && clickX >= hBounds[i].xLeft - 5 && clickX <= (hBounds[i].xRight ?? 0) + 5)) {
      bottom = hBounds[i];
    }
  }
  if ((top.y ?? 0) >= (bottom.y ?? 0)) {
    const ti = hBounds.indexOf(top);
    if (ti < hBounds.length - 1) bottom = hBounds[ti + 1];
    else if (ti > 0) top = hBounds[ti - 1];
  }

  return { left, right, top, bottom };
}

export interface SnapTarget {
  pos: number;
  isWall: boolean;
  xLeft?: number;
  xRight?: number;
}

/**
 * Snap-таргеты для resize двери: вертикальные (стены/стойки/края других дверей)
 * и горизонтальные (стены/полки).
 */
export function computeDoorSnapTargets(
  elements: any[],
  iW: number,
  iH: number,
): { vTargets: SnapTarget[]; hTargets: SnapTarget[] } {
  // Границы других дверей — можно snap-нуться к ним (предотвращает накладывание)
  const otherDoorBounds: SnapTarget[] = [];
  elements.filter(e => e.type === "door").forEach(d => {
    if (d.doorLeft !== undefined) otherDoorBounds.push({
      pos: d.doorLeft, isWall: d.doorLeftIsWall ?? false,
    });
    if (d.doorRight !== undefined) otherDoorBounds.push({
      pos: d.doorRight, isWall: d.doorRightIsWall ?? false,
    });
  });

  const vTargets: SnapTarget[] = [
    { pos: 0, isWall: true },
    ...elements.filter(e => e.type === "stud").map(st => ({
      pos: st.x, isWall: false,
    })),
    ...otherDoorBounds,
    { pos: iW, isWall: true },
  ].sort((a, b) => a.pos - b.pos);

  const hTargets: SnapTarget[] = [
    { pos: 0, isWall: true },
    ...elements.filter(e => e.type === "shelf").map(sh => ({
      pos: sh.y,
      isWall: false,
      xLeft: sh.x || 0,
      xRight: (sh.x || 0) + (sh.w || iW),
    })),
    { pos: iH, isWall: true },
  ].sort((a, b) => a.pos - b.pos);

  return { vTargets, hTargets };
}
