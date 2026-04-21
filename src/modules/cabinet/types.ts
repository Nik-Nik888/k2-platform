/**
 * Типы редактора корпусной мебели.
 * Пока — базовые определения. Будут дополняться по мере рефакторинга.
 */

export type ElementType = "shelf" | "stud" | "drawers" | "rod" | "door";

/** Базовый элемент внутри шкафа. */
export interface BaseElement {
  id: string;
  type: ElementType;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  _order?: number;
  /**
   * Глубина элемента в мм (по оси Z шкафа). Если undefined — используется corpus.depth.
   * Примеры: полка половинной глубины (300 при корпусе 600), ящик 3/4 длины.
   */
  depth?: number;
  /**
   * Отступ элемента от задней стенки в мм. Если undefined — 0 (элемент у задней стенки).
   * Важно для раздвижных дверей на разных рельсах и полок у передней кромки.
   * Должно выполняться: depthOffset + depth ≤ corpus.depth.
   */
  depthOffset?: number;
}

export interface ShelfElement extends BaseElement {
  type: "shelf";
  x: number;
  y: number;
  w: number;
  manualX?: number;
  manualW?: number;
}

export interface StudElement extends BaseElement {
  type: "stud";
  x: number;
  pTop?: number;
  pBot?: number;
  manualPTop?: number;
  manualPBot?: number;
  anchorY?: number;
}

export interface DrawersElement extends BaseElement {
  type: "drawers";
  x: number;
  y: number;
  w: number;
  h: number;
  count: number;
  guideType?: "roller" | "ball" | "tandem";
  drawerHeights?: number[];
}

export interface RodElement extends BaseElement {
  type: "rod";
  x: number;
  y: number;
  w: number;
}

export interface DoorElement extends BaseElement {
  type: "door";
  x: number;
  y: number;
  w: number;
  h: number;
  doorW?: number;
  doorH?: number;
  doorLeft?: number;
  doorRight?: number;
  doorTop?: number;
  doorBottom?: number;
  doorLeftIsWall?: boolean;
  doorRightIsWall?: boolean;
  doorTopIsWall?: boolean;
  doorBottomIsWall?: boolean;
  hingeType?: "overlay" | "insert";
  hingeSide?: "left" | "right";
  manualW?: number;
  manualH?: number;
}

export type CabinetElement =
  | ShelfElement | StudElement | DrawersElement | RodElement | DoorElement;

export interface Corpus {
  width: number;
  height: number;
  depth: number;
  thickness: number;
}

/** Направление изменения размера в DIMS (legacy). */
export type DimDir = "left" | "right" | "top" | "bottom";

/** State активного drag-а. */
export interface DragState {
  id: string;
  type: ElementType | "door-resize";
  startX: number;
  startY: number;
  moved: boolean;
  ox?: number;
  oy?: number;
  edge?: "top" | "bottom" | "left" | "right";
}

export interface CustomTexture {
  id: string;
  name: string;
  code?: string;
  hex?: string;
  dataUrl: string;
  brand?: string;
}

export interface CustomBrand {
  id: string;
  name: string;
}
