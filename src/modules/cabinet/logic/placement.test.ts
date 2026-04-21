import { describe, it, expect } from 'vitest';
import { placeInZone } from './placement';
import { findDoorBounds } from './doorBounds';

const iW = 1200, iH = 2100, t = 16;

/** Хелпер: реальный findDoorBounds с текущими elements. */
const makeFindDoorBounds = (elements: any[]) =>
  (x: number, y: number) => findDoorBounds(elements, x, y, iW, iH, t);

const makeCtx = (overrides: any = {}) => ({
  iW, iH, t,
  elements: [],
  order: 1,
  findDoorBounds: makeFindDoorBounds(overrides.elements || []),
  ...overrides,
});

describe('placeInZone', () => {
  describe('shelf', () => {
    it('полка занимает всю ширину в пустом шкафу', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'shelf',
        clickX: 600, clickY: 1000,
      });
      expect(result).not.toBeNull();
      expect(result!.element).toMatchObject({
        type: 'shelf',
        x: 0, w: iW, y: 1000,
      });
      expect(result!.keepPlaceMode).toBe(true);
    });

    it('полка с существующей стойкой → ограничивается до стойки', () => {
      const elements = [{ id: 's', type: 'stud', x: 600, anchorY: iH / 2 }];
      const result = placeInZone({
        ...makeCtx({ elements }),
        placeMode: 'shelf',
        clickX: 300, clickY: 1000,
      });
      // Левая колонка: от 0 (стена) до 600 (стойка), ширина 600
      expect(result!.element.x).toBe(0);
      expect(result!.element.w).toBe(600);
    });

    it('keepPlaceMode=true — режим не сбрасывается', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'shelf',
        clickX: 600, clickY: 1000,
      });
      expect(result!.keepPlaceMode).toBe(true);
    });
  });

  describe('stud', () => {
    it('стойка в центре шкафа', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'stud',
        clickX: 600, clickY: 1000,
      });
      // studX = round(600 - t/2) = 592
      expect(result!.element.type).toBe('stud');
      expect(result!.element.x).toBe(592);
    });

    it('snap к левому краю при clickX < 20', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'stud',
        clickX: 10, clickY: 1000,
      });
      expect(result!.element.x).toBe(0);
    });

    it('snap к правому краю при clickX > iW-t-20', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'stud',
        clickX: iW - 10, clickY: 1000,
      });
      expect(result!.element.x).toBe(iW - t);
    });

    it('pTop/pBot по границам двери (вся высота для пустого шкафа)', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'stud',
        clickX: 600, clickY: 1000,
      });
      expect(result!.element.pTop).toBe(0);
      expect(result!.element.pBot).toBe(iH);
    });

    it('keepPlaceMode=true', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'stud',
        clickX: 600, clickY: 1000,
      });
      expect(result!.keepPlaceMode).toBe(true);
    });
  });

  describe('drawers', () => {
    it('ящики в пустой зоне: 3 секции, h≤450', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'drawers',
        clickX: 600, clickY: 1000,
      });
      expect(result!.element.type).toBe('drawers');
      expect(result!.element.count).toBe(3);
      expect(result!.element.h).toBe(450);
      expect(result!.element.drawerHeights).toHaveLength(3);
      const sum = result!.element.drawerHeights.reduce((a: number, b: number) => a + b, 0);
      expect(sum).toBe(450);
    });

    it('зона менее 100мм по ширине → null', () => {
      // Создаём узкую зону: 2 стойки очень близко
      const elements = [
        { id: 'a', type: 'stud', x: 500, anchorY: iH / 2 },
        { id: 'b', type: 'stud', x: 560, anchorY: iH / 2 },
      ];
      const result = placeInZone({
        ...makeCtx({ elements }),
        placeMode: 'drawers',
        clickX: 530, clickY: 1000,
      });
      expect(result).toBeNull();
    });

    it('keepPlaceMode=false (одноразовое размещение)', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'drawers',
        clickX: 600, clickY: 1000,
      });
      expect(result!.keepPlaceMode).toBe(false);
    });

    it('ящики стоят на дне (botY-h)', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'drawers',
        clickX: 600, clickY: 1000,
      });
      // В пустом шкафу botY=iH, h=450 → y = iH - 450
      expect(result!.element.y).toBe(iH - 450);
    });
  });

  describe('rod', () => {
    it('штанга с отступом 20мм от краёв', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'rod',
        clickX: 600, clickY: 1500,
      });
      expect(result!.element.type).toBe('rod');
      expect(result!.element.x).toBe(20);
      expect(result!.element.w).toBe(iW - 40);
      expect(result!.element.y).toBe(1500);
    });

    it('keepPlaceMode=false', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'rod',
        clickX: 600, clickY: 1500,
      });
      expect(result!.keepPlaceMode).toBe(false);
    });
  });

  describe('door', () => {
    it('одиночная дверь в пустом шкафу: overlay выступает на 14мм за стены', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'door',
        clickX: 600, clickY: 1000,
      });
      expect(result!.element.type).toBe('door');
      // overlay: dX = 0 - 14 = -14, но clamp к 0
      expect(result!.element.x).toBe(0);
      // dY = 0 - 14 = -14, clamp к 0
      expect(result!.element.y).toBe(0);
    });

    it('дверь overlay: dW = iW + 2×14 = iW+28, но clamp к iW', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'door',
        clickX: 600, clickY: 1000,
      });
      // После clamp: dX=0, dW=iW (уменьшается из-за dX<0)
      expect(result!.element.w).toBe(iW);
      expect(result!.element.h).toBe(iH);
    });

    it('вторая дверь в том же проёме: делит пополам', () => {
      // Первая дверь занимает всю ширину
      const firstDoor = {
        id: 'd1', type: 'door',
        x: 0, y: 0, w: iW, h: iH,
        doorLeft: 0, doorRight: iW,
        doorTop: 0, doorBottom: iH,
        doorLeftIsWall: true, doorRightIsWall: true,
        doorTopIsWall: true, doorBottomIsWall: true,
      };
      // Клик в левой половине — новая дверь займёт левую половину
      const result = placeInZone({
        ...makeCtx({ elements: [firstDoor] }),
        placeMode: 'door',
        clickX: 300, clickY: 1000,
      });
      expect(result!.element.type).toBe('door');
      // Левая половина: effRight=openingMid=600, effRightIsWall=false
      // doorRight должен быть 600
      expect(result!.element.doorRight).toBe(600);
    });

    it('клик в левой половине занятого проёма → новая дверь занимает левую половину', () => {
      const firstDoor = {
        id: 'd1', type: 'door',
        x: 0, y: 0, w: iW, h: iH,
        doorLeft: 0, doorRight: iW,
        doorTop: 0, doorBottom: iH,
        doorLeftIsWall: true, doorRightIsWall: true,
      };
      const result = placeInZone({
        ...makeCtx({ elements: [firstDoor] }),
        placeMode: 'door',
        clickX: 300, clickY: 1000,
      });
      // Клик на 300 (левая половина), openingMid=600, centerFirstDoor=600>=600 →
      // hasDoorRight=true, hasDoorLeft=false → ставим в левую половину
      expect(result!.element.doorRight).toBe(600);
      expect(result!.element.doorRightIsWall).toBe(false);
      expect(result!.element.doorLeft).toBe(0);
      expect(result!.element.doorLeftIsWall).toBe(true);
    });

    it('клик в правой половине когда центр первой двери на openingMid → новая дверь всё равно в свободной левой', () => {
      // Edge case: первая дверь на ВЕСЬ проём, её центр = openingMid.
      // Условие hasDoorRight = (center >= openingMid) = true → код считает что
      // правая половина занята и ставит новую в ЛЕВУЮ, игнорируя clickX.
      const firstDoor = {
        id: 'd1', type: 'door',
        x: 0, y: 0, w: iW, h: iH,
        doorLeft: 0, doorRight: iW,
        doorTop: 0, doorBottom: iH,
        doorLeftIsWall: true, doorRightIsWall: true,
      };
      const result = placeInZone({
        ...makeCtx({ elements: [firstDoor] }),
        placeMode: 'door',
        clickX: 900, clickY: 1000,
      });
      // Новая дверь занимает левую половину (доступная свободная)
      expect(result!.element.doorLeft).toBe(0);
      expect(result!.element.doorRight).toBe(600);
      expect(result!.element.doorRightIsWall).toBe(false);
    });

    it('дверь сохраняет doorLeft/doorRight/doorTop/doorBottom границы', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'door',
        clickX: 600, clickY: 1000,
      });
      expect(result!.element.doorLeft).toBe(0);
      expect(result!.element.doorRight).toBe(iW);
      expect(result!.element.doorTop).toBe(0);
      expect(result!.element.doorBottom).toBe(iH);
    });

    it('keepPlaceMode=false', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'door',
        clickX: 600, clickY: 1000,
      });
      expect(result!.keepPlaceMode).toBe(false);
    });
  });

  describe('генерация id и order', () => {
    it('каждый элемент получает уникальный id', () => {
      const ctx1 = { ...makeCtx(), placeMode: 'shelf' as const, clickX: 600, clickY: 500 };
      const ctx2 = { ...makeCtx(), placeMode: 'shelf' as const, clickX: 600, clickY: 1500 };
      const r1 = placeInZone(ctx1);
      const r2 = placeInZone(ctx2);
      expect(r1!.element.id).not.toBe(r2!.element.id);
    });

    it('_order передаётся из ctx.order', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'shelf',
        clickX: 600, clickY: 1000,
        order: 42,
      });
      expect(result!.element._order).toBe(42);
    });
  });
});
