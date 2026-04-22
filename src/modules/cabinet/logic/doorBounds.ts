/**
 * Поиск границ для размещения двери и snap-таргетов при resize.
 *
 * Ключевое поле — innerEdge: координата ВНУТРЕННЕЙ кромки соседа, т.е. той линии,
 * от которой начинается пустое пространство ниши. Используется для расчёта
 * размеров вкладной (insert) двери/панели с зазором 2мм по периметру,
 * а также накладной (overlay) двери/панели, которая выступает за кромку на OC/OS.
 *
 * Различается 3 случая:
 * 1. Внешняя стена корпуса (x=0, x=iW, y=0, y=iH, не вытесненная краевой стойкой/полкой):
 *    innerEdge = координата стены.
 * 2. Стойка (рисуется [x, x+t]):
 *    - ниша СПРАВА от стойки → innerEdge = x + t (правая кромка стойки)
 *    - ниша СЛЕВА  от стойки → innerEdge = x (левая кромка стойки)
 * 3. Полка — Smart-Y рендер (см. renderShelf() в components/elements.tsx):
 *    - sh.y < 5 (у верха):   рисуется [y, y+t]     → ниша снизу от неё = innerEdge = y + t
 *    - sh.y > iH-5 (у низа): рисуется [y-t, y]     → ниша сверху от неё = innerEdge = y - t
 *    - в середине:           рисуется [y-t/2, y+t/2] → снизу = y+t/2, сверху = y-t/2
 */

/** Порог Smart-Y — синхронизирован с renderShelf() в components/elements.tsx. */
const SMART_Y_EDGE = 5;

/**
 * Физический Y-диапазон полки на SVG с учётом Smart-Y рендера.
 * Источник истины — renderShelf() в elements.tsx.
 */
export function shelfRenderRange(
  sh: any, t: number, iH: number,
): { top: number; bot: number } {
  const y = sh.y || 0;
  if (y < SMART_Y_EDGE) return { top: y, bot: y + t };
  if (y > iH - SMART_Y_EDGE) return { top: y - t, bot: y };
  return { top: y - t / 2, bot: y + t / 2 };
}

export interface DoorBound {
  x?: number;
  y?: number;
  isWall: boolean;
  /**
   * Внутренняя кромка ниши (mm). Это координата той стороны соседа,
   * которая смотрит внутрь ниши. Для внешней стены корпуса = сама координата.
   * Для стойки/полки — их кромка, обращённая к нише.
   */
  innerEdge: number;
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
  // она должна трактоваться как СТЕНА (isWall: true), НО её innerEdge считается
  // как у стойки/полки (а не как у стены), т.к. она физически занимает место.
  //
  // ВАЖНО: проверка учитывает X клика (для полок) и Y клика (для стоек) —
  // полка слева не отменяет стену сверху для клика справа, если полка туда не доходит.
  const studNearLeft = allStuds.some(st => {
    if (st.x >= t + 2) return false;
    const { sTop, sBot } = getStudRealRange(st);
    return clickY >= sTop - 5 && clickY <= sBot + 5;
  });
  const studNearRight = allStuds.some(st => {
    if (st.x <= iW - 2 * t - 2) return false;
    const { sTop, sBot } = getStudRealRange(st);
    return clickY >= sTop - 5 && clickY <= sBot + 5;
  });
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

  // V-bounds: стены + стойки на этом Y. innerEdge сначала кладём заглушкой (= x),
  // т.к. для стойки итоговое значение зависит от того, окажется ли она слева или справа
  // от выбранной ниши — пересчитаем после выбора left/right.
  // Сохраняем _studRef для различения "это стойка с физическим диапазоном [x, x+t]"
  // от "это внешняя стена корпуса". Это критично для правильного расчёта innerEdge:
  // даже у краевой стойки с x=0 (где координата как у стены) правая кромка = t, не 0.
  const vBounds: DoorBound[] = [
    ...(studNearLeft ? [] : [{ x: 0, isWall: true, innerEdge: 0 }]),
    ...allStuds.filter(st => {
      const { sTop, sBot } = getStudRealRange(st);
      return clickY >= sTop - 5 && clickY <= sBot + 5;
    }).map(st => ({
      x: st.x,
      // Краевая стойка = стена (isWall: true), но физически это элемент шириной t.
      isWall: st.x < t + 2 || st.x > iW - 2 * t - 2,
      innerEdge: st.x, // заглушка, перепишется ниже с учётом стороны
      _studRef: st as any,
    })),
    ...(studNearRight ? [] : [{ x: iW, isWall: true, innerEdge: iW }]),
  ].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));

  // H-bounds: стены + полки на этом X. Сохраняем ссылку на полку в _shelfRef,
  // чтобы позже для выбранных top/bottom посчитать innerEdge с учётом Smart-Y.
  const hBounds: DoorBound[] = [
    ...(shelfNearTop ? [] : [{ y: 0, isWall: true, innerEdge: 0 }]),
    ...allShelves.filter(sh => {
      const shLeft = sh.x || 0, shRight = shLeft + (sh.w || iW);
      return clickX >= shLeft - 5 && clickX <= shRight + 5;
    }).map(sh => ({
      y: sh.y,
      isWall: sh.y < t + 2 || sh.y > iH - t - 2,
      innerEdge: sh.y, // заглушка
      xLeft: sh.x || 0,
      xRight: (sh.x || 0) + (sh.w || iW),
      _shelfRef: sh as any,
    })),
    ...(shelfNearBot ? [] : [{ y: iH, isWall: true, innerEdge: iH }]),
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

  // ═══ Теперь посчитаем корректные innerEdge для выбранных 4 границ ═══

  // Критерий "это стойка" = наличие референса на элемент.
  // Отличие от координатной проверки важно: краевая стойка с x=0 физически занимает
  // диапазон [0, t], и её правая кромка = t, а не 0 (как у внешней стены).
  const isStudBound = (b: DoorBound): boolean =>
    (b as any)._studRef !== undefined;

  // Создаём КОПИИ bound'ов, чтобы не мутировать оригинальные объекты в vBounds/hBounds.
  const leftOut: DoorBound = isStudBound(left)
    ? { ...left, innerEdge: (left.x ?? 0) + t } // стойка СЛЕВА от ниши → правая кромка стойки
    : { ...left, innerEdge: left.x ?? 0 }; // внешняя стена корпуса

  const rightOut: DoorBound = isStudBound(right)
    ? { ...right, innerEdge: right.x ?? 0 } // стойка СПРАВА от ниши → левая кромка стойки
    : { ...right, innerEdge: right.x ?? 0 }; // внешняя стена корпуса

  // Для H-границ: используем shelfRenderRange() для точного Smart-Y расчёта.
  const topOut: DoorBound = ((): DoorBound => {
    const shelfRef = (top as any)._shelfRef;
    if (!shelfRef) {
      // Внешняя стена или фоллбек
      return { ...top, innerEdge: top.y ?? 0 };
    }
    const { bot } = shelfRenderRange(shelfRef, t, iH);
    return { ...top, innerEdge: bot }; // полка сверху от ниши → её нижняя кромка
  })();

  const bottomOut: DoorBound = ((): DoorBound => {
    const shelfRef = (bottom as any)._shelfRef;
    if (!shelfRef) {
      return { ...bottom, innerEdge: bottom.y ?? 0 };
    }
    const { top: shTop } = shelfRenderRange(shelfRef, t, iH);
    return { ...bottom, innerEdge: shTop }; // полка снизу от ниши → её верхняя кромка
  })();

  // Удаляем служебные поля из результата (они не часть публичного API).
  delete (leftOut as any)._studRef;
  delete (rightOut as any)._studRef;
  delete (topOut as any)._shelfRef;
  delete (bottomOut as any)._shelfRef;

  return { left: leftOut, right: rightOut, top: topOut, bottom: bottomOut };
}

export interface SnapTarget {
  pos: number;
  isWall: boolean;
  /**
   * Внутренняя кромка ниши со стороны меньших координат от таргета.
   * То есть: если дверь находится СЛЕВА/СВЕРХУ от этого таргета, это — её правая/нижняя граница.
   * - Внешняя стена: = pos
   * - Стойка (рисуется [pos, pos+t]): = pos (левая кромка стойки)
   * - Полка (Smart-Y): верхняя кромка физического рендера
   */
  innerEdgeFromLowSide: number;
  /**
   * Внутренняя кромка ниши со стороны больших координат.
   * - Внешняя стена: = pos
   * - Стойка: = pos + t (правая кромка стойки)
   * - Полка: нижняя кромка физического рендера
   */
  innerEdgeFromHighSide: number;
  xLeft?: number;
  xRight?: number;
}

/**
 * Snap-таргеты для resize двери: вертикальные (стены/стойки/края других дверей)
 * и горизонтальные (стены/полки).
 *
 * @param t — толщина ЛДСП (нужна для правильного расчёта innerEdge стоек и полок).
 */
export function computeDoorSnapTargets(
  elements: any[],
  iW: number,
  iH: number,
  t: number,
): { vTargets: SnapTarget[]; hTargets: SnapTarget[] } {
  // Границы других дверей — можно snap-нуться к ним (предотвращает накладывание).
  // Для краёв соседних дверей нет отдельной "кромки" — считаем innerEdge = pos с обеих сторон.
  const otherDoorBounds: SnapTarget[] = [];
  elements.filter(e => e.type === "door").forEach(d => {
    if (d.doorLeft !== undefined) otherDoorBounds.push({
      pos: d.doorLeft, isWall: d.doorLeftIsWall ?? false,
      innerEdgeFromLowSide: d.doorLeft,
      innerEdgeFromHighSide: d.doorLeft,
    });
    if (d.doorRight !== undefined) otherDoorBounds.push({
      pos: d.doorRight, isWall: d.doorRightIsWall ?? false,
      innerEdgeFromLowSide: d.doorRight,
      innerEdgeFromHighSide: d.doorRight,
    });
  });

  const vTargets: SnapTarget[] = [
    {
      pos: 0, isWall: true,
      innerEdgeFromLowSide: 0, innerEdgeFromHighSide: 0,
    },
    ...elements.filter(e => e.type === "stud").map(st => ({
      pos: st.x, isWall: false,
      // Стойка рисуется [x, x+t]. Для дверей/панелей:
      // ниша в сторону меньших X (слева от стойки) → правая граница ниши = левая кромка стойки = x
      // ниша в сторону больших X (справа от стойки) → левая граница ниши = правая кромка стойки = x+t
      innerEdgeFromLowSide: st.x,
      innerEdgeFromHighSide: st.x + t,
    })),
    ...otherDoorBounds,
    {
      pos: iW, isWall: true,
      innerEdgeFromLowSide: iW, innerEdgeFromHighSide: iW,
    },
  ].sort((a, b) => a.pos - b.pos);

  const hTargets: SnapTarget[] = [
    {
      pos: 0, isWall: true,
      innerEdgeFromLowSide: 0, innerEdgeFromHighSide: 0,
    },
    ...elements.filter(e => e.type === "shelf").map(sh => {
      const range = shelfRenderRange(sh, t, iH);
      return {
        pos: sh.y,
        isWall: false,
        // Smart-Y: ниша СВЕРХУ от полки (сторона меньших Y) → верхняя кромка полки
        // ниша СНИЗУ от полки (сторона больших Y) → нижняя кромка полки
        innerEdgeFromLowSide: range.top,
        innerEdgeFromHighSide: range.bot,
        xLeft: sh.x || 0,
        xRight: (sh.x || 0) + (sh.w || iW),
      };
    }),
    {
      pos: iH, isWall: true,
      innerEdgeFromLowSide: iH, innerEdgeFromHighSide: iH,
    },
  ].sort((a, b) => a.pos - b.pos);

  return { vTargets, hTargets };
}
