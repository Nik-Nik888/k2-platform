/**
 * Пересчёт двери при resize: snap к ближайшим границам, clamp к соседним дверям,
 * clamp к рамке. Чистая функция без state.
 */
import { SnapTarget } from "./doorBounds";
import { DOOR_OVERLAY_CORPUS as OC, DOOR_OVERLAY_STUD as OS } from "../constants";

export interface DoorResizeBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  leftIsWall: boolean;
  rightIsWall: boolean;
  topIsWall: boolean;
  bottomIsWall: boolean;
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
  const newBounds: DoorResizeBounds = {
    left: el.doorLeft ?? 0,
    right: el.doorRight ?? iW,
    top: el.doorTop ?? 0,
    bottom: el.doorBottom ?? iH,
    leftIsWall: el.doorLeftIsWall ?? true,
    rightIsWall: el.doorRightIsWall ?? true,
    topIsWall: el.doorTopIsWall ?? true,
    bottomIsWall: el.doorBottomIsWall ?? true,
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
      if (edge === "top") { newBounds.top = best.pos; newBounds.topIsWall = best.isWall; }
      else { newBounds.bottom = best.pos; newBounds.bottomIsWall = best.isWall; }
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
      if (edge === "left") { newBounds.left = best.pos; newBounds.leftIsWall = best.isWall; }
      else { newBounds.right = best.pos; newBounds.rightIsWall = best.isWall; }
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
      }
    }
  } else if (edge === "left") {
    for (const d of otherDoors) {
      if (!overlapsVertically(d)) continue;
      if (d.doorRight <= newBounds.right && newBounds.left < d.doorRight) {
        newBounds.left = d.doorRight;
        newBounds.leftIsWall = false;
      }
    }
  } else if (edge === "bottom") {
    for (const d of otherDoors) {
      if (!overlapsHorizontally(d)) continue;
      const dTop = d.doorTop ?? 0;
      if (dTop >= newBounds.top && newBounds.bottom > dTop) {
        newBounds.bottom = dTop;
        newBounds.bottomIsWall = false;
      }
    }
  } else if (edge === "top") {
    for (const d of otherDoors) {
      if (!overlapsHorizontally(d)) continue;
      const dBot = d.doorBottom ?? iH;
      if (dBot <= newBounds.bottom && newBounds.top < dBot) {
        newBounds.top = dBot;
        newBounds.topIsWall = false;
      }
    }
  }

  // Вычисляем реальные размеры двери в зависимости от hingeType
  const lo = newBounds.leftIsWall ? OC : OS;
  const ro = newBounds.rightIsWall ? OC : OS;
  const to = newBounds.topIsWall ? OC : OS;
  const bo = newBounds.bottomIsWall ? OC : OS;
  const innerLeft = newBounds.left + (newBounds.left > 0 ? t : 0);
  const innerW = newBounds.right - innerLeft;
  const hingeType = el.hingeType || "overlay";

  let dX: number, dW: number, dY: number, dH: number;
  if (hingeType === "overlay") {
    dX = innerLeft - lo;
    dW = innerW + lo + ro;
    dY = newBounds.top - to;
    dH = (newBounds.bottom - newBounds.top) + to + bo;
  } else {
    const gap = 2;
    dX = innerLeft + gap;
    dW = innerW - gap * 2;
    dY = newBounds.top + gap;
    dH = (newBounds.bottom - newBounds.top) - gap * 2;
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
