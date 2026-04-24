import { describe, it, expect } from 'vitest';
import { moveElement, type DragPayload } from './elementDrag';

const iW = 1200, iH = 2100, t = 16;

const makeDrag = (overrides: Partial<DragPayload> = {}): DragPayload => ({
  id: 'el1',
  type: 'stud',
  ox: 0, oy: 0,
  startX: 0, startY: 0,
  moved: true,
  ...overrides,
});

describe('moveElement', () => {
  it('другой элемент (не drag.id) возвращается без изменений', () => {
    const el = { id: 'other', type: 'stud', x: 100 };
    const drag = makeDrag();
    const result = moveElement(el, drag, 500, 500, iW, iH, t);
    expect(result).toBe(el); // та же ссылка, не копия
  });

  describe('stud', () => {
    it('двигается по X со snap 5мм', () => {
      const el = { id: 'el1', type: 'stud', x: 100 };
      const drag = makeDrag({ type: 'stud', ox: 0 });
      const result = moveElement(el, drag, 503, 500, iW, iH, t);
      // 503 / 5 = 100.6 → round → 101 → * 5 = 505
      expect(result.x).toBe(505);
    });

    it('clamp 0..iW-t', () => {
      const el = { id: 'el1', type: 'stud', x: 100 };
      const drag = makeDrag({ type: 'stud' });
      // Попытка вылезти за левый край
      const left = moveElement(el, drag, -50, 500, iW, iH, t);
      expect(left.x).toBe(0);
      // Попытка вылезти за правый край
      const right = moveElement(el, drag, 2000, 500, iW, iH, t);
      expect(right.x).toBe(iW - t);
    });

    it('snap к краю при x < 10', () => {
      const el = { id: 'el1', type: 'stud', x: 100 };
      const drag = makeDrag({ type: 'stud' });
      const result = moveElement(el, drag, 7, 500, iW, iH, t);
      expect(result.x).toBe(0);
    });

    it('snap к правому краю при x > iW-t-10', () => {
      const el = { id: 'el1', type: 'stud', x: 100 };
      const drag = makeDrag({ type: 'stud' });
      // iW-t-10 = 1174, клик на 1180 → snap к iW-t=1184
      const result = moveElement(el, drag, 1180, 500, iW, iH, t);
      expect(result.x).toBe(iW - t);
    });

    it('anchorY обновляется по Y клика', () => {
      const el = { id: 'el1', type: 'stud', x: 100, anchorY: 500 };
      const drag = makeDrag({ type: 'stud' });
      const result = moveElement(el, drag, 500, 1500, iW, iH, t);
      expect(result.anchorY).toBe(1500);
    });
  });

  describe('shelf', () => {
    it('двигается по Y с учётом offset oy', () => {
      const el = { id: 'el1', type: 'shelf', y: 500 };
      const drag = makeDrag({ type: 'shelf', oy: 10 });
      const result = moveElement(el, drag, 500, 1000, iW, iH, t);
      expect(result.y).toBe(990); // 1000 - oy 10
    });

    it('clamp Y учитывает толщину t (полка целиком в корпусе)', () => {
      const el = { id: 'el1', type: 'shelf', y: 500 };
      const drag = makeDrag({ type: 'shelf', oy: 0 });
      const above = moveElement(el, drag, 0, -100, iW, iH, t);
      // y = центр полки, не должен быть меньше t/2 (иначе верхняя грань вылезает за корпус)
      expect(above.y).toBe(t / 2);
      const below = moveElement(el, drag, 0, 3000, iW, iH, t);
      // не больше iH - t/2 (иначе нижняя грань вылезает)
      expect(below.y).toBe(iH - t / 2);
    });

    it('X не меняется (полка двигается только по Y)', () => {
      const el = { id: 'el1', type: 'shelf', x: 100, y: 500 };
      const drag = makeDrag({ type: 'shelf' });
      const result = moveElement(el, drag, 999, 1000, iW, iH, t);
      expect(result.x).toBe(100);
    });
  });

  describe('door', () => {
    it('двигается по X и Y одновременно', () => {
      const el = { id: 'el1', type: 'door', x: 100, y: 200, w: 400, h: 600 };
      const drag = makeDrag({ type: 'door', ox: 10, oy: 20 });
      const result = moveElement(el, drag, 500, 1000, iW, iH, t);
      expect(result.x).toBe(490);
      expect(result.y).toBe(980);
    });

    it('clamp с учётом ширины/высоты двери', () => {
      const el = { id: 'el1', type: 'door', x: 100, y: 200, w: 400, h: 600 };
      const drag = makeDrag({ type: 'door' });
      // Дверь w=400 → max x = iW-400 = 800
      const right = moveElement(el, drag, 2000, 0, iW, iH, t);
      expect(right.x).toBe(iW - 400);
      // Дверь h=600 → max y = iH-600 = 1500
      const bottom = moveElement(el, drag, 0, 3000, iW, iH, t);
      expect(bottom.y).toBe(iH - 600);
    });
  });

  describe('drawers', () => {
    it('по Y с clamp учитывая высоту ящика', () => {
      const el = { id: 'el1', type: 'drawers', y: 500, h: 450 };
      const drag = makeDrag({ type: 'drawers' });
      const below = moveElement(el, drag, 0, 3000, iW, iH, t);
      expect(below.y).toBe(iH - 450);
    });

    it('записывает _dragX (обрабатывается в adjust позже)', () => {
      const el = { id: 'el1', type: 'drawers', y: 500, h: 450 };
      const drag = makeDrag({ type: 'drawers' });
      const result = moveElement(el, drag, 777, 500, iW, iH, t);
      expect(result._dragX).toBe(777);
    });
  });

  describe('rod', () => {
    it('по Y с clamp [t, iH-t] (центр штанги, кронштейны в корпусе)', () => {
      const el = { id: 'el1', type: 'rod', y: 500 };
      const drag = makeDrag({ type: 'rod' });
      const below = moveElement(el, drag, 0, 3000, iW, iH, t);
      expect(below.y).toBe(iH - t);
      const above = moveElement(el, drag, 0, -100, iW, iH, t);
      expect(above.y).toBe(t);
    });
  });
});
