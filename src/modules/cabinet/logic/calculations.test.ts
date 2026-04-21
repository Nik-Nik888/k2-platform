import { describe, it, expect } from 'vitest';
import { calcHW, calcParts } from './calculations';

const c = { width: 1200, height: 2100, depth: 600, thickness: 16 };

describe('calcHW', () => {
  it('пустой шкаф → []', () => {
    expect(calcHW(c, [], true)).toEqual([]);
  });

  it('showCorpus=true без элементов → []', () => {
    // showCorpus игнорируется при пустых элементах (ранний выход)
    expect(calcHW(c, [], true)).toEqual([]);
  });

  it('showCorpus=true + элемент → корпус (конфирмат, шкант, гвоздь, опора) добавлен', () => {
    const els = [{ id: 'x', type: 'shelf', x: 0, y: 1000, w: 1200 }];
    const hw = calcHW(c, els, true);
    expect(hw.some(h => h.n.includes('Конфирмат 5×50'))).toBe(true);
    expect(hw.some(h => h.n.includes('Шкант'))).toBe(true);
    expect(hw.some(h => h.n === 'Гвоздь')).toBe(true);
    expect(hw.some(h => h.n === 'Опора')).toBe(true);
  });

  it('showCorpus=false → без крепежа корпуса', () => {
    const els = [{ id: 'x', type: 'shelf', x: 0, y: 1000, w: 1200 }];
    const hw = calcHW(c, els, false);
    expect(hw.some(h => h.r === 'Корпус')).toBe(false);
    expect(hw.some(h => h.r === 'Усиление')).toBe(false);
  });

  it('опоры: 4 шт при width≤800, 6 шт при >800', () => {
    const els = [{ id: 'x', type: 'shelf', x: 0, y: 1000, w: 800 }];
    const narrow = calcHW({ ...c, width: 800 }, els, true);
    expect(narrow.find(h => h.n === 'Опора')?.q).toBe(4);
    const wide = calcHW({ ...c, width: 1200 }, els, true);
    expect(wide.find(h => h.n === 'Опора')?.q).toBe(6);
  });

  it('стойки: 4 конфирмата на каждую', () => {
    const els = [
      { id: 'a', type: 'stud', x: 400 },
      { id: 'b', type: 'stud', x: 800 },
    ];
    const hw = calcHW(c, els, false);
    const konf = hw.find(h => h.n === 'Конфирмат' && h.r.includes('Стойки'));
    expect(konf?.q).toBe(8);
  });

  it('полки: 4 полкодержателя на каждую', () => {
    const els = [
      { id: 'a', type: 'shelf', x: 0, y: 500, w: 1200 },
      { id: 'b', type: 'shelf', x: 0, y: 1500, w: 1200 },
    ];
    const hw = calcHW(c, els, false);
    const holders = hw.find(h => h.n === 'Полкодерж.');
    expect(holders?.q).toBe(8);
  });

  it('ящики: направляющие × 2 + конфирматы × 8 на количество ящиков', () => {
    const els = [
      { id: 'd', type: 'drawers', x: 100, y: 500, w: 400, h: 450, count: 3, guideType: 'roller' },
    ];
    const hw = calcHW(c, els, false);
    const guides = hw.find(h => h.i === '↔️');
    expect(guides?.q).toBe(6); // 3 ящика × 2 направляющие
    const konf = hw.find(h => h.n === 'Конф.(ящики)');
    expect(konf?.q).toBe(24); // 3 × 8
  });

  it('двери: петли зависят от высоты (2/3/4)', () => {
    const mk = (h: number) => ({ id: 'd', type: 'door', x: 100, y: 100, w: 400, h });
    const low = calcHW(c, [mk(600)], false);
    expect(low.find(h => h.n.includes('Петля'))?.q).toBe(2);
    const mid = calcHW(c, [mk(1500)], false);
    expect(mid.find(h => h.n.includes('Петля'))?.q).toBe(3);
    const tall = calcHW(c, [mk(2000)], false);
    expect(tall.find(h => h.n.includes('Петля'))?.q).toBe(4);
  });

  it('вкладная петля vs накладная — по hingeType', () => {
    const overlay = { id: 'd', type: 'door', h: 600, hingeType: 'overlay' };
    const insert = { id: 'd', type: 'door', h: 600, hingeType: 'insert' };
    const hwO = calcHW(c, [overlay], false);
    const hwI = calcHW(c, [insert], false);
    expect(hwO.find(h => h.n.includes('накл.'))).toBeDefined();
    expect(hwI.find(h => h.n.includes('вкладн.'))).toBeDefined();
  });
});

describe('calcParts', () => {
  it('пустой шкаф → []', () => {
    expect(calcParts(c, [], true)).toEqual([]);
  });

  it('showCorpus=true → 4 детали корпуса: 2 боковины, крыша, дно, задняя стенка', () => {
    const els = [{ id: 'x', type: 'shelf', x: 0, y: 1000, w: 1200 }];
    const parts = calcParts(c, els, true);
    expect(parts.find(p => p.n === 'Боковина')?.q).toBe(2);
    expect(parts.find(p => p.n === 'Крыша')?.q).toBe(1);
    expect(parts.find(p => p.n === 'Дно')?.q).toBe(1);
    expect(parts.find(p => p.n === 'Задн.ст')).toBeDefined();
  });

  it('боковина: L=H, W=D', () => {
    const els = [{ id: 'x', type: 'shelf' }];
    const parts = calcParts(c, els, true);
    const side = parts.find(p => p.n === 'Боковина');
    expect(side?.l).toBe(c.height);
    expect(side?.w).toBe(c.depth);
  });

  it('крыша и дно: L=W-2t', () => {
    const els = [{ id: 'x', type: 'shelf' }];
    const parts = calcParts(c, els, true);
    const top = parts.find(p => p.n === 'Крыша');
    expect(top?.l).toBe(c.width - 2 * c.thickness);
  });

  it('задняя стенка m=1 (мягкая, ДВП)', () => {
    const els = [{ id: 'x', type: 'shelf' }];
    const parts = calcParts(c, els, true);
    const back = parts.find(p => p.n === 'Задн.ст');
    expect(back?.m).toBe(1);
  });

  it('стойка: L = pBot - pTop', () => {
    const stud = { id: 's', type: 'stud', x: 600, pTop: 200, pBot: 1800 };
    const parts = calcParts(c, [stud], false);
    const p = parts.find(p => p.n.startsWith('Стойка'));
    expect(p?.l).toBe(1600);
    expect(p?.w).toBe(c.depth - 4);
  });

  it('полка: L = shelf.w, W = D-4', () => {
    const shelf = { id: 'sh', type: 'shelf', x: 0, y: 1000, w: 800 };
    const parts = calcParts(c, [shelf], false);
    const p = parts.find(p => p.n.startsWith('Полка'));
    expect(p?.l).toBe(800);
    expect(p?.w).toBe(c.depth - 4);
  });

  it('дверь: L = doorH, W = doorW', () => {
    const door = { id: 'd', type: 'door', x: 100, y: 100, w: 400, h: 600, doorW: 400, doorH: 600 };
    const parts = calcParts(c, [door], false);
    const p = parts.find(p => p.n.startsWith('Дверь'));
    expect(p?.l).toBe(600);
    expect(p?.w).toBe(400);
  });

  it('ящики: фасад + 2 боковины на каждый ящик', () => {
    const dr = { id: 'd', type: 'drawers', x: 100, y: 500, w: 400, h: 450, count: 3, drawerHeights: [150, 150, 150] };
    const parts = calcParts(c, [dr], false);
    const facades = parts.filter(p => p.n.startsWith('Фас.ящ'));
    const sides = parts.filter(p => p.n.startsWith('Бок.ящ'));
    expect(facades).toHaveLength(3);
    expect(sides).toHaveLength(3); // q=2 в каждом, но 3 записи (3 ящика)
    expect(sides[0].q).toBe(2);
    // Фасад: L = высота - 6, W = ширина - 4
    expect(facades[0].l).toBe(150 - 6);
    expect(facades[0].w).toBe(400 - 4);
  });

  // ──────────────────────────────────────────────────────────
  // depth — элемент с нестандартной глубиной попадает в раскрой
  // ──────────────────────────────────────────────────────────
  describe('depth поле', () => {
    it('полка без depth → W = corpus.depth - 4', () => {
      const shelf = { id: 'sh', type: 'shelf', x: 0, y: 1000, w: 800 };
      const parts = calcParts(c, [shelf], false);
      const p = parts.find(p => p.n.startsWith('Полка'));
      expect(p?.w).toBe(c.depth - 4);
    });

    it('полка с depth=300 → W = 296 (300-4)', () => {
      const shelf = { id: 'sh', type: 'shelf', x: 0, y: 1000, w: 800, depth: 300 };
      const parts = calcParts(c, [shelf], false);
      const p = parts.find(p => p.n.startsWith('Полка'));
      expect(p?.w).toBe(296);
    });

    it('стойка с depth=400 → W = 396', () => {
      const stud = { id: 's', type: 'stud', x: 600, pTop: 0, pBot: 2100, depth: 400 };
      const parts = calcParts(c, [stud], false);
      const p = parts.find(p => p.n.startsWith('Стойка'));
      expect(p?.w).toBe(396);
    });

    it('ящики с depth=450 → боковина L = 400 (450-50)', () => {
      const dr = { id: 'd', type: 'drawers', x: 100, y: 500, w: 400, h: 450, count: 3, drawerHeights: [150, 150, 150], depth: 450 };
      const parts = calcParts(c, [dr], false);
      const sides = parts.filter(p => p.n.startsWith('Бок.ящ'));
      expect(sides[0].l).toBe(400);
    });

    it('depth=0 или отрицательная → игнорируется, используется corpus.depth', () => {
      const shelf1 = { id: 'a', type: 'shelf', x: 0, y: 500, w: 800, depth: 0 };
      const shelf2 = { id: 'b', type: 'shelf', x: 0, y: 1500, w: 800, depth: -100 };
      const parts = calcParts(c, [shelf1, shelf2], false);
      const both = parts.filter(p => p.n.startsWith('Полка'));
      expect(both[0].w).toBe(c.depth - 4);
      expect(both[1].w).toBe(c.depth - 4);
    });
  });
});
