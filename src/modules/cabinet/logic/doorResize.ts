/**
 * Пересчёт двери при resize: snap к ближайшим границам, clamp к соседним дверям,
 * clamp к рамке. Чистая функция без state.
 *
 * При snap к таргету (стена / стойка / полка / край другой двери) получаем
 * корректную ВНУТРЕННЮЮ кромку ниши из поля SnapTarget.innerEdgeFromLowSide/HighSide,
 * которое уже учитывает:
 * - физический рендер стойки [x, x+t]
 * - Smart-Y рендер полки ([y, y+t] / [y-t, y] / [y-t/2, y+t/2])
 * - внешние стены корпуса (innerEdge = pos)
 *
 * Это критично для insert-режима, где дверь должна стоять в проёме с зазором 2мм
 * по периметру: если брать просто координату snap-таргета, дверь уедет на t/2
 * либо залезет на стойку, либо оставит кривой зазор.
 */
import { SnapTarget } from "./doorBounds";
import { DOOR_OVERLAY_CORPUS as OC, DOOR_OVERLAY_STUD as OS } from "../constants";

/** Зазор между вкладной дверью/панелью и кромкой ниши (мм). См. placement.ts. */
const INSERT_GAP = 3;

export interface DoorResizeBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  leftIsWall: boolean;
  rightIsWall: boolean;
  topIsWall: boolean;
  bottomIsWall: boolean;
  /**
   * Корректные внутренние кромки ниши (mm) — берутся из SnapTarget при snap'е.
   * Для сторон, не затронутых текущим drag, остаются с прошлого резайза или
   * восстанавливаются из `left/right/top/bottom` + `isWall` через computeInnerEdge*.
   */
  innerEdgeLeft: number;
  innerEdgeRight: number;
  innerEdgeTop: number;
  innerEdgeBottom: number;
}

export interface DoorResizeResult {
  x: number;
  y: number;
  w: number;
  h: number;
  doorW: number;
  doorH: number;
  doorLeft: number;
  doorRight: number;
  doorTop: number;
  doorBottom: number;
  doorLeftIsWall: boolean;
  doorRightIsWall: boolean;
  doorTopIsWall: boolean;
  doorBottomIsWall: boolean;
}

/**
 * Вычислить новые размеры двери при resize drag.
 *
 * @param el — выделенная дверь (с doorLeft/Right/Top/Bottom и isWall флагами)
 * @param mouseX/mouseY — текущая позиция мыши/пальца в координатах SVG (mm)
 * @param edge — какой край тянем: "top" | "bottom" | "left" | "right"
 * @param vTargets/hTargets — snap-цели (вертикальные/горизонтальные границы)
 * @param otherDoors — все остальные двери (для clamp'а от наложения)
 * @param iW/iH — внутренние размеры рамки
 * @param t — толщина стойки
 */
export function computeDoorResize(
  el: any,
  mouseX: number,
  mouseY: number,
  edge: "top" | "bottom" | "left" | "right",
  vTargets: SnapTarget[],
  hTargets: SnapTarget[],
  otherDoors: any[],
  iW: number,
  iH: number,
  t: number,
): DoorResizeResult {
  // Стартовые границы двери. innerEdge восстанавливаем из сохранённых полей
  // через хелперы (Smart-Y для полок, [x, x+t] для стоек).
  const left = el.doorLeft ?? 0;
  const right = el.doorRight ?? iW;
  const top = el.doorTop ?? 0;
  const bottom = el.doorBottom ?? iH;
  const leftIsWall = el.doorLeftIsWall ?? true;
  const rightIsWall = el.doorRightIsWall ?? true;
  const topIsWall = el.doorTopIsWall ?? true;
  const bottomIsWall = el.doorBottomIsWall ?? true;

  const newBounds: DoorResizeBounds = {
    left, right, top, bottom,
    leftIsWall, rightIsWall, topIsWall, bottomIsWall,
    innerEdgeLeft: computeInnerEdgeX(left, /*nicheOnRightSide*/ true, iW, t),
    innerEdgeRight: computeInnerEdgeX(right, /*nicheOnRightSide*/ false, iW, t),
    innerEdgeTop: computeInnerEdgeY(top, /*nicheBelow*/ true, iH, t),
    innerEdgeBottom: computeInnerEdgeY(bottom, /*nicheBelow*/ false, iH, t),
  };

  // Snap к ближайшему H-таргету для top/bottom
  if (edge === "top" || edge === "bottom") {
    let best: SnapTarget | null = null;
    let bestDist = Infinity;
    for (const ht of hTargets) {
      if (edge === "top" && ht.pos >= newBounds.bottom) continue;
      if (edge === "bottom" && ht.pos <= newBounds.top) continue;
      const d = Math.abs(ht.pos - mouseY);
      if (d < bestDist) { bestDist = d; best = ht; }
    }
    if (best) {
      if (edge === "top") {
        newBounds.top = best.pos;
        newBounds.topIsWall = best.isWall;
        // Мы подцепились к таргету СВЕРХУ от двери → ниша снизу от таргета
        // → берём кромку со стороны больших Y (highSide)
        newBounds.innerEdgeTop = best.innerEdgeFromHighSide;
      } else {
        newBounds.bottom = best.pos;
        newBounds.bottomIsWall = best.isWall;
        // Таргет СНИЗУ от двери → ниша сверху от таргета → кромка со стороны меньших Y
        newBounds.innerEdgeBottom = best.innerEdgeFromLowSide;
      }
    }
  }

  // Snap к ближайшему V-таргету для left/right
  if (edge === "left" || edge === "right") {
    let best: SnapTarget | null = null;
    let bestDist = Infinity;
    for (const vt of vTargets) {
      if (edge === "left" && vt.pos >= newBounds.right) continue;
      if (edge === "right" && vt.pos <= newBounds.left) continue;
      const d = Math.abs(vt.pos - mouseX);
      if (d < bestDist) { bestDist = d; best = vt; }
    }
    if (best) {
      if (edge === "left") {
        newBounds.left = best.pos;
        newBounds.leftIsWall = best.isWall;
        // Таргет СЛЕВА от двери → ниша справа от таргета → кромка со стороны больших X
        newBounds.innerEdgeLeft = best.innerEdgeFromHighSide;
      } else {
        newBounds.right = best.pos;
        newBounds.rightIsWall = best.isWall;
        // Таргет СПРАВА от двери → ниша слева от таргета → кромка со стороны меньших X
        newBounds.innerEdgeRight = best.innerEdgeFromLowSide;
      }
    }
  }

  // Clamp по соседним дверям: не даём пересечь соседку если они перекрываются
  const overlapsVertically = (d: any) => {
    const dT = d.doorTop ?? 0, dB = d.doorBottom ?? iH;
    return dT < newBounds.bottom - 1 && dB > newBounds.top + 1;
  };
  const overlapsHorizontally = (d: any) => {
    const dL = d.doorLeft ?? 0, dR = d.doorRight ?? iW;
    return dL < newBounds.right - 1 && dR > newBounds.left + 1;
  };

  if (edge === "right") {
    for (const d of otherDoors) {
      if (!overlapsVertically(d)) continue;
      if (d.doorLeft >= newBounds.left && newBounds.right > d.doorLeft) {
        newBounds.right = d.doorLeft;
        newBounds.rightIsWall = false;
        newBounds.innerEdgeRight = d.doorLeft; // край соседней двери — кромка ниши
      }
    }
  } else if (edge === "left") {
    for (const d of otherDoors) {
      if (!overlapsVertically(d)) continue;
      if (d.doorRight <= newBounds.right && newBounds.left < d.doorRight) {
        newBounds.left = d.doorRight;
        newBounds.leftIsWall = false;
        newBounds.innerEdgeLeft = d.doorRight;
      }
    }
  } else if (edge === "bottom") {
    for (const d of otherDoors) {
      if (!overlapsHorizontally(d)) continue;
      const dTop = d.doorTop ?? 0;
      if (dTop >= newBounds.top && newBounds.bottom > dTop) {
        newBounds.bottom = dTop;
        newBounds.bottomIsWall = false;
        newBounds.innerEdgeBottom = dTop;
      }
    }
  } else if (edge === "top") {
    for (const d of otherDoors) {
      if (!overlapsHorizontally(d)) continue;
      const dBot = d.doorBottom ?? iH;
      if (dBot <= newBounds.bottom && newBounds.top < dBot) {
        newBounds.top = dBot;
        newBounds.topIsWall = false;
        newBounds.innerEdgeTop = dBot;
      }
    }
  }

  // ═══ Расчёт итогового прямоугольника двери из кромок ниши ═══
  const niL = newBounds.innerEdgeLeft;
  const niR = newBounds.innerEdgeRight;
  const niT = newBounds.innerEdgeTop;
  const niB = newBounds.innerEdgeBottom;
  const hingeType = el.hingeType || "overlay";

  let dX: number, dW: number, dY: number, dH: number;
  if (hingeType === "overlay") {
    const lo = newBounds.leftIsWall ? OC : OS;
    const ro = newBounds.rightIsWall ? OC : OS;
    const to = newBounds.topIsWall ? OC : OS;
    const bo = newBounds.bottomIsWall ? OC : OS;
    dX = niL - lo;
    dW = (niR - niL) + lo + ro;
    dY = niT - to;
    dH = (niB - niT) + to + bo;
  } else {
    // Вкладная: ВНУТРИ ниши с зазором 2мм по периметру
    dX = niL + INSERT_GAP;
    dW = (niR - niL) - INSERT_GAP * 2;
    dY = niT + INSERT_GAP;
    dH = (niB - niT) - INSERT_GAP * 2;
  }

  // Clamp: дверь не может вылезть за рамку
  if (dX < 0) { dW += dX; dX = 0; }
  if (dX + dW > iW) dW = iW - dX;
  if (dY < 0) { dH += dY; dY = 0; }
  if (dY + dH > iH) dH = iH - dY;

  return {
    x: dX, y: dY, w: dW, h: dH,
    doorW: dW, doorH: dH,
    doorLeft: newBounds.left, doorRight: newBounds.right,
    doorTop: newBounds.top, doorBottom: newBounds.bottom,
    doorLeftIsWall: newBounds.leftIsWall, doorRightIsWall: newBounds.rightIsWall,
    doorTopIsWall: newBounds.topIsWall, doorBottomIsWall: newBounds.bottomIsWall,
  };
}

/**
 * Пересчёт панели при resize — обёртка над computeDoorResize.
 * Панель использует поля panelLeft/panelRight/panelTop/panelBottom
 * и panelType (overlay/insert) вместо дверных аналогов.
 *
 * Реализация: временно маппим panel* → door*, вызываем door-логику,
 * маппим результат обратно. Поведение snap/clamp идентично двери.
 */
export interface PanelResizeResult {
  x: number;
  y: number;
  w: number;
  h: number;
  panelW: number;
  panelH: number;
  panelLeft: number;
  panelRight: number;
  panelTop: number;
  panelBottom: number;
  panelLeftIsWall: boolean;
  panelRightIsWall: boolean;
  panelTopIsWall: boolean;
  panelBottomIsWall: boolean;
}

export function computePanelResize(
  el: any,
  mouseX: number,
  mouseY: number,
  edge: "top" | "bottom" | "left" | "right",
  vTargets: SnapTarget[],
  hTargets: SnapTarget[],
  otherPanels: any[],
  iW: number,
  iH: number,
  t: number,
): PanelResizeResult {
  // Маппим panel* → door* для переиспользования логики двери
  const doorLike = {
    ...el,
    doorLeft: el.panelLeft,
    doorRight: el.panelRight,
    doorTop: el.panelTop,
    doorBottom: el.panelBottom,
    doorLeftIsWall: el.panelLeftIsWall,
    doorRightIsWall: el.panelRightIsWall,
    doorTopIsWall: el.panelTopIsWall,
    doorBottomIsWall: el.panelBottomIsWall,
    hingeType: el.panelType || "overlay",
  };
  const otherDoorLike = otherPanels.map(p => ({
    doorLeft: p.panelLeft,
    doorRight: p.panelRight,
    doorTop: p.panelTop,
    doorBottom: p.panelBottom,
  }));
  const res = computeDoorResize(doorLike, mouseX, mouseY, edge, vTargets, hTargets, otherDoorLike, iW, iH, t);

  // Маппим обратно door* → panel*
  return {
    x: res.x, y: res.y, w: res.w, h: res.h,
    panelW: res.doorW, panelH: res.doorH,
    panelLeft: res.doorLeft, panelRight: res.doorRight,
    panelTop: res.doorTop, panelBottom: res.doorBottom,
    panelLeftIsWall: res.doorLeftIsWall, panelRightIsWall: res.doorRightIsWall,
    panelTopIsWall: res.doorTopIsWall, panelBottomIsWall: res.doorBottomIsWall,
  };
}

// ───────────────────────────────────────────────────────────────
// Helpers: восстановление innerEdge по сохранённой координате
// Дублируются из placement.ts чтобы не создавать циклическую зависимость
// и иметь полный контроль в этом файле. Логика идентична.
// ───────────────────────────────────────────────────────────────

function computeInnerEdgeX(
  pos: number,
  nicheOnRightSide: boolean,
  iW: number, t: number,
): number {
  if (pos === 0 || pos === iW) return pos; // внешняя стена
  return nicheOnRightSide ? pos + t : pos; // стойка [pos, pos+t]
}

function computeInnerEdgeY(
  pos: number,
  nicheBelow: boolean,
  iH: number, t: number,
): number {
  if (pos === 0 || pos === iH) return pos; // внешняя стена
  const SMART_Y_EDGE = 5;
  let shTop: number, shBot: number;
  if (pos < SMART_Y_EDGE) { shTop = pos; shBot = pos + t; }
  else if (pos > iH - SMART_Y_EDGE) { shTop = pos - t; shBot = pos; }
  else { shTop = pos - t / 2; shBot = pos + t / 2; }
  return nicheBelow ? shBot : shTop;
}
