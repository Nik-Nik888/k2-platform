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
 */
import { uid, DOOR_OVERLAY_CORPUS, DOOR_OVERLAY_STUD } from "../constants";
import type { DoorBoundsResult } from "./doorBounds";

export type PlaceMode = "shelf" | "stud" | "drawers" | "rod" | "door" | "panel";

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
    return placeDoor({ id, order, clickX, clickY, iW, iH, t, elements, findDoorBounds });
  }
  if (placeMode === "panel") {
    return placePanel({ id, order, clickX, clickY, iW, iH, t, elements, findDoorBounds });
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
}): PlacementResult {
  const { id, order, clickX, clickY, iW, iH, t, elements, findDoorBounds } = p;
  const bounds = findDoorBounds(clickX, clickY);

  const OC = DOOR_OVERLAY_CORPUS;  // накладка на стенку корпуса
  const OS = DOOR_OVERLAY_STUD;    // накладка на стойку
  const to = bounds.top.isWall ? OC : OS;
  const bo = bounds.bottom.isWall ? OC : OS;

  const hingeType = "overlay";

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

  if (sameBoundsDoors.length > 0) {
    const hasDoorLeft = sameBoundsDoors.some(d => ((d.doorLeft || 0) + (d.doorRight || iW)) / 2 < openingMid);
    const hasDoorRight = sameBoundsDoors.some(d => ((d.doorLeft || 0) + (d.doorRight || iW)) / 2 >= openingMid);
    if (hasDoorLeft && hasDoorRight) {
      // обе половины заняты → fallback, накладываем (граничный случай)
    } else if (hasDoorLeft && !hasDoorRight) {
      effLeft = openingMid;
      effLeftIsWall = false;
    } else if (!hasDoorLeft && hasDoorRight) {
      effRight = openingMid;
      effRightIsWall = false;
    } else if (wantLeftHalf) {
      effRight = openingMid;
      effRightIsWall = false;
    } else {
      effLeft = openingMid;
      effLeftIsWall = false;
    }
  }

  const effLeftOffset = effLeftIsWall ? OC : OS;
  const effRightOffset = effRightIsWall ? OC : OS;
  const effInnerLeft = effLeft + (effLeftIsWall ? 0 : t);
  const effInnerW = effRight - effInnerLeft;

  let dX: number, dW: number, dY: number, dH: number;
  if (hingeType === "overlay") {
    dX = effInnerLeft - effLeftOffset;
    dW = effInnerW + effLeftOffset + effRightOffset;
    dY = bounds.top.y - to;
    dH = (bounds.bottom.y - bounds.top.y) + to + bo;
  } else {
    const gap = 2;
    dX = effInnerLeft + gap;
    dW = effInnerW - gap * 2;
    dY = bounds.top.y + gap;
    dH = (bounds.bottom.y - bounds.top.y) - gap * 2;
  }
  // Clamp: не даём двери вылезать за рамку
  if (dX < 0) { dW += dX; dX = 0; }
  if (dX + dW > iW) dW = iW - dX;
  if (dY < 0) { dH += dY; dY = 0; }
  if (dY + dH > iH) dH = iH - dY;

  // Автовыбор стороны петель — петли у стенки, ручка в центр проёма:
  // - если делим проём пополам (sameBoundsDoors): смотрим в какую половину встала дверь
  // - иначе — по центру двери относительно проёма
  let autoHingeSide: "left" | "right";
  if (sameBoundsDoors.length > 0) {
    // Заняли левую половину (effRight урезан до openingMid) → петли слева
    // Заняли правую половину (effLeft = openingMid) → петли справа
    autoHingeSide = effRight <= openingMid + 1 ? "left" : "right";
  } else {
    // Одиночная дверь: по центру двери относительно проёма
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
}): PlacementResult {
  const { id, order, clickX, clickY, iW, iH, t, findDoorBounds } = p;
  const bounds = findDoorBounds(clickX, clickY);

  const OC = DOOR_OVERLAY_CORPUS;
  const OS = DOOR_OVERLAY_STUD;

  // По умолчанию панель вкладная (insert) — чаще всего это цоколь или
  // декоративная заглушка, которая не должна закрывать торцы корпуса.
  const panelType: "overlay" | "insert" = "insert";

  const effLeft = bounds.left.x;
  const effRight = bounds.right.x;
  const effLeftIsWall = bounds.left.isWall;
  const effRightIsWall = bounds.right.isWall;

  // Полка в 2D рисуется centered на своей Y: [y-t/2, y+t/2] если в середине,
  // [y, y+t] если у верха (y<5), [y-t, y] если у низа (y>iH-5).
  // Для insert панели нужна нижняя кромка верхней полки и верхняя кромка нижней полки.
  const shelfEdgeBelow = (y: number) => {
    // Нижняя кромка полки находящейся на оси y
    if (y < 5) return y + t;                    // у верха: [y, y+t], нижняя кромка = y+t
    if (y > iH - 5) return y;                    // у низа: [y-t, y], нижняя кромка = y
    return y + t / 2;                             // в середине: [y-t/2, y+t/2], нижняя кромка = y+t/2
  };
  const shelfEdgeAbove = (y: number) => {
    // Верхняя кромка полки находящейся на оси y
    if (y < 5) return y;                         // у верха: [y, y+t], верхняя кромка = y
    if (y > iH - 5) return y - t;                // у низа: [y-t, y], верхняя кромка = y-t
    return y - t / 2;                             // в середине: верхняя кромка = y-t/2
  };

  // Для insert: панель внутри проёма (не заходит на стойки, не закрывает торцы корпуса).
  // Границы могут быть стеной (isWall=true, без отступа) или соседом — стойкой/полкой (isWall=false, +t).
  const effInnerLeft = effLeft + (effLeftIsWall ? 0 : t);
  const effInnerRight = effRight;
  const effInnerW = effInnerRight - effInnerLeft;
  // Верхняя граница проёма = нижняя кромка полки/стены сверху
  const effInnerTop = bounds.top.isWall ? bounds.top.y : shelfEdgeBelow(bounds.top.y);
  // Нижняя граница проёма = верхняя кромка полки/стены снизу
  const effInnerBot = bounds.bottom.isWall ? bounds.bottom.y : shelfEdgeAbove(bounds.bottom.y);

  let dX: number, dW: number, dY: number, dH: number;

  if (panelType === "overlay") {
    // Накладная: выступает за габариты проёма, закрывает торцы (как дверь)
    const to = bounds.top.isWall ? OC : OS;
    const bo = bounds.bottom.isWall ? OC : OS;
    const effLeftOffset = effLeftIsWall ? OC : OS;
    const effRightOffset = effRightIsWall ? OC : OS;
    dX = effInnerLeft - effLeftOffset;
    dW = effInnerW + effLeftOffset + effRightOffset;
    dY = bounds.top.y - to;
    dH = (bounds.bottom.y - bounds.top.y) + to + bo;
  } else {
    // Вкладная: СТРОГО в проёме, заполняет весь проём с зазором 2мм от КАЖДОГО соседа
    // (не заходит на стойки/полки/стены)
    const gap = 2;
    dX = effInnerLeft + gap;
    dW = effInnerW - gap * 2;
    dY = effInnerTop + gap;
    dH = effInnerBot - effInnerTop - 2 * gap;
  }

  // Clamp: панель не должна вылезать за рамку
  if (dX < 0) { dW += dX; dX = 0; }
  if (dX + dW > iW) dW = iW - dX;
  if (dY < 0) { dH += dY; dY = 0; }
  if (dY + dH > iH) dH = iH - dY;

  return {
    element: {
      id, type: "panel",
      x: dX, y: dY, w: dW, h: dH,
      panelW: dW, panelH: dH,
      panelType,
      panelLeft: effLeft, panelRight: effRight,
      panelTop: bounds.top.y, panelBottom: bounds.bottom.y,
      panelLeftIsWall: effLeftIsWall, panelRightIsWall: effRightIsWall,
      panelTopIsWall: bounds.top.isWall, panelBottomIsWall: bounds.bottom.isWall,
      // depthOffset: по умолчанию утоплена к задней стенке (классический цоколь)
      // Пользователь может переключить на 0 или другое значение.
      depthOffset: 0,
      _order: order,
    },
    keepPlaceMode: false,
  };
}

/**
 * Пересчитать размеры панели (x, y, w, h) исходя из её границ (panelLeft/Right/Top/Bottom),
 * флагов isWall и нового panelType. Используется при переключении overlay ↔ insert,
 * чтобы панель автоматически подстроилась под новый тип, не "заходя" на стенки.
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
  const OC = DOOR_OVERLAY_CORPUS;
  const OS = DOOR_OVERLAY_STUD;

  // Smart-Y: полка в 2D centered на оси Y если в середине, поэтому её кромки
  // зависят от того, где она находится (у верха / у низа / в середине).
  const shelfEdgeBelow = (y: number) =>
    y < 5 ? y + t : y > iH - 5 ? y : y + t / 2;
  const shelfEdgeAbove = (y: number) =>
    y < 5 ? y : y > iH - 5 ? y - t : y - t / 2;

  const effInnerLeft = panelLeft + (panelLeftIsWall ? 0 : t);
  const effInnerW = panelRight - effInnerLeft;
  const effInnerTop = panelTopIsWall ? panelTop : shelfEdgeBelow(panelTop);
  const effInnerBot = panelBottomIsWall ? panelBottom : shelfEdgeAbove(panelBottom);

  let dX: number, dW: number, dY: number, dH: number;

  if (panelType === "overlay") {
    const to = panelTopIsWall ? OC : OS;
    const bo = panelBottomIsWall ? OC : OS;
    const effLeftOffset = panelLeftIsWall ? OC : OS;
    const effRightOffset = panelRightIsWall ? OC : OS;
    dX = effInnerLeft - effLeftOffset;
    dW = effInnerW + effLeftOffset + effRightOffset;
    dY = panelTop - to;
    dH = (panelBottom - panelTop) + to + bo;
  } else {
    // insert: внутри проёма с зазором 2мм, не заходя на стойки/полки/стены
    const gap = 2;
    dX = effInnerLeft + gap;
    dW = effInnerW - gap * 2;
    dY = effInnerTop + gap;
    dH = effInnerBot - effInnerTop - 2 * gap;
  }

  // Clamp к рамке
  if (dX < 0) { dW += dX; dX = 0; }
  if (dX + dW > iW) dW = iW - dX;
  if (dY < 0) { dH += dY; dY = 0; }
  if (dY + dH > iH) dH = iH - dY;

  return {
    x: dX, y: dY, w: dW, h: dH,
    panelW: dW, panelH: dH,
  };
}
