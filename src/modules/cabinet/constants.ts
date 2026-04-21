/**
 * Константы редактора корпусной мебели К2 Платформа.
 * Вынесены из WardrobeEditor.tsx в рамках рефакторинга.
 */

/** Scale factor — миллиметры в пиксели SVG. */
export const SC = 0.28;

/** Минимальный размер ячейки между стойками (мм). */
export const MIN_S = 100;

/** Шаг привязки (мм) при перетаскивании. */
export const SNAP = 5;

/** Зазоры для дверей (мм): OC — корпус (накладная), OS — стойка (накладная). */
export const DOOR_OVERLAY_CORPUS = 14;
export const DOOR_OVERLAY_STUD = 7;

export const TOOLS = [
  { type: "shelf",   label: "Полка",   icon: "━", key: "S" },
  { type: "stud",    label: "Стойка",  icon: "┃", key: "P" },
  { type: "drawers", label: "Ящики",   icon: "☰", key: "D" },
  { type: "rod",     label: "Штанга",  icon: "⎯", key: "R" },
  { type: "door",    label: "Дверь",   icon: "🚪", key: "F" },
] as const;

export const GUIDES = [
  { id: "roller", label: "Роликовые", p: 120 },
  { id: "ball",   label: "Шариковые", p: 280 },
  { id: "tandem", label: "Тандембокс", p: 950 },
] as const;

export const HINGES = [
  { id: "overlay", label: "Накладная" },
  { id: "insert",  label: "Вкладная" },
] as const;

export const MOBILE_EL_LABELS: Record<string, string> = {
  shelf: "Полка",
  stud: "Стойка",
  drawers: "Ящики",
  rod: "Штанга",
  door: "Дверь",
};

/** Генератор уникальных id. */
let _id = 0;
export const uid = () => "e" + ++_id;
