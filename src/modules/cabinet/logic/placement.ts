/**
 * Pure-функция размещения нового элемента в проёме.
 *
 * Принимает:
 * - placeMode — какой тип ставим
 * - clickX/clickY — координаты клика (мм от внутренней рамки)
 * - контекст с elements, bounds-функцией, размерами
 *
 * Возвращает:
 * - { element, keepPlaceMode } — новый элемент и флаг удержания режима (для shelf/stud)
 * - null — если ничего не добавлять (например, слишком узкий проём для ящиков)
 *
 * Вызывающий код делает:
 *   const result = placeInZone({...});
 *   if (!result) return;
 *   setElements(prev => adjust([...prev, result.element]));
 *   if (!result.keepPlaceMode) { setPlaceMode(null); setSelId(result.element.id); }
 *
 * ───────────────────────────────────────────────────────────────
 * ВАЖНО по геометрии insert/overlay режимов:
 *
 * Для дверей и панелей используется поле bound.innerEdge, вычисленное в doorBounds.ts
 * с учётом Smart-Y рендера полок и физического размещения стоек [x, x+t].
 *
 * Внутренняя кромка ниши = та сторона соседа, которая обращена в нишу.
 * - Для внешней стены корпуса: innerEdge = координата стены
 * - Для стойки слева от ниши: innerEdge = x + t (правая кромка)
 * - Для стойки справа от ниши: innerEdge = x (левая кромка)
 * - Для полки у верха (sh.y<5, рендер [y, y+t]): innerEdge сверху от ниши = y + t
 * - Для полки у низа (sh.y>iH-5, рендер [y-t, y]): innerEdge снизу от ниши = y - t
 * - Для полки в середине (рендер [y-t/2, y+t/2]): ±t/2 от sh.y
 *
 * INSERT: дверь/панель ВНУТРИ ниши с зазором 2мм по периметру
 * OVERLAY: дверь/панель выступает за кромку ниши на OC=14 (стена) или OS=7 (стойка/полка)
 * ───────────────────────────────────────────────────────────────
 */
import { uid, DOOR_OVERLAY_CORPUS, DOOR_OVERLAY_STUD } from "../constants";
import type { DoorBoundsResult } from "./doorBounds";

export type PlaceMode = "shelf" | "stud" | "drawers" | "rod" | "door" | "panel";

/**
 * Зазор между вкладной дверью/панелью и кромкой ниши (мм).
 * 3мм — минимум для производства insert-дверей (чтобы фасад не тёр о соседей
 * при лёгком перекосе корпуса). Визуально на типичном SC=0.28 даёт ~0.84px
 * зазора — это минимум, при котором зазор различим глазом на однотонном фоне.
 */
const INSERT_GAP = 3;

export interface PlacementCtx {
  placeMode: PlaceMode;
  clickX: number;
  clickY: number;
  /** Внутренние размеры рамки (mm). */
  iW: number;
  iH: number;
  /** Толщина ЛДСП (mm). */
  t: number;
  /** Текущие элементы шкафа. */
  elements: any[];
  /** Счётчик для сортировки (передаётся и инкрементируется снаружи). */
  order: number;
  /** Функция нахождения 4-х граничных линий вокруг точки клика. */
  findDoorBounds: (clickX: number, clickY: number) => DoorBoundsResult;
  /**
   * Пре-настройки для новой двери (используются только при placeMode === 'door').
   * Если не заданы — дверь ставится как overlay с автовыбором стороны петель.
   */
  doorHingeType?: "overlay" | "insert";
  /** 'auto' = по центру двери относительно проёма (старое поведение). */
  doorHingeSide?: "left" | "right" | "auto";
  /**
   * Пре-настройки для новой панели (используются только при placeMode === 'panel').
   * Если не задан — панель ставится как insert (старое поведение).
   */
  panelType?: "overlay" | "insert";
}

export interface PlacementResult {
  element: any;
  /** true для shelf/stud — режим остаётся активным для серии постановок. */
  keepPlaceMode: boolean;
}

export function placeInZone(ctx: PlacementCtx): PlacementResult | null {
  const { placeMode, clickX, clickY, iW, iH, t, elements, order, findDoorBounds } = ctx;
  const id = uid();

  if (placeMode === "shelf") {
    return placeShelf({ id, order, clickY, iH, t, findDoorBounds, clickX });
  }
  if (placeMode === "stud") {
    return placeStud({ id, order, clickX, iW, t, findDoorBounds, clickY });
  }
  if (placeMode === "drawers") {
    return placeDrawers({ id, order, clickX, clickY, iW, iH, t, elements, findDoorBounds });
  }
  if (placeMode === "rod") {
    return placeRod({ id, order, clickX, clickY, t, elements, findDoorBounds });
  }
  if (placeMode === "door") {
    return placeDoor({
      id, order, clickX, clickY, iW, iH, t, elements, findDoorBounds,
      hingeType: ctx.doorHingeType ?? "overlay",
      hingeSide: ctx.doorHingeSide ?? "auto",
    });
  }
  if (placeMode === "panel") {
    return placePanel({
      id, order, clickX, clickY, iW, iH, t, elements, findDoorBounds,
      panelType: ctx.panelType ?? "insert",
    });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// SHELF
// ───────────────────────────────────────────────────────────────

function placeShelf(p: {
  id: string; order: number; clickX: number; clickY: number;
  iH: number; t: number;
  findDoorBounds: (x: number, y: number) => DoorBoundsResult;
}): PlacementResult {
  const { id, order, clickX, clickY, iH, t, findDoorBounds } = p;
  // Полка занимает промежуток между ближайшими стойками/стенами на своём Y-уровне
  const bounds = findDoorBounds(clickX, clickY);
  const shX = bounds.left.x + (bounds.left.isWall ? 0 : t); // offset после левой стойки (если есть)
  const shW = bounds.right.x - shX; // до следующей стойки/стены
  const y = Math.max(0, Math.min(iH, Math.round(clickY)));
  return {
    element: { id, type: "shelf", x: shX, y, w: shW, anchorX: shX + shW / 2, _order: order },
    keepPlaceMode: true,
  };
}

// ───────────────────────────────────────────────────────────────
// STUD
// ───────────────────────────────────────────────────────────────

function placeStud(p: {
  id: string; order: number; clickX: number; clickY: number;
  iW: number; t: number;
  findDoorBounds: (x: number, y: number) => DoorBoundsResult;
}): PlacementResult {
  const { id, order, clickX, clickY, iW, t, findDoorBounds } = p;
  const bounds = findDoorBounds(clickX, clickY);
  // Для стойки: X клика задаёт центр, но у края — snap к стене
  let studX: number;
  if (clickX < 20) studX = 0; // snap к левому краю
  else if (clickX > iW - t - 20) studX = iW - t; // snap к правому краю
  else studX = Math.max(0, Math.min(iW - t, Math.round(clickX - t / 2)));
  return {
    element: {
      id, type: "stud",
      x: studX,
      anchorY: Math.round((bounds.top.y + bounds.bottom.y) / 2),
      pTop: bounds.top.y,
      pBot: bounds.bottom.y,
      _order: order,
    },
    keepPlaceMode: true,
  };
}

// ───────────────────────────────────────────────────────────────
// DRAWERS — сложный блок с определением границ и clamp-ами
// ───────────────────────────────────────────────────────────────

function placeDrawers(p: {
  id: string; order: number; clickX: number; clickY: number;
  iW: number; iH: number; t: number;
  elements: any[];
  findDoorBounds: (x: number, y: number) => DoorBoundsResult;
}): PlacementResult | null {
  const { id, order, clickX, clickY, iW, iH, t, elements, findDoorBounds } = p;
  const bounds = findDoorBounds(clickX, clickY);
  const allShelves = elements.filter(e => e.type === "shelf");
  const allStuds = elements.filter(e => e.type === "stud");

  const studAtLeft = allStuds.some(st => Math.abs(st.x - bounds.left.x) < 2);
  const studAtRight = allStuds.some(st =>
    Math.abs(st.x - (bounds.right.x - t)) < 2 || Math.abs(st.x - bounds.right.x) < 2);
  const shelfAtTop = allShelves.some(sh => Math.abs(sh.y - bounds.top.y) < 2);
  const shelfAtBot = allShelves.some(sh => Math.abs(sh.y - bounds.bottom.y) < 2);

  let innerLeft = bounds.left.x + ((!bounds.left.isWall || studAtLeft) ? t : 0);
  let innerRight = bounds.right.x; // правая стойка: её x = её левый край → ящик кончается там

  let topY = bounds.top.y;
  if (!bounds.top.isWall || shelfAtTop) {
    topY = bounds.top.y < 1 ? t : bounds.top.y + t / 2;
  }
  let botY = bounds.bottom.y;
  if (!bounds.bottom.isWall || shelfAtBot) {
    botY = bounds.bottom.y > iH - 1 ? iH - t : bounds.bottom.y - t / 2;
  }

  // HARD CLAMP: никогда не наслаиваться на краевые стойки/полки, не вылезать за рамку
  const hasEdgeStudLeft = allStuds.some(st => st.x < 2);
  const hasEdgeStudRight = allStuds.some(st => st.x > iW - t - 2);
  const hasEdgeShelfTop = allShelves.some(sh => sh.y < 2);
  const hasEdgeShelfBot = allShelves.some(sh => sh.y > iH - 2);
  if (hasEdgeStudLeft) innerLeft = Math.max(innerLeft, t);
  if (hasEdgeStudRight) innerRight = Math.min(innerRight, iW - t);
  if (hasEdgeShelfTop) topY = Math.max(topY, t);
  if (hasEdgeShelfBot) botY = Math.min(botY, iH - t);
  innerLeft = Math.max(0, innerLeft);
  innerRight = Math.min(iW, innerRight);
  topY = Math.max(0, topY);
  botY = Math.min(iH, botY);

  const innerW = innerRight - innerLeft;
  const maxH = botY - topY;
  // Отказ если зона слишком узкая/низкая
  if (innerW < 100 || maxH < 100) {
    return null;
  }
  const h = Math.min(450, maxH);
  const h1 = Math.floor(h / 3);
  const h2 = Math.floor(h / 3);
  const h3 = h - h1 - h2;
  return {
    element: {
      id, type: "drawers",
      x: innerLeft, y: botY - h, w: innerW, h,
      count: 3, guideType: "roller",
      drawerHeights: [h1, h2, h3],
      _order: order,
    },
    keepPlaceMode: false,
  };
}

// ───────────────────────────────────────────────────────────────
// ROD — простая штанга
// ───────────────────────────────────────────────────────────────

function placeRod(p: {
  id: string; order: number; clickX: number; clickY: number;
  t: number;
  elements: any[];
  findDoorBounds: (x: number, y: number) => DoorBoundsResult;
}): PlacementResult {
  const { id, order, clickX, clickY, t, elements, findDoorBounds } = p;
  const bounds = findDoorBounds(clickX, clickY);
  const allStuds = elements.filter(e => e.type === "stud");
  const studAtLeft = allStuds.some(st => Math.abs(st.x - bounds.left.x) < 2);
  const innerLeft = bounds.left.x + ((!bounds.left.isWall || studAtLeft) ? t : 0);
  const innerRight = bounds.right.x;
  const innerW = innerRight - innerLeft;
  return {
    element: {
      id, type: "rod",
      x: innerLeft + 20, y: Math.round(clickY),
      w: innerW - 40,
      _order: order,
    },
    keepPlaceMode: false,
  };
}

// ───────────────────────────────────────────────────────────────
// DOOR — самый сложный блок: overlay/insert, деление проёма, clamp
// ───────────────────────────────────────────────────────────────

function placeDoor(p: {
  id: string; order: number; clickX: number; clickY: number;
  iW: number; iH: number; t: number;
  elements: any[];
  findDoorBounds: (x: number, y: number) => DoorBoundsResult;
  hingeType: "overlay" | "insert";
  hingeSide: "left" | "right" | "auto";
}): PlacementResult {
  const { id, order, clickX, clickY, iW, iH, t, elements, findDoorBounds, hingeType, hingeSide } = p;
  const bounds = findDoorBounds(clickX, clickY);

  // Уже существующие двери в этом же проёме (совпадающие top/bottom границы) —
  // чтобы новая дверь делила проём пополам, а не накладывалась.
  const sameBoundsDoors = elements.filter(e =>
    e.type === "door"
    && Math.abs((e.doorTop || 0) - bounds.top.y) < 5
    && Math.abs((e.doorBottom || iH) - bounds.bottom.y) < 5
    && (e.doorLeft || 0) >= bounds.left.x - 5
    && (e.doorRight || iW) <= bounds.right.x + 5
  );

  // Куда именно вставать: если клик в левой половине — занимаем левую, иначе правую
  const openingMid = (bounds.left.x + bounds.right.x) / 2;
  const wantLeftHalf = clickX < openingMid;

  let effLeft = bounds.left.x;
  let effRight = bounds.right.x;
  let effLeftIsWall = bounds.left.isWall;
  let effRightIsWall = bounds.right.isWall;
  // Стартуем с уже посчитанных innerEdge из bounds; при делении проёма они пересчитываются.
  let effLeftInnerEdge = bounds.left.innerEdge;
  let effRightInnerEdge = bounds.right.innerEdge;

  if (sameBoundsDoors.length > 0) {
    const hasDoorLeft = sameBoundsDoors.some(d => ((d.doorLeft || 0) + (d.doorRight || iW)) / 2 < openingMid);
    const hasDoorRight = sameBoundsDoors.some(d => ((d.doorLeft || 0) + (d.doorRight || iW)) / 2 >= openingMid);
    if (hasDoorLeft && hasDoorRight) {
      // обе половины заняты → fallback, накладываем (граничный случай)
    } else if (hasDoorLeft && !hasDoorRight) {
      effLeft = openingMid;
      effLeftIsWall = false;
      effLeftInnerEdge = openingMid; // на середине проёма — край соседней двери
    } else if (!hasDoorLeft && hasDoorRight) {
      effRight = openingMid;
      effRightIsWall = false;
      effRightInnerEdge = openingMid;
    } else if (wantLeftHalf) {
      effRight = openingMid;
      effRightIsWall = false;
      effRightInnerEdge = openingMid;
    } else {
      effLeft = openingMid;
      effLeftIsWall = false;
      effLeftInnerEdge = openingMid;
    }
  }

  // ═══ Границы ниши — через innerEdge каждого соседа ═══
  const niL = effLeftInnerEdge;
  const niR = effRightInnerEdge;
  const niT = bounds.top.innerEdge;
  const niB = bounds.bottom.innerEdge;

  const { x: dX, y: dY, w: dW, h: dH } = computeOverlayOrInsertRect({
    niL, niR, niT, niB,
    leftIsWall: effLeftIsWall, rightIsWall: effRightIsWall,
    topIsWall: bounds.top.isWall, bottomIsWall: bounds.bottom.isWall,
    mode: hingeType,
    iW, iH,
  });

  // Сторона петель: если пользователь явно выбрал — используем его выбор.
  // Если 'auto' — петли у стенки, ручка в центр проёма:
  //   - если делим проём пополам (sameBoundsDoors): смотрим в какую половину встала дверь
  //   - иначе — по центру двери относительно проёма
  let autoHingeSide: "left" | "right";
  if (hingeSide === "left" || hingeSide === "right") {
    autoHingeSide = hingeSide;
  } else if (sameBoundsDoors.length > 0) {
    autoHingeSide = effRight <= openingMid + 1 ? "left" : "right";
  } else {
    const doorCenterX = dX + dW / 2;
    const openingCenterX = (effLeft + effRight) / 2;
    autoHingeSide = doorCenterX < openingCenterX ? "left" : "right";
  }

  return {
    element: {
      id, type: "door",
      x: dX, y: dY, w: dW, h: dH,
      doorW: dW, doorH: dH,
      hingeSide: autoHingeSide, hingeType,
      doorLeft: effLeft, doorRight: effRight,
      doorTop: bounds.top.y, doorBottom: bounds.bottom.y,
      doorLeftIsWall: effLeftIsWall, doorRightIsWall: effRightIsWall,
      doorTopIsWall: bounds.top.isWall, doorBottomIsWall: bounds.bottom.isWall,
      _order: order,
    },
    keepPlaceMode: false,
  };
}

// ───────────────────────────────────────────────────────────────
// PANEL — декоративная ЛДСП-панель (цоколь, антресоль, заглушка).
// Логика размещения похожа на дверь (overlay/insert режимы),
// но без петель/ручки/деления проёма пополам.
// ───────────────────────────────────────────────────────────────

function placePanel(p: {
  id: string; order: number; clickX: number; clickY: number;
  iW: number; iH: number; t: number;
  elements: any[];
  findDoorBounds: (x: number, y: number) => DoorBoundsResult;
  panelType: "overlay" | "insert";
}): PlacementResult {
  const { id, order, clickX, clickY, iW, iH, findDoorBounds, panelType } = p;
  const bounds = findDoorBounds(clickX, clickY);

  const niL = bounds.left.innerEdge;
  const niR = bounds.right.innerEdge;
  const niT = bounds.top.innerEdge;
  const niB = bounds.bottom.innerEdge;

  const { x: dX, y: dY, w: dW, h: dH } = computeOverlayOrInsertRect({
    niL, niR, niT, niB,
    leftIsWall: bounds.left.isWall, rightIsWall: bounds.right.isWall,
    topIsWall: bounds.top.isWall, bottomIsWall: bounds.bottom.isWall,
    mode: panelType,
    iW, iH,
  });

  return {
    element: {
      id, type: "panel",
      x: dX, y: dY, w: dW, h: dH,
      panelW: dW, panelH: dH,
      panelType,
      panelLeft: bounds.left.x, panelRight: bounds.right.x,
      panelTop: bounds.top.y, panelBottom: bounds.bottom.y,
      panelLeftIsWall: bounds.left.isWall, panelRightIsWall: bounds.right.isWall,
      panelTopIsWall: bounds.top.isWall, panelBottomIsWall: bounds.bottom.isWall,
      depthOffset: 0,
      _order: order,
    },
    keepPlaceMode: false,
  };
}

// ───────────────────────────────────────────────────────────────
// Общая функция расчёта прямоугольника двери/панели из кромок ниши.
// Используется в placeDoor, placePanel, computePanelDimensions, computeDoorDimensions.
// ───────────────────────────────────────────────────────────────

interface OverlayOrInsertInput {
  /** Внутренние кромки ниши (mm): niL/niR — X-кромки, niT/niB — Y-кромки. */
  niL: number; niR: number; niT: number; niB: number;
  leftIsWall: boolean; rightIsWall: boolean;
  topIsWall: boolean; bottomIsWall: boolean;
  mode: "overlay" | "insert";
  iW: number; iH: number;
}

function computeOverlayOrInsertRect(inp: OverlayOrInsertInput): {
  x: number; y: number; w: number; h: number;
} {
  const { niL, niR, niT, niB, leftIsWall, rightIsWall, topIsWall, bottomIsWall, mode, iW, iH } = inp;
  const OC = DOOR_OVERLAY_CORPUS;
  const OS = DOOR_OVERLAY_STUD;

  let x: number, y: number, w: number, h: number;

  if (mode === "overlay") {
    // Накладная: выступает за кромки ниши на OC (стена) или OS (стойка/полка)
    const leftOvh = leftIsWall ? OC : OS;
    const rightOvh = rightIsWall ? OC : OS;
    const topOvh = topIsWall ? OC : OS;
    const botOvh = bottomIsWall ? OC : OS;
    x = niL - leftOvh;
    w = (niR - niL) + leftOvh + rightOvh;
    y = niT - topOvh;
    h = (niB - niT) + topOvh + botOvh;
  } else {
    // Вкладная: ВНУТРИ ниши с зазором 2мм по периметру
    x = niL + INSERT_GAP;
    w = (niR - niL) - INSERT_GAP * 2;
    y = niT + INSERT_GAP;
    h = (niB - niT) - INSERT_GAP * 2;
  }

  // Clamp: не вылезать за рамку
  if (x < 0) { w += x; x = 0; }
  if (x + w > iW) w = iW - x;
  if (y < 0) { h += y; y = 0; }
  if (y + h > iH) h = iH - y;

  return { x, y, w, h };
}

/**
 * Пересчитать размеры панели (x, y, w, h) исходя из её границ (panelLeft/Right/Top/Bottom),
 * флагов isWall и нового panelType. Используется при переключении overlay ↔ insert,
 * чтобы панель автоматически подстроилась под новый тип, не "заходя" на стенки.
 *
 * ВАЖНО: принимает исходные координаты соседей (panelLeft/Right/Top/Bottom),
 * а внутри сама восстанавливает innerEdge через bounds-проверку рефа на elements.
 * Для этого нужны elements — добавлен необязательным параметром; если не передан,
 * используется упрощённая геометрия (со Smart-Y и thickness-offset).
 */
export interface PanelDimensionsResult {
  x: number;
  y: number;
  w: number;
  h: number;
  panelW: number;
  panelH: number;
}

export function computePanelDimensions(
  panelLeft: number,
  panelRight: number,
  panelTop: number,
  panelBottom: number,
  panelLeftIsWall: boolean,
  panelRightIsWall: boolean,
  panelTopIsWall: boolean,
  panelBottomIsWall: boolean,
  panelType: "overlay" | "insert",
  iW: number,
  iH: number,
  t: number,
): PanelDimensionsResult {
  // Восстановим внутренние кромки ниши из сохранённых координат соседей.
  // Для стоек/полок учитывается их физический рендер: стойка [x, x+t], полка — Smart-Y.
  // Параметр isWall критически важен: pos=0 со стеной → innerEdge=0, pos=0 с краевой
  // стойкой (isWall=false) → innerEdge=t (правая кромка стойки).
  const niL = computeInnerEdgeX(panelLeft,  /*nicheOnRightSide*/ true,  iW, t, panelLeftIsWall);
  const niR = computeInnerEdgeX(panelRight, /*nicheOnRightSide*/ false, iW, t, panelRightIsWall);
  const niT = computeInnerEdgeY(panelTop,    /*nicheBelow*/ true,  iH, t, panelTopIsWall);
  const niB = computeInnerEdgeY(panelBottom, /*nicheBelow*/ false, iH, t, panelBottomIsWall);

  const rect = computeOverlayOrInsertRect({
    niL, niR, niT, niB,
    leftIsWall: panelLeftIsWall, rightIsWall: panelRightIsWall,
    topIsWall: panelTopIsWall, bottomIsWall: panelBottomIsWall,
    mode: panelType,
    iW, iH,
  });

  return {
    x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    panelW: rect.w, panelH: rect.h,
  };
}

/**
 * Пересчитать размеры двери при переключении overlay ↔ insert.
 * Обёртка над computePanelDimensions (логика идентична).
 */
export interface DoorDimensionsResult {
  x: number; y: number; w: number; h: number;
  doorW: number; doorH: number;
}

export function computeDoorDimensions(
  doorLeft: number, doorRight: number, doorTop: number, doorBottom: number,
  doorLeftIsWall: boolean, doorRightIsWall: boolean,
  doorTopIsWall: boolean, doorBottomIsWall: boolean,
  hingeType: "overlay" | "insert",
  iW: number, iH: number, t: number,
): DoorDimensionsResult {
  const r = computePanelDimensions(
    doorLeft, doorRight, doorTop, doorBottom,
    doorLeftIsWall, doorRightIsWall, doorTopIsWall, doorBottomIsWall,
    hingeType, iW, iH, t,
  );
  return {
    x: r.x, y: r.y, w: r.w, h: r.h,
    doorW: r.panelW, doorH: r.panelH,
  };
}

// ───────────────────────────────────────────────────────────────
// Helpers: восстановление innerEdge по сохранённой координате + isWall
// Используются в computePanelDimensions/computeDoorDimensions при переключении
// типа (overlay ↔ insert) уже существующего элемента.
// ───────────────────────────────────────────────────────────────

/**
 * Восстановить innerEdge для X-границы по её сохранённым атрибутам.
 *
 * @param pos — координата границы: 0/iW для внешней стены, st.x для стойки
 * @param nicheOnRightSide — true если ниша справа от границы (bound.left двери),
 *                          false если ниша слева (bound.right двери)
 *
 * Логика:
 * - Внешняя стена корпуса (pos===0 или pos===iW): innerEdge = pos
 * - Стойка (любое другое pos): физический рендер [pos, pos+t]
 *   → innerEdge = pos+t, если ниша справа (bound.left)
 *   → innerEdge = pos,   если ниша слева  (bound.right)
 *
 * ПРИМЕЧАНИЕ: если бы у нас была краевая стойка ровно на pos=0, хелпер принял бы её
 * за внешнюю стену. На практике placeDoor сохраняет doorLeft = bounds.left.x,
 * а для краевой стойки bounds.left.x = st.x (обычно 0…5 в зависимости от snap),
 * поэтому случай pos=0 с краевой стойкой крайне редок. При необходимости можно
 * расширить API передачей elements и проверять наличие стойки с x≈0.
 */
/**
 * Восстановить innerEdge для X-границы по её сохранённым атрибутам.
 *
 * @param pos — координата границы: 0/iW для внешней стены или краевой стойки, st.x для стойки
 * @param posIsWall — true если pos — это внешняя стена корпуса; false если стойка (включая краевую)
 * @param nicheOnRightSide — true если ниша справа от границы (bound.left двери),
 *                          false если ниша слева (bound.right двери)
 *
 * Логика:
 * - Внешняя стена (isWall=true И pos=0/iW): innerEdge = pos (стена не имеет толщины)
 * - Стойка (isWall=false): рисуется [pos, pos+t]
 *   - ниша СПРАВА от стойки (nicheOnRightSide=true): innerEdge = pos + t (правая кромка)
 *   - ниша СЛЕВА от стойки (nicheOnRightSide=false): innerEdge = pos (левая кромка)
 */
function computeInnerEdgeX(
  pos: number,
  nicheOnRightSide: boolean,
  iW: number, t: number,
  posIsWall: boolean = true,
): number {
  // Внешняя стена корпуса — нет толщины, innerEdge = pos
  if (posIsWall && (pos === 0 || pos === iW)) return pos;
  // Стойка [pos, pos+t]
  return nicheOnRightSide ? pos + t : pos;
}

/**
 * Восстановить innerEdge для Y-границы с учётом Smart-Y рендера полок.
 *
 * @param pos — координата границы: 0/iH для внешней стены, sh.y для полки
 * @param nicheBelow — true если ниша снизу от границы (bound.top двери),
 *                    false если ниша сверху (bound.bottom двери)
 *
 * Логика синхронизирована с renderShelf() в elements.tsx и shelfRenderRange() в doorBounds.ts:
 * - Внешняя стена корпуса (pos===0 или pos===iH): innerEdge = pos
 * - Полка у верха (pos<5):   рендер [pos, pos+t]     → innerEdge = pos+t (ниша снизу)
 * - Полка у низа (pos>iH-5): рендер [pos-t, pos]     → innerEdge = pos-t (ниша сверху)
 * - Полка в середине:        рендер [pos-t/2, pos+t/2] → ±t/2 от pos
 */
function computeInnerEdgeY(
  pos: number,
  nicheBelow: boolean,
  iH: number, t: number,
  posIsWall: boolean = true,
): number {
  // Внешняя стена корпуса — нет толщины
  if (posIsWall && (pos === 0 || pos === iH)) return pos;
  const SMART_Y_EDGE = 5;
  let shTop: number, shBot: number;
  if (pos < SMART_Y_EDGE) { shTop = pos; shBot = pos + t; }
  else if (pos > iH - SMART_Y_EDGE) { shTop = pos - t; shBot = pos; }
  else { shTop = pos - t / 2; shBot = pos + t / 2; }
  return nicheBelow ? shBot : shTop;
}
