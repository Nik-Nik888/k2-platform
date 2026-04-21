/**
 * Вычислить новую позицию элемента при drag.
 * Учитывает тип элемента и границы рамки.
 */
import { SNAP } from "../constants";

export interface DragPayload {
  id: string;
  type: string;
  ox: number;
  oy: number;
  startX: number;
  startY: number;
  moved: boolean;
  edge?: "top" | "bottom" | "left" | "right";
}

/**
 * Переместить один элемент согласно drag'у.
 * Возвращает обновлённый элемент или исходный (если не он тащится).
 *
 * Для stud: двигается по X (snap SNAP мм), clamp 0..iW-t, snap к краям
 * Для shelf: двигается по Y
 * Для door: двигается по X и Y в пределах iW/iH (только когда mobileDragMode)
 * Для drawers/rod: двигается по Y, X через _dragX для adjust()
 */
export function moveElement(
  el: any,
  drag: DragPayload,
  cX: number,
  cY: number,
  iW: number,
  iH: number,
  t: number,
): any {
  if (el.id !== drag.id) return el;

  if (drag.type === "stud") {
    let nx = Math.round((cX - drag.ox) / SNAP) * SNAP;
    nx = Math.max(0, Math.min(iW - t, nx));
    // Snap к краям рамки
    if (nx < 10) nx = 0;
    if (nx > iW - t - 10) nx = iW - t;
    const anchorY = Math.max(0, Math.min(iH, Math.round(cY)));
    return { ...el, x: nx, anchorY };
  }

  if (drag.type === "shelf") {
    const ny = Math.max(0, Math.min(iH, Math.round(cY - drag.oy)));
    return { ...el, y: ny };
  }

  if (drag.type === "door") {
    // Дверь двигается по X и Y одновременно в пределах iW/iH
    const nx = Math.max(0, Math.min(iW - (el.w || 50), Math.round(cX - drag.ox)));
    const ny = Math.max(0, Math.min(iH - (el.h || 50), Math.round(cY - drag.oy)));
    return { ...el, x: nx, y: ny };
  }

  // drawers / rod: по Y, X записывается в _dragX и обрабатывается в adjust()
  const ny = Math.max(
    0,
    Math.min(iH - (drag.type === "drawers" ? (el.h || 450) : 20), Math.round(cY - drag.oy)),
  );
  return { ...el, y: ny, _dragX: cX };
}
