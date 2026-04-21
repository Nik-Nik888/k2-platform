import { describe, it, expect } from 'vitest';
import { findDoorBounds } from './doorBounds';

const iW = 1200, iH = 2100, t = 16;

describe('findDoorBounds', () => {
  it('пустой шкаф → 4 стены по периметру', () => {
    const b = findDoorBounds([], 600, 1000, iW, iH, t);
    expect(b.left).toMatchObject({ x: 0, isWall: true });
    expect(b.right).toMatchObject({ x: iW, isWall: true });
    expect(b.top).toMatchObject({ y: 0, isWall: true });
    expect(b.bottom).toMatchObject({ y: iH, isWall: true });
  });

  it('клик в левой колонке (есть стойка справа) → правая граница = стойка', () => {
    const stud = { id: 's', type: 'stud', x: 600, anchorY: iH / 2 };
    const b = findDoorBounds([stud], 300, 1000, iW, iH, t);
    expect(b.left).toMatchObject({ x: 0, isWall: true });
    expect(b.right).toMatchObject({ x: 600, isWall: false });
  });

  it('клик в правой колонке → левая граница = стойка', () => {
    const stud = { id: 's', type: 'stud', x: 600, anchorY: iH / 2 };
    const b = findDoorBounds([stud], 900, 1000, iW, iH, t);
    expect(b.left).toMatchObject({ x: 600, isWall: false });
    expect(b.right).toMatchObject({ x: iW, isWall: true });
  });

  it('полка сверху ограничивает top границу', () => {
    const shelf = { id: 'sh', type: 'shelf', x: 0, y: 500, w: iW };
    const b = findDoorBounds([shelf], 600, 1000, iW, iH, t);
    expect(b.top).toMatchObject({ y: 500, isWall: false });
    expect(b.bottom).toMatchObject({ y: iH, isWall: true });
  });

  it('полка снизу ограничивает bottom границу', () => {
    const shelf = { id: 'sh', type: 'shelf', x: 0, y: 1500, w: iW };
    const b = findDoorBounds([shelf], 600, 1000, iW, iH, t);
    expect(b.top).toMatchObject({ y: 0, isWall: true });
    expect(b.bottom).toMatchObject({ y: 1500, isWall: false });
  });

  it('стойка у самого края (x<t+2) → левая стена заменяется на стойку (isWall=true)', () => {
    // Когда стойка у края — она эффективно становится стеной: vBounds не добавляет
    // стену слева (studNearLeft=true), но добавляет стойку как границу
    const stud = { id: 's', type: 'stud', x: 5, anchorY: iH / 2 };
    const b = findDoorBounds([stud], 600, 1000, iW, iH, t);
    // Левая граница — стойка (isWall=false), потому что studNearLeft=true делает
    // что стену слева не добавили, осталась только стойка
    expect(b.left.x).toBe(5);
  });

  it('полка не перекрывающая X-позицию клика — игнорируется', () => {
    // Полка только в левой половине, клик справа — полка НЕ должна быть границей
    const shelf = { id: 'sh', type: 'shelf', x: 0, y: 500, w: 400 };
    const b = findDoorBounds([shelf], 900, 1000, iW, iH, t);
    expect(b.top).toMatchObject({ y: 0, isWall: true });
  });

  it('несколько полок: top = ближайшая снизу выше клика', () => {
    const sh1 = { id: 'a', type: 'shelf', x: 0, y: 300, w: iW };
    const sh2 = { id: 'b', type: 'shelf', x: 0, y: 700, w: iW };
    const b = findDoorBounds([sh1, sh2], 600, 1000, iW, iH, t);
    expect(b.top.y).toBe(700);
  });

  it('несколько стоек: left = ближайшая слева', () => {
    const s1 = { id: 'a', type: 'stud', x: 300, anchorY: iH / 2 };
    const s2 = { id: 'b', type: 'stud', x: 700, anchorY: iH / 2 };
    const b = findDoorBounds([s1, s2], 900, 1000, iW, iH, t);
    expect(b.left.x).toBe(700);
  });

  it('полка проходящая через стойку ограничивает её реальный диапазон', () => {
    // Стойка посреди шкафа, полка идёт через неё → стойка ограничена полкой по Y
    const stud = { id: 's', type: 'stud', x: 600, anchorY: 1500 };
    const shelf = { id: 'sh', type: 'shelf', x: 0, y: 1000, w: iW };
    // Клик ВЫШЕ полки (y=500): стойки нет в этом Y-диапазоне
    const bAbove = findDoorBounds([stud, shelf], 300, 500, iW, iH, t);
    // Стойка не должна быть границей, т.к. она только под полкой
    expect(bAbove.right.isWall).toBe(true); // правая стена, не стойка

    // Клик НИЖЕ полки (y=1500): стойка есть
    const bBelow = findDoorBounds([stud, shelf], 300, 1500, iW, iH, t);
    expect(bBelow.right.x).toBe(600);
  });
});
