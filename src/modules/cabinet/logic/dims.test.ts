import { describe, it, expect } from 'vitest';
import {
  computeTopLevelCols,
  computeDims,
  applyHorizDimChange,
  applyVertDimChange,
} from './dims';

const iW = 1200, iH = 2100, t = 16;

describe('computeTopLevelCols', () => {
  it('пустой шкаф → одна колонка на всю ширину', () => {
    const cols = computeTopLevelCols([], iW, t);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({ left: 0, right: iW, sl: 0, sw: iW });
  });

  it('одна стойка в центре → 2 колонки', () => {
    const cols = computeTopLevelCols([{ id: 's', type: 'stud', x: 600 }], iW, t);
    expect(cols).toHaveLength(2);
    expect(cols[0]).toMatchObject({ left: 0, right: 600 });
    expect(cols[1]).toMatchObject({ left: 600, right: iW });
  });

  it('правая колонка: sl = left + t (учёт толщины стойки)', () => {
    const cols = computeTopLevelCols([{ id: 's', type: 'stud', x: 600 }], iW, t);
    expect(cols[0]!.sl).toBe(0); // левая — без стойки слева
    expect(cols[1]!.sl).toBe(600 + t);
    expect(cols[1]!.sw).toBe(iW - 600 - t);
  });

  it('стойки сортируются по X', () => {
    const cols = computeTopLevelCols([
      { id: 'b', type: 'stud', x: 800 },
      { id: 'a', type: 'stud', x: 300 },
    ], iW, t);
    expect(cols).toHaveLength(3);
    expect(cols[0]!.right).toBe(300);
    expect(cols[1]!.left).toBe(300);
    expect(cols[1]!.right).toBe(800);
  });

  it('не-stud элементы игнорируются', () => {
    const cols = computeTopLevelCols([
      { id: 's', type: 'stud', x: 600 },
      { id: 'sh', type: 'shelf', x: 0, y: 1000, w: iW },
      { id: 'd', type: 'drawers', x: 100, y: 500 },
    ], iW, t);
    expect(cols).toHaveLength(2);
  });
});

describe('computeDims', () => {
  it('пустой шкаф → один W-размер на всю ширину + один H-размер на всю высоту', () => {
    const cols = computeTopLevelCols([], iW, t);
    const dims = computeDims([], cols, iH, iW);
    const wDims = dims.filter(d => d.t === 'w');
    const hDims = dims.filter(d => d.t === 'h');
    expect(wDims).toHaveLength(1);
    expect(wDims[0]!.w).toBe(iW);
    expect(hDims).toHaveLength(1);
    expect(hDims[0]!.h).toBe(iH);
  });

  it('одна стойка → 2 W-размера (ширины колонок) + 2 H-размера', () => {
    const els = [{ id: 's', type: 'stud', x: 600 }];
    const cols = computeTopLevelCols(els, iW, t);
    const dims = computeDims(els, cols, iH, iW);
    const wDims = dims.filter(d => d.t === 'w');
    expect(wDims).toHaveLength(2);
  });

  it('одна полка на всю ширину → дедуплицируется: H-размеры только в левой колонке', () => {
    // Две колонки, полка проходит через обе → две одинаковых H-группы.
    // Дедуп: оставляем только в левой.
    const els = [
      { id: 's', type: 'stud', x: 600 },
      { id: 'sh', type: 'shelf', x: 0, y: 1000, w: iW },
    ];
    const cols = computeTopLevelCols(els, iW, t);
    const dims = computeDims(els, cols, iH, iW);
    const hDims = dims.filter(d => d.t === 'h');
    // Без дедупа было бы 4 H-размера (2 колонки × 2 сегмента)
    // С дедупом: только в левой колонке (si=0) → 2 размера
    expect(hDims.every(d => d.si === 0)).toBe(true);
  });

  it('полка только в одной колонке → H-размеры отличаются между колонками', () => {
    const els = [
      { id: 's', type: 'stud', x: 600 },
      { id: 'sh', type: 'shelf', x: 0, y: 1000, w: 600 }, // только в левой
    ];
    const cols = computeTopLevelCols(els, iW, t);
    const dims = computeDims(els, cols, iH, iW);
    const hDims = dims.filter(d => d.t === 'h');
    // Левая колонка: 2 размера (верх + низ полки), правая: 1 размер (вся высота)
    expect(hDims.length).toBe(3);
  });

  it('сегменты < 25мм не создают H-размер', () => {
    // Полка очень близко к верху — между верхом и полкой меньше 25 мм
    const els = [{ id: 'sh', type: 'shelf', x: 0, y: 10, w: iW }];
    const cols = computeTopLevelCols(els, iW, t);
    const dims = computeDims(els, cols, iH, iW);
    const hDims = dims.filter(d => d.t === 'h');
    // Только 1 сегмент: от полки до низа
    expect(hDims).toHaveLength(1);
    expect(hDims[0]!.topY).toBe(10);
  });
});

describe('applyHorizDimChange', () => {
  const els = [{ id: 's1', type: 'stud', x: 600 }];
  const cols = computeTopLevelCols(els, iW, t);

  it('одна колонка (без стоек) → меняется ширина корпуса', () => {
    const cmd = applyHorizDimChange(
      { t: 'w', x: 0, w: iW, si: 0 },
      1500,
      'left',
      computeTopLevelCols([], iW, t),
      [],
      iW, t,
    );
    expect(cmd).toEqual({ type: 'updateCorpusWidth', width: 1500 + 2 * t });
  });

  it('меняем ширину левой колонки → стойка двигается вправо', () => {
    const cmd = applyHorizDimChange(
      { t: 'w', x: 0, w: 600, si: 0 },
      700, 'left',
      cols, els, iW, t,
    );
    expect(cmd).toEqual({ type: 'updateStud', id: 's1', x: 700 });
  });

  it('меняем ширину правой колонки (dir=right) → стойка двигается влево', () => {
    // Правая колонка si=1, её sl=600+t=616, sw=iW-616=584
    // Хотим сделать ширину правой = 400 → stud.x = sl + sw - v = 616 + 584 - 400 = 800
    const cmd = applyHorizDimChange(
      { t: 'w', x: 600 + t, w: iW - 600 - t, si: 1 },
      400, 'right',
      cols, els, iW, t,
    );
    // si=1: tryLeft -> studs[0]=s1, nx = sl+sw-v = 616+584-400 = 800
    expect(cmd).toEqual({ type: 'updateStud', id: 's1', x: 800 });
  });
});

describe('applyVertDimChange', () => {
  const els = [
    { id: 's1', type: 'stud', x: 600 },
    { id: 'sh1', type: 'shelf', x: 0, y: 1000, w: iW },
  ];
  const cols = computeTopLevelCols(els, iW, t);

  it('размер сверху (от потолка до полки) = 1200 → полка сдвигается на y=1200', () => {
    // d.topY=0, d.h=1000, пользователь меняет на 1200
    const cmd = applyVertDimChange(
      { t: 'h', x: 0, y: 0, h: 1000, si: 0, topY: 0 },
      1200, 'top',
      cols, els, iH,
    );
    // tryTop: ищем элемент с y≈gB (=1000) → полка sh1. ny = gT + v = 0 + 1200
    expect(cmd).toEqual({ id: 'sh1', y: 1200 });
  });

  it('несуществующая колонка → null', () => {
    const cmd = applyVertDimChange(
      { t: 'h', x: 0, y: 0, h: 1000, si: 99, topY: 0 },
      1200, 'top',
      cols, els, iH,
    );
    expect(cmd).toBeNull();
  });
});
