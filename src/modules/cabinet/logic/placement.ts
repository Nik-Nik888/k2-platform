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

  // ═══ Внутренние кромки ниши (унифицированная логика) ═══
  // Стена (isWall=true): координата = уже внутренняя кромка
  // Стойка/полка в середине: рисуется centered [c-t/2, c+t/2], внутренняя кромка = c±t/2
  const innerEdgeRightOf = (x: number, isWall: boolean) => isWall ? x : x + t / 2;
  const innerEdgeLeftOf = (x: number, isWall: boolean) => isWall ? x : x - t / 2;
  const innerEdgeBelow = (y: number, isWall: boolean) => isWall ? y : y + t / 2;
  const innerEdgeAbove = (y: number, isWall: boolean) => isWall ? y : y - t / 2;

  const niL = innerEdgeRightOf(effLeft, effLeftIsWall);
  const niR = innerEdgeLeftOf(effRight, effRightIsWall);
  const niT = innerEdgeBelow(bounds.top.y, bounds.top.isWall);
  const niB = innerEdgeAbove(bounds.bottom.y, bounds.bottom.isWall);

  let dX: number, dW: number, dY: number, dH: number;
  if (hingeType === "overlay") {
    // Накладная: выступает за кромки ниши на 14/7мм
    const leftOvh = effLeftIsWall ? OC : OS;
    const rightOvh = effRightIsWall ? OC : OS;
    const topOvh = bounds.top.isWall ? OC : OS;
    const botOvh = bounds.bottom.isWall ? OC : OS;
    dX = niL - leftOvh;
    dW = (niR - niL) + leftOvh + rightOvh;
    dY = niT - topOvh;
    dH = (niB - niT) + topOvh + botOvh;
  } else {
    // Вкладная: ВНУТРИ ниши с зазором 2мм по периметру
    const gap = 2;
    dX = niL + gap;
    dW = (niR - niL) - gap * 2;
    dY = niT + gap;
    dH = (niB - niT) - gap * 2;
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

  // ═══ Единая логика "внутренняя кромка ниши" для любой стороны ═══
  // Сосед может быть стеной (isWall=true, край корпуса или краевая стойка/полка) ИЛИ
  // стойкой/полкой в середине шкафа (isWall=false, рисуется centered на своей оси).
  // Внутренняя кромка = "куда начинается пустое пространство ниши".
  //
  // Стена: её координата = уже внутренняя кромка (стена физически снаружи)
  // Стойка/полка в середине: рисуется [c-t/2, c+t/2], значит
  //   - внутренняя кромка справа от неё = c + t/2
  //   - внутренняя кромка слева от неё  = c - t/2
  // Стойка/полка у края (isWall=true из findDoorBounds): координата = внутренняя кромка
  const innerEdgeRightOf = (x: number, isWall: boolean) => isWall ? x : x + t / 2;
  const innerEdgeLeftOf = (x: number, isWall: boolean) => isWall ? x : x - t / 2;
  const innerEdgeBelow = (y: number, isWall: boolean) => isWall ? y : y + t / 2;
  const innerEdgeAbove = (y: number, isWall: boolean) => isWall ? y : y - t / 2;

  // Внутренние кромки ниши (куда будет вставлена панель)
  const niL = innerEdgeRightOf(effLeft, effLeftIsWall);    // ниша начинается справа от левого соседа
  const niR = innerEdgeLeftOf(effRight, effRightIsWall);   // ниша заканчивается слева от правого соседа
  const niT = innerEdgeBelow(bounds.top.y, bounds.top.isWall);
  const niB = innerEdgeAbove(bounds.bottom.y, bounds.bottom.isWall);

  let dX: number, dW: number, dY: number, dH: number;

  if (panelType === "overlay") {
    // Накладная: выступает за границы ниши — закрывает торцы соседей/стен
    const leftOvh = effLeftIsWall ? OC : OS;
    const rightOvh = effRightIsWall ? OC : OS;
    const topOvh = bounds.top.isWall ? OC : OS;
    const botOvh = bounds.bottom.isWall ? OC : OS;
    dX = niL - leftOvh;
    dW = (niR - niL) + leftOvh + rightOvh;
    dY = niT - topOvh;
    dH = (niB - niT) + topOvh + botOvh;
  } else {
    // Вкладная: ВНУТРИ ниши с зазором 2мм по периметру
    const gap = 2;
    dX = niL + gap;
    dW = (niR - niL) - gap * 2;
    dY = niT + gap;
    dH = (niB - niT) - gap * 2;
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

  // ═══ Внутренние кромки ниши (единая логика для X и Y) ═══
  const innerEdgeRightOf = (x: number, isWall: boolean) => isWall ? x : x + t / 2;
  const innerEdgeLeftOf = (x: number, isWall: boolean) => isWall ? x : x - t / 2;
  const innerEdgeBelow = (y: number, isWall: boolean) => isWall ? y : y + t / 2;
  const innerEdgeAbove = (y: number, isWall: boolean) => isWall ? y : y - t / 2;

  const niL = innerEdgeRightOf(panelLeft, panelLeftIsWall);
  const niR = innerEdgeLeftOf(panelRight, panelRightIsWall);
  const niT = innerEdgeBelow(panelTop, panelTopIsWall);
  const niB = innerEdgeAbove(panelBottom, panelBottomIsWall);

  let dX: number, dW: number, dY: number, dH: number;

  if (panelType === "overlay") {
    const leftOvh = panelLeftIsWall ? OC : OS;
    const rightOvh = panelRightIsWall ? OC : OS;
    const topOvh = panelTopIsWall ? OC : OS;
    const botOvh = panelBottomIsWall ? OC : OS;
    dX = niL - leftOvh;
    dW = (niR - niL) + leftOvh + rightOvh;
    dY = niT - topOvh;
    dH = (niB - niT) + topOvh + botOvh;
  } else {
    // Вкладная: ВНУТРИ ниши с зазором 2мм по периметру
    const gap = 2;
    dX = niL + gap;
    dW = (niR - niL) - gap * 2;
    dY = niT + gap;
    dH = (niB - niT) - gap * 2;
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
