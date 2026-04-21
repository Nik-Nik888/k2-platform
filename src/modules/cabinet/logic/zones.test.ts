import { describe, it, expect } from 'vitest';
import { computeZones, findZone } from './zones';

const iW = 1200, iH = 2100, t = 16;

describe('computeZones', () => {
  it('пустой шкаф → одна зона на весь объём', () => {
    const zones = computeZones([], iW, iH, t);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({
      left: 0, right: iW,
      sl: 0, sw: iW,
      top: 0, bot: iH,
      bandIdx: 0, colIdx: 0,
    });
  });

  it('одна стойка в центре → 2 зоны (левая и правая колонки)', () => {
    const stud = { id: 's1', type: 'stud', x: 600 };
    const zones = computeZones([stud], iW, iH, t);
    expect(zones).toHaveLength(2);
    expect(zones[0].left).toBe(0);
    expect(zones[0].right).toBe(600);
    expect(zones[1].left).toBe(600);
    expect(zones[1].right).toBe(iW);
  });

  it('стойка не у края → её правая колонка начинается с x+t (учёт толщины)', () => {
    const stud = { id: 's1', type: 'stud', x: 600 };
    const zones = computeZones([stud], iW, iH, t);
    const rightCol = zones[1];
    // Для правой колонки: левая граница = stud.x (600), но sl = 600+t (учёт толщины стойки)
    expect(rightCol.left).toBe(600);
    expect(rightCol.sl).toBe(600 + t);
    expect(rightCol.sw).toBe(iW - 600 - t);
  });

  it('одна полка без стоек → 2 зоны (верхняя и нижняя)', () => {
    const shelf = { id: 'sh1', type: 'shelf', x: 0, y: 1000, w: iW };
    const zones = computeZones([shelf], iW, iH, t);
    expect(zones).toHaveLength(2);
    expect(zones[0].top).toBe(0);
    expect(zones[0].bot).toBe(1000);
    expect(zones[1].top).toBe(1000);
    expect(zones[1].bot).toBe(iH);
  });

  it('стойка + полка на всю ширину → 4 зоны (2 колонки × 2 полосы)', () => {
    const stud = { id: 's1', type: 'stud', x: 600 };
    const shelf = { id: 'sh1', type: 'shelf', x: 0, y: 1000, w: iW };
    const zones = computeZones([stud, shelf], iW, iH, t);
    expect(zones).toHaveLength(4);
  });

  it('полка только в левой колонке → справа одна зона, слева две', () => {
    const stud = { id: 's1', type: 'stud', x: 600 };
    // Полка с x=0, w=600 — только в левой колонке (не перекрывает правую)
    const shelf = { id: 'sh1', type: 'shelf', x: 0, y: 1000, w: 600 };
    const zones = computeZones([stud, shelf], iW, iH, t);
    // Левая колонка: 2 зоны (до и после полки), правая колонка: 1 зона
    expect(zones).toHaveLength(3);
  });

  it('полки сортируются по Y (возрастание)', () => {
    const sh1 = { id: 'a', type: 'shelf', x: 0, y: 1500, w: iW };
    const sh2 = { id: 'b', type: 'shelf', x: 0, y: 500, w: iW };
    const zones = computeZones([sh1, sh2], iW, iH, t);
    expect(zones).toHaveLength(3);
    expect(zones[0].top).toBe(0);
    expect(zones[0].bot).toBe(500);
    expect(zones[1].top).toBe(500);
    expect(zones[1].bot).toBe(1500);
    expect(zones[2].bot).toBe(iH);
  });

  it('каждая зона получает уникальный id z_{ci}_{yi}', () => {
    const stud = { id: 's1', type: 'stud', x: 600 };
    const shelf = { id: 'sh1', type: 'shelf', x: 0, y: 1000, w: iW };
    const zones = computeZones([stud, shelf], iW, iH, t);
    const ids = zones.map(z => z.id);
    expect(new Set(ids).size).toBe(zones.length);
    expect(ids).toContain('z_0_0');
    expect(ids).toContain('z_1_1');
  });
});

describe('findZone', () => {
  it('клик внутри зоны → эта зона', () => {
    const zones = computeZones([], iW, iH, t);
    const z = findZone(zones, 600, 1000);
    expect(z.id).toBe('z_0_0');
  });

  it('клик в левой колонке возвращает левую зону', () => {
    const stud = { id: 's1', type: 'stud', x: 600 };
    const zones = computeZones([stud], iW, iH, t);
    const z = findZone(zones, 300, 1000);
    expect(z.colIdx).toBe(0);
  });

  it('клик в правой колонке возвращает правую зону', () => {
    const stud = { id: 's1', type: 'stud', x: 600 };
    const zones = computeZones([stud], iW, iH, t);
    const z = findZone(zones, 900, 1000);
    expect(z.colIdx).toBe(1);
  });

  it('клик далеко за пределами → fallback к zones[0]', () => {
    const zones = computeZones([], iW, iH, t);
    const z = findZone(zones, 9999, 9999);
    expect(z).toBe(zones[0]);
  });

  it('допуск 10px по X и 5px по Y у границ', () => {
    const stud = { id: 's1', type: 'stud', x: 600 };
    const zones = computeZones([stud], iW, iH, t);
    // Клик чуть левее стойки в границе допуска — всё ещё левая зона
    const z = findZone(zones, 599, 1000);
    expect(z.colIdx).toBe(0);
  });
});
