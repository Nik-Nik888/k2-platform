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

  // ═══ Внутренние кромки ниши (единая логика) ═══
  const lo = newBounds.leftIsWall ? OC : OS;
  const ro = newBounds.rightIsWall ? OC : OS;
  const to = newBounds.topIsWall ? OC : OS;
  const bo = newBounds.bottomIsWall ? OC : OS;

  const innerEdgeRightOf = (x: number, isWall: boolean) => isWall ? x : x + t / 2;
  const innerEdgeLeftOf = (x: number, isWall: boolean) => isWall ? x : x - t / 2;
  const innerEdgeBelow = (y: number, isWall: boolean) => isWall ? y : y + t / 2;
  const innerEdgeAbove = (y: number, isWall: boolean) => isWall ? y : y - t / 2;

  const niL = innerEdgeRightOf(newBounds.left, newBounds.leftIsWall);
  const niR = innerEdgeLeftOf(newBounds.right, newBounds.rightIsWall);
  const niT = innerEdgeBelow(newBounds.top, newBounds.topIsWall);
  const niB = innerEdgeAbove(newBounds.bottom, newBounds.bottomIsWall);
  const hingeType = el.hingeType || "overlay";

  let dX: number, dW: number, dY: number, dH: number;
  if (hingeType === "overlay") {
    dX = niL - lo;
    dW = (niR - niL) + lo + ro;
    dY = niT - to;
    dH = (niB - niT) + to + bo;
  } else {
    // Вкладная: ВНУТРИ ниши с зазором 2мм по периметру
    const gap = 2;
    dX = niL + gap;
    dW = (niR - niL) - gap * 2;
    dY = niT + gap;
    dH = (niB - niT) - gap * 2;
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
