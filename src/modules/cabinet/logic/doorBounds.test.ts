import { describe, it, expect } from 'vitest';
import { findDoorBounds, computeDoorSnapTargets } from './doorBounds';

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

// ───────────────────────────────────────────────────────────────
// computeDoorSnapTargets: регрессия на баг "краевая стойка игнорируется
// при resize, snap уходит на стену". Причина — два таргета на одной pos.
// ───────────────────────────────────────────────────────────────
describe('computeDoorSnapTargets edge-cases', () => {
  it('краевая стойка x=0 заменяет стену slева — только ОДИН таргет на pos=0', () => {
    // computeDoorSnapTargets импортирован сверху
    const stud = { id: 'sL', type: 'stud', x: 0, anchorY: iH / 2 };
    const { vTargets } = computeDoorSnapTargets([stud], iW, iH, t);
    const atZero = vTargets.filter((v: any) => v.pos === 0);
    expect(atZero).toHaveLength(1);
    // И это должна быть СТОЙКА (innerEdgeFromHighSide=t), а не стена (innerEdgeFromHighSide=0)
    expect(atZero[0]!.innerEdgeFromHighSide).toBe(t);
  });

  it('краевая стойка x=iW-t заменяет стену справа — только ОДИН таргет на pos=iW', () => {
    // computeDoorSnapTargets импортирован сверху
    const stud = { id: 'sR', type: 'stud', x: iW - t, anchorY: iH / 2 };
    const { vTargets } = computeDoorSnapTargets([stud], iW, iH, t);
    const atRight = vTargets.filter((v: any) => v.pos === iW);
    expect(atRight).toHaveLength(0); // внешняя стена не добавлена
    // Зато есть стойка на pos=iW-t с innerEdgeFromLowSide=iW-t
    const stud1 = vTargets.find((v: any) => v.pos === iW - t);
    expect(stud1).toBeDefined();
    expect(stud1!.innerEdgeFromLowSide).toBe(iW - t);
  });

  it('без краевых стоек — стены 0 и iW присутствуют как раньше', () => {
    // computeDoorSnapTargets импортирован сверху
    const stud = { id: 's', type: 'stud', x: 600, anchorY: iH / 2 };
    const { vTargets } = computeDoorSnapTargets([stud], iW, iH, t);
    const walls = vTargets.filter((v: any) => v.isWall);
    expect(walls).toHaveLength(2);
    expect(walls[0]!.pos).toBe(0);
    expect(walls[1]!.pos).toBe(iW);
  });

  it('краевая полка y=0 заменяет стену сверху в hTargets', () => {
    // computeDoorSnapTargets импортирован сверху
    const shelf = { id: 'sh', type: 'shelf', x: 0, y: 0, w: iW };
    const { hTargets } = computeDoorSnapTargets([shelf], iW, iH, t);
    const atZero = hTargets.filter((h: any) => h.pos === 0);
    expect(atZero).toHaveLength(1);
    // Полка — это не стена (isWall: false) и innerEdgeFromHighSide = range.bot = t (Smart-Y)
    expect(atZero[0]!.isWall).toBe(false);
    expect(atZero[0]!.innerEdgeFromHighSide).toBe(t);
  });
});

// ───────────────────────────────────────────────────────────────
// Регрессия: стойки/полки за пределами внутреннего пространства [0, iW] × [0, iH]
// должны игнорироваться. Такие данные могут попадать из легаси-сохранений.
// ───────────────────────────────────────────────────────────────
describe('out-of-bounds elements', () => {
  it('стойка за пределами iW игнорируется в findDoorBounds', () => {
    // iW=1200, стойка x=1216 (16мм за стенкой) — должна быть проигнорирована
    const stud = { id: 'oob', type: 'stud', x: 1216, anchorY: iH / 2 };
    const center = { id: 's', type: 'stud', x: 600, anchorY: iH / 2 };
    // Клик в правой колонке — должен видеть только центральную стойку слева и стену корпуса справа
    const b = findDoorBounds([stud, center], 800, 1000, iW, iH, t);
    expect(b.right.x).toBe(iW); // не 1216 — внешняя стенка
    expect(b.right.isWall).toBe(true);
  });

  it('стойка за пределами iW игнорируется в snapTargets', () => {
    const stud = { id: 'oob', type: 'stud', x: 1216, anchorY: iH / 2 };
    const center = { id: 's', type: 'stud', x: 600, anchorY: iH / 2 };
    const { vTargets } = computeDoorSnapTargets([stud, center], iW, iH, t);
    // 1216 не должно быть среди таргетов
    expect(vTargets.find((v: any) => v.pos === 1216)).toBeUndefined();
    // А стена pos=iW должна быть, т.к. краевой стойки справа в [0, iW] нет
    expect(vTargets.find((v: any) => v.pos === iW && v.isWall)).toBeDefined();
  });

  it('полка за пределами iH игнорируется', () => {
    // iH=2100, полка y=2200 — за пределами
    const shelf = { id: 'oob', type: 'shelf', x: 0, y: 2200, w: iW };
    const stud = { id: 's', type: 'stud', x: 600, anchorY: iH / 2 };
    const b = findDoorBounds([shelf, stud], 280, 1000, iW, iH, t);
    expect(b.bottom.y).toBe(iH);
    expect(b.bottom.isWall).toBe(true);
  });
});
