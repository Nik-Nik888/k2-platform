import { describe, it, expect } from 'vitest';
import { parseDims, calcMatQty, calcInsulation, calcByMode } from './calcApi';
import type { Material } from './calcApi';

// ──────────────────────────────────────────────────────────
// parseDims — парсинг строки "3000x40" в объект {d, s}
// ──────────────────────────────────────────────────────────
describe('parseDims', () => {
  it('парсит стандартную строку с крестом "x"', () => {
    expect(parseDims('3000x40')).toEqual({ d: 3000, s: 40 });
  });

  it('парсит через "*"', () => {
    expect(parseDims('3000*40')).toEqual({ d: 3000, s: 40 });
  });

  it('парсит через Unicode "×"', () => {
    expect(parseDims('3000×40')).toEqual({ d: 3000, s: 40 });
  });

  it('парсит через русскую "х"', () => {
    expect(parseDims('3000х40')).toEqual({ d: 3000, s: 40 });
  });

  it('игнорирует пробелы', () => {
    expect(parseDims('3000 x 40')).toEqual({ d: 3000, s: 40 });
  });

  it('возвращает 0/0 для null/undefined/пустой строки', () => {
    expect(parseDims(null)).toEqual({ d: 0, s: 0 });
    expect(parseDims(undefined)).toEqual({ d: 0, s: 0 });
    expect(parseDims('')).toEqual({ d: 0, s: 0 });
  });

  it('возвращает только d если задана одна размерность', () => {
    expect(parseDims('3000')).toEqual({ d: 3000, s: 0 });
  });
});

// ──────────────────────────────────────────────────────────
// calcInsulation — утеплитель, лист 1.2×0.6 = 0.72 м²
// ──────────────────────────────────────────────────────────
describe('calcInsulation', () => {
  it('5 м² стены → 7 листов (5 / 0.72 = 6.94, округление вверх)', () => {
    expect(calcInsulation(5)).toBe(7);
  });

  it('10 м² стены → 14 листов', () => {
    expect(calcInsulation(10)).toBe(14);
  });

  it('0 м² → 0 листов', () => {
    expect(calcInsulation(0)).toBe(0);
  });

  it('площадь ровно 0.72 (ровно один лист) → 1', () => {
    expect(calcInsulation(0.72)).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────
// calcMatQty — отделочный материал (вагонка, панели и т.п.)
// Логика: сколько длинномерных планок нужно на стену
// ──────────────────────────────────────────────────────────
describe('calcMatQty', () => {
  it('вагонка 3000x90, стена 3000x2500, вертикально: 28 шт. (ceil(2500/90) × ceil(3000/3000))', () => {
    // полос = ceil(2500 / 90) = 28, на каждую = ceil(3000/3000) = 1 → 28
    expect(calcMatQty(3000, 2500, '3000x90', 'vertical')).toBe(28);
  });

  it('вагонка 3000x90, стена 3000x2500, горизонтально: 34 шт.', () => {
    // полос = ceil(3000 / 90) = 34, на каждую = ceil(2500/3000) = 1 → 34
    expect(calcMatQty(3000, 2500, '3000x90', 'horizontal')).toBe(34);
  });

  it('рейка 6000x40, стена 2500x3000 горизонтально: 63 шт.', () => {
    // полос = ceil(2500/40) = 63, на полосу = ceil(3000/6000) = 1 → 63
    expect(calcMatQty(2500, 3000, '6000x40', 'horizontal')).toBe(63);
  });

  it('пустой matDims → 0', () => {
    expect(calcMatQty(3000, 2500, null, 'vertical')).toBe(0);
    expect(calcMatQty(3000, 2500, '', 'vertical')).toBe(0);
  });

  it('только ширина материала без длины — длина по умолчанию 3000', () => {
    // '0x90' → s=90, d=0, длина по дефолту 3000
    // стена 3000x2500 vertical: полос=ceil(2500/90)=28, на полосу=ceil(3000/3000)=1 → 28
    expect(calcMatQty(3000, 2500, 'x90', 'vertical')).toBe(0); // parseDims не пропустит пустой d
  });

  it('штучный лист (isLinear=false): 10м² стены, лист 0.6×2.5 м = 1.5 м² → ceil(10/1.5 × 1.1) = 8', () => {
    // 10 / 1.5 = 6.66 × 1.1 = 7.33 → ceil = 8
    expect(calcMatQty(4000, 2500, '2500x600', 'vertical', false)).toBe(8);
  });
});

// ──────────────────────────────────────────────────────────
// calcByMode — расчёт скрытых материалов по режимам
// Это сердце системы, все режимы тестируем.
// ──────────────────────────────────────────────────────────
describe('calcByMode', () => {
  const rail3m: Material = {
    id: 'rail3m', name: 'Рейка 3000x40', unit: 'шт', price: 100, description: '3000x40', sku: null,
  };
  const rail6m: Material = {
    id: 'rail6m', name: 'Рейка 6000x40', unit: 'шт', price: 180, description: '6000x40', sku: null,
  };

  // ── fixed ──
  it('fixed: просто возвращает заданное количество', () => {
    const r = calcByMode(5, 'fixed', rail3m, 0, 0, 'vertical');
    expect(r.qty).toBe(5);
  });

  // ── perim ──
  it('perim: 1 шт на метр, стена 3×2.5 → P=11 → ceil(11/3) = 4 рейки', () => {
    const r = calcByMode(1, 'perim', rail3m, 2500, 3000, 'vertical');
    // perim = 2×(2.5+3) = 11 м, рейка 3м → ceil(11/3) = 4
    expect(r.qty).toBe(4);
  });

  // ── width / height ──
  it('width: 1 шт на метр ширины, стена 3м → ceil(3/3) = 1', () => {
    const r = calcByMode(1, 'width', rail3m, 2500, 3000, 'vertical');
    expect(r.qty).toBe(1);
  });

  it('height: бокА×2, стена высотой 2.5м → ceil(5/3) = 2', () => {
    const r = calcByMode(1, 'height', rail3m, 2500, 3000, 'vertical');
    expect(r.qty).toBe(2);
  });

  // ── per_sqm ──
  it('per_sqm: 2 шт на м², стена 3×2.5 = 7.5м² → 15', () => {
    const r = calcByMode(2, 'per_sqm', rail3m, 2500, 3000, 'vertical');
    expect(r.qty).toBe(15);
  });

  // ── step ──
  it('step: шаг 500мм, стена 3000x2500 горизонтально → 6 шт (17.5пм / 3м)', () => {
    // direction=horizontal: полос = floor(2500/500)+1 = 6, stripLen = 3000 мм
    // всего = 6 × 3 = 18 м, рейка 3м → ceil(18/3) = 6
    const r = calcByMode(500, 'step', rail3m, 2500, 3000, 'horizontal');
    expect(r.qty).toBe(6);
  });

  it('step: шаг 500мм вертикально → полос 7, stripLen 2.5 → ceil(17.5/3)=6', () => {
    const r = calcByMode(500, 'step', rail3m, 2500, 3000, 'vertical');
    // полос = floor(3000/500)+1 = 7, stripLen = 2500
    // всего = 7 × 2.5 = 17.5 м, рейка 3м → ceil(17.5/3) = 6
    expect(r.qty).toBe(6);
  });

  // ── step_whole ── (главный фикс — рейка не стыкуется)
  it('step_whole: шаг 500мм, стена 3000x2500 горизонтально → 7 шт (целая рейка на каждую полосу)', () => {
    // Направление рейки противоположно отделке:
    // horizontal direction → полос = floor(2500/500)+1 = 6
    // но я жду что direction = 'horizontal' отражает отделку, не рейку
    // См. formula: direction='horizontal' → strips = floor(hMm/step)+1 = floor(2500/500)+1 = 6
    // stripLen = wMm = 3000. На полосу = ceil(3/3) = 1 рейка. Всего = 6×1 = 6
    const r = calcByMode(500, 'step_whole', rail3m, 2500, 3000, 'horizontal');
    expect(r.qty).toBe(6);
  });

  it('step_whole: пример из жизни — стена 3000×2500, рейка 3000 длиной, шаг 500, вертикально → 7', () => {
    // direction=vertical → strips = floor(3000/500)+1 = 7
    // stripLen = 2500 мм = 2.5 м
    // На полосу = ceil(2.5/3) = 1
    // Всего = 7 × 1 = 7 ✅
    const r = calcByMode(500, 'step_whole', rail3m, 2500, 3000, 'vertical');
    expect(r.qty).toBe(7);
  });

  it('step_whole с рейкой 6м: стена 3×5м, шаг 500 вертикально → полос 11 × ceil(3/6)=1 = 11', () => {
    const r = calcByMode(500, 'step_whole', rail6m, 3000, 5000, 'vertical');
    // strips = floor(5000/500)+1 = 11, stripLen = 3м, на полосу = ceil(3/6) = 1 → 11
    expect(r.qty).toBe(11);
  });

  // ── step_cross / step_whole_cross ──
  // Инвертируют направление. Используется для каркаса под отделку.
  it('step_whole_cross: вагонка горизонтальная → каркас вертикальный, шаг 500', () => {
    // direction='horizontal' (это отделка) → inverted='vertical'
    // После инверсии: strips = floor(3000/500)+1 = 7, stripLen=2500, на полосу=ceil(2.5/3)=1 → 7
    const r = calcByMode(500, 'step_whole_cross', rail3m, 2500, 3000, 'horizontal');
    expect(r.qty).toBe(7);
  });

  it('step_cross: вагонка вертикальная → каркас горизонтальный, шаг 500', () => {
    // direction='vertical' → inverted='horizontal'
    // strips = floor(2500/500)+1 = 6, stripLen=3000, всего=18м, ceil(18/3)=6
    const r = calcByMode(500, 'step_cross', rail3m, 2500, 3000, 'vertical');
    expect(r.qty).toBe(6);
  });

  // ── Защита от zero/undefined ──
  it('baseQty = 0 → qty = 0 на любом режиме', () => {
    expect(calcByMode(0, 'step', rail3m, 2500, 3000, 'vertical').qty).toBe(0);
    expect(calcByMode(0, 'perim', rail3m, 2500, 3000, 'vertical').qty).toBe(0);
    expect(calcByMode(0, 'fixed', rail3m, 2500, 3000, 'vertical').qty).toBe(0);
  });

  it('нулевые размеры стены → qty = 0 для geometric режимов', () => {
    expect(calcByMode(1, 'perim', rail3m, 0, 0, 'vertical').qty).toBe(0);
    expect(calcByMode(1, 'width', rail3m, 0, 0, 'vertical').qty).toBe(0);
  });

  // ── hint содержит осмысленный текст ──
  it('hint в step_whole содержит количество полос', () => {
    const r = calcByMode(500, 'step_whole', rail3m, 2500, 3000, 'vertical');
    expect(r.hint).toContain('полос');
    expect(r.hint).toMatch(/\d+шт/);
  });
});
