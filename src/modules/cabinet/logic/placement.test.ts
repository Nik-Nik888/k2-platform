import { describe, it, expect } from 'vitest';
import { placeInZone, computeDoorDimensions } from './placement';
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

  // ───────────────────────────────────────────────────────────────
  // Regression tests для бага insert-режима: вкладная панель должна
  // становиться в нишу с зазором ровно 2мм по всему периметру.
  // Ранее innerEdge считался как x±t/2 — панель залезала на стойку
  // на t/2=8мм или оставляла кривой зазор. Теперь innerEdge учитывает
  // физический рендер: стойка [x, x+t], полка Smart-Y [y, y+t]/[y-t, y]/[y-t/2, y+t/2].
  // ───────────────────────────────────────────────────────────────
  describe('insert mode geometry (regression)', () => {
    it('вкладная панель в пустом шкафу: зазор 3мм от всех 4 стен', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'panel',
        clickX: 600, clickY: 1000,
      });
      expect(result!.element.panelType).toBe('insert');
      // От стены: niL=0, dX = 0+3 = 3; dW = (iW-0) - 6 = iW-6
      expect(result!.element.x).toBe(3);
      expect(result!.element.w).toBe(iW - 6);
      expect(result!.element.y).toBe(3);
      expect(result!.element.h).toBe(iH - 6);
    });

    it('вкладная панель со стойкой в середине: зазор 3мм от правой кромки стойки', () => {
      // Стойка в середине шкафа, рисуется [600, 616]. Клик справа.
      const elements = [{ id: 's', type: 'stud', x: 600, anchorY: iH / 2 }];
      const result = placeInZone({
        ...makeCtx({ elements }),
        placeMode: 'panel',
        clickX: 900, clickY: 1000,
      });
      // Левая граница ниши = правая кромка стойки = 600 + 16 = 616
      // dX = 616 + 2 = 618; правая стена iW=1200 → niR=1200; dW = (1200-616) - 4 = 580
      expect(result!.element.x).toBe(619);
      expect(result!.element.w).toBe(iW - 616 - 6);
    });

    it('вкладная панель со стойкой в середине: зазор 3мм от левой кромки стойки (клик слева)', () => {
      const elements = [{ id: 's', type: 'stud', x: 600, anchorY: iH / 2 }];
      const result = placeInZone({
        ...makeCtx({ elements }),
        placeMode: 'panel',
        clickX: 300, clickY: 1000,
      });
      // Стойка справа от клика. Правая граница ниши = левая кромка стойки = 600.
      // dX = 0+2 = 2; dW = (600-0) - 4 = 596
      expect(result!.element.x).toBe(3);
      expect(result!.element.w).toBe(600 - 6);
    });

    it('вкладная панель с полкой СВЕРХУ (Smart-Y в середине): зазор 3мм от нижней кромки полки', () => {
      // Полка на y=500 в середине → рисуется [500-8, 500+8] = [492, 508].
      // Нижняя кромка = 508. Клик ниже полки.
      const elements = [{ id: 'sh', type: 'shelf', x: 0, y: 500, w: iW }];
      const result = placeInZone({
        ...makeCtx({ elements }),
        placeMode: 'panel',
        clickX: 600, clickY: 1000,
      });
      // niT = 508; dY = 508 + 2 = 510; niB = iH; dH = (iH-508) - 4
      expect(result!.element.y).toBe(511);
      expect(result!.element.h).toBe(iH - 508 - 6);
    });

    it('вкладная панель с краевой полкой сверху (Smart-Y y<5): зазор 3мм от её физической нижней кромки', () => {
      // Полка на y=0 (краевая, рендерится [0, t=16]) — для дверной логики isWall=true,
      // но физически занимает 0..16. Раньше innerEdge=0, панель висела с зазором 2мм от края,
      // т.е. НА полке. Теперь innerEdge=16 → зазор 3мм от ФИЗИЧЕСКОЙ кромки полки.
      const elements = [{ id: 'sh', type: 'shelf', x: 0, y: 0, w: iW }];
      const result = placeInZone({
        ...makeCtx({ elements }),
        placeMode: 'panel',
        clickX: 600, clickY: 1000,
      });
      // niT = 16 (низ полки); dY = 16 + 2 = 18
      expect(result!.element.y).toBe(19);
    });

    it('вкладная панель с краевой стойкой слева (x=5): зазор 3мм от её правой кромки', () => {
      // Краевая стойка на x=5, рисуется [5, 21]. Клик справа от неё.
      const elements = [{ id: 's', type: 'stud', x: 5, anchorY: iH / 2 }];
      const result = placeInZone({
        ...makeCtx({ elements }),
        placeMode: 'panel',
        clickX: 600, clickY: 1000,
      });
      // niL = 5 + 16 = 21; dX = 21 + 2 = 23
      expect(result!.element.x).toBe(24);
    });

    it('вкладная дверь в insert режиме: тест через computeDoorDimensions', () => {
      // Симулируем ручное переключение с overlay на insert для уже существующей двери
      // с doorLeft=600 (стойка), doorRight=iW (стена), doorTop=0, doorBottom=iH
      const dims = computeDoorDimensions(
        600, iW, 0, iH,
        false, true, true, true,
        'insert', iW, iH, t,
      );
      // niL = 600+16=616 (стойка слева), niR=iW, niT=0, niB=iH
      // dX = 616+2 = 618, dW = (iW-616)-4 = 580
      expect(dims.x).toBe(619);
      expect(dims.w).toBe(iW - 616 - 6);
      expect(dims.y).toBe(3);
      expect(dims.h).toBe(iH - 6);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // Pre-placement preferences: дверь/панель должны сразу ставиться
  // с выбранным типом и стороной петель (задача №3).
  // ───────────────────────────────────────────────────────────────
  describe('pre-placement preferences (preset)', () => {
    it('door с doorHingeType="insert" — первая дверь сразу вкладная с зазором 2мм', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'door',
        clickX: 600, clickY: 1000,
        doorHingeType: 'insert',
        doorHingeSide: 'auto',
      });
      expect(result!.element.hingeType).toBe('insert');
      // Пустой шкаф: niL=0, niR=iW, dX=2, dW=iW-4
      expect(result!.element.x).toBe(3);
      expect(result!.element.w).toBe(iW - 6);
    });

    it('door с doorHingeSide="left" — петли слева независимо от позиции', () => {
      // Центральная дверь в пустом шкафу — автологика дала бы "right" (клик был бы слева),
      // но явный preset "left" должен выиграть.
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'door',
        clickX: 900, clickY: 1000, // клик в правой половине
        doorHingeType: 'overlay',
        doorHingeSide: 'left',
      });
      expect(result!.element.hingeSide).toBe('left');
    });

    it('door с doorHingeSide="right" — петли справа даже при клике в левой половине', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'door',
        clickX: 300, clickY: 1000,
        doorHingeType: 'overlay',
        doorHingeSide: 'right',
      });
      expect(result!.element.hingeSide).toBe('right');
    });

    it('door с doorHingeSide="auto" — автовыбор как раньше (по центру двери vs проёма)', () => {
      // Одиночная дверь на весь проём — центр двери ровно в центре проёма,
      // doorCenterX < openingCenterX → left
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'door',
        clickX: 600, clickY: 1000,
        doorHingeType: 'overlay',
        doorHingeSide: 'auto',
      });
      // В пустом шкафу overlay-дверь центрирована → hingeSide 'left' или 'right' по доле
      // Главное что это одно из двух, а не 'auto' в результате.
      expect(['left', 'right']).toContain(result!.element.hingeSide);
    });

    it('panel с panelType="overlay" — первая панель сразу накладная (не insert по умолчанию)', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'panel',
        clickX: 600, clickY: 1000,
        panelType: 'overlay',
      });
      expect(result!.element.panelType).toBe('overlay');
    });

    it('panel без preset → остаётся insert (backward compat)', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'panel',
        clickX: 600, clickY: 1000,
      });
      expect(result!.element.panelType).toBe('insert');
    });

    it('door без preset → остаётся overlay (backward compat)', () => {
      const result = placeInZone({
        ...makeCtx(),
        placeMode: 'door',
        clickX: 600, clickY: 1000,
      });
      expect(result!.element.hingeType).toBe('overlay');
    });
  });
});
