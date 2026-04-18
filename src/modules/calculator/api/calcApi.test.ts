import { describe, it, expect } from 'vitest';
import { parseDims, calcMatQty, calcInsulation, calcByMode, calcRails } from './calcApi';
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
// calcMatQty — отделочный материал (вагонка, панели)
// ──────────────────────────────────────────────────────────
describe('calcMatQty', () => {
  it('вагонка 3000x90, стена 3000x2500, вертикально → 28', () => {
    expect(calcMatQty(3000, 2500, '3000x90', 'vertical')).toBe(28);
  });

  it('вагонка 3000x90, стена 3000x2500, горизонтально → 34', () => {
    expect(calcMatQty(3000, 2500, '3000x90', 'horizontal')).toBe(34);
  });

  it('пустой matDims → 0', () => {
    expect(calcMatQty(3000, 2500, null, 'vertical')).toBe(0);
    expect(calcMatQty(3000, 2500, '', 'vertical')).toBe(0);
  });

  it('штучный лист (isLinear=false): 10м² стены, лист 2.5×0.6 → 8', () => {
    // wallArea = 4 × 2.5 = 10 м², matArea = 2.5 × 0.6 = 1.5 м²
    // 10/1.5 × 1.1 = 7.33 → ceil = 8
    expect(calcMatQty(4000, 2500, '2500x600', 'vertical', false)).toBe(8);
  });
});

// ──────────────────────────────────────────────────────────
// calcRails — умная резка реек на равные части + стыковка
// Ядро новой формулы. Тестируем все граничные случаи.
// ──────────────────────────────────────────────────────────
describe('calcRails', () => {
  // ── Случай 1: полоса помещается в рейку, равные части ──
  it('рейка 3000, полоса 2700, 1 полоса → 1 рейка (целая часть)', () => {
    // floor(3000/2700) = 1 часть на рейку, ceil(1/1) = 1
    expect(calcRails(1, 2700, 3000).qty).toBe(1);
  });

  it('рейка 3000, полоса 2000, 1 полоса → 1 рейка', () => {
    // floor(3000/2000) = 1 часть, ceil(1/1) = 1
    expect(calcRails(1, 2000, 3000).qty).toBe(1);
  });

  it('рейка 3000, полоса 1500, 1 полоса → 1 рейка (берём половину)', () => {
    // floor(3000/1500) = 2 части, ceil(1/2) = 1
    expect(calcRails(1, 1500, 3000).qty).toBe(1);
  });

  it('рейка 3000, полоса 1500, 2 полосы → 1 рейка (две половины с одной)', () => {
    // 2 полосы / 2 части на рейку = 1 рейка
    expect(calcRails(2, 1500, 3000).qty).toBe(1);
  });

  it('рейка 3000, полоса 1500, 3 полосы → 2 рейки', () => {
    // ceil(3/2) = 2
    expect(calcRails(3, 1500, 3000).qty).toBe(2);
  });

  it('рейка 3000, полоса 1000, 1 полоса → 1 рейка (треть)', () => {
    // floor(3000/1000) = 3 части
    expect(calcRails(1, 1000, 3000).qty).toBe(1);
  });

  it('рейка 3000, полоса 1000, 3 полосы → 1 рейка (три трети с одной)', () => {
    expect(calcRails(3, 1000, 3000).qty).toBe(1);
  });

  it('рейка 3000, полоса 1000, 7 полос → 3 рейки (ceil(7/3))', () => {
    expect(calcRails(7, 1000, 3000).qty).toBe(3);
  });

  it('рейка 3000, полоса 750, 1 полоса → 1 рейка (четверть)', () => {
    // floor(3000/750) = 4 части
    expect(calcRails(1, 750, 3000).qty).toBe(1);
  });

  it('рейка 3000, полоса 900, 5 полос → 2 рейки (floor(3000/900)=3, ceil(5/3)=2)', () => {
    // floor(3000/900) = 3 части (900×3=2700, в рейку помещается), ceil(5/3)=2
    expect(calcRails(5, 900, 3000).qty).toBe(2);
  });

  // ── Случай 2: полоса длиннее рейки — стыковка ──
  it('рейка 3000, полоса 5000, 1 полоса → 2 рейки (целая + остаток 2000)', () => {
    // 1 целая + остаток 2000: floor(3000/2000)=1, ceil(1/1)=1 → 1+1=2
    expect(calcRails(1, 5000, 3000).qty).toBe(2);
  });

  it('рейка 3000, полоса 5000, 7 полос → 14 реек (7 целых + 7 остатков по 2000)', () => {
    // 7 целых + остаток 2000 на 7 полос, floor(3000/2000)=1, ceil(7/1)=7 → 7+7=14
    expect(calcRails(7, 5000, 3000).qty).toBe(14);
  });

  it('рейка 3000, полоса 4000, 7 полос → 10 реек', () => {
    // 7 целых + остаток 1000 на 7 полос, floor(3000/1000)=3, ceil(7/3)=3 → 7+3=10
    expect(calcRails(7, 4000, 3000).qty).toBe(10);
  });

  it('рейка 3000, полоса 6000 (ровно 2 рейки), 3 полосы → 6 реек (без остатка)', () => {
    // остаток = 0, возвращаем только целые: 3 × 2 = 6
    expect(calcRails(3, 6000, 3000).qty).toBe(6);
  });

  it('рейка 3000, полоса 9000 (ровно 3), 5 полос → 15', () => {
    expect(calcRails(5, 9000, 3000).qty).toBe(15);
  });

  // ── Граничные случаи ──
  it('0 полос → 0 реек', () => {
    expect(calcRails(0, 2500, 3000).qty).toBe(0);
  });

  it('полоса длины 0 → 0 реек', () => {
    expect(calcRails(5, 0, 3000).qty).toBe(0);
  });

  it('длина рейки неизвестна → fallback (1 рейка на полосу)', () => {
    expect(calcRails(5, 2500, 0).qty).toBe(5);
  });

  it('hint не пустой для осмысленных входов', () => {
    const r = calcRails(7, 1500, 3000);
    expect(r.hint).toContain('полос');
    expect(r.hint).toMatch(/\d+/);
  });
});

// ──────────────────────────────────────────────────────────
// calcByMode — режимы расчёта скрытых материалов
// ──────────────────────────────────────────────────────────
describe('calcByMode', () => {
  const rail3m: Material = {
    id: 'rail3m', name: 'Рейка 3000x40', unit: 'шт', price: 100, description: '3000x40', sku: null,
  };
  const rail6m: Material = {
    id: 'rail6m', name: 'Рейка 6000x40', unit: 'шт', price: 180, description: '6000x40', sku: null,
  };

  // ── fixed ──
  it('fixed: возвращает заданное количество', () => {
    const r = calcByMode(5, 'fixed', rail3m, 0, 0, 'vertical');
    expect(r.qty).toBe(5);
  });

  // ── perim ──
  it('perim: 1шт/м, стена 3×2.5 (P=11) → 4 рейки по 3м', () => {
    const r = calcByMode(1, 'perim', rail3m, 2500, 3000, 'vertical');
    expect(r.qty).toBe(4);
  });

  // ── width / height ──
  it('width: 1шт/м × 3м → 1 рейка', () => {
    const r = calcByMode(1, 'width', rail3m, 2500, 3000, 'vertical');
    expect(r.qty).toBe(1);
  });

  it('height: 1шт/м × 2.5м × 2бок → 2 рейки', () => {
    const r = calcByMode(1, 'height', rail3m, 2500, 3000, 'vertical');
    expect(r.qty).toBe(2);
  });

  // ── per_sqm ──
  it('per_sqm: 2шт/м² × 7.5м² → 15', () => {
    const r = calcByMode(2, 'per_sqm', rail3m, 2500, 3000, 'vertical');
    expect(r.qty).toBe(15);
  });

  // ── step (новая умная формула) ──
  it('step: шаг 500, стена 3000x2500 вертикально → 7 реек (7 полос × 1 целая)', () => {
    // direction='vertical' → strips=floor(3000/500)+1=7, stripLen=2500
    // 2500 ≤ 3000 → floor(3000/2500)=1 часть/рейка, ceil(7/1)=7
    const r = calcByMode(500, 'step', rail3m, 2500, 3000, 'vertical');
    expect(r.qty).toBe(7);
  });

  it('step: стена 3000x1500, шаг 500, вертикально → 4 рейки (7 полос × 1/2 = ceil(7/2)=4)', () => {
    // strips=floor(3000/500)+1=7, stripLen=1500, пополам → ceil(7/2)=4
    const r = calcByMode(500, 'step', rail3m, 1500, 3000, 'vertical');
    expect(r.qty).toBe(4);
  });

  it('step: стена 3000x1000, шаг 500, вертикально → 3 рейки (ceil(7/3))', () => {
    // strips=7, stripLen=1000, треть → ceil(7/3)=3
    const r = calcByMode(500, 'step', rail3m, 1000, 3000, 'vertical');
    expect(r.qty).toBe(3);
  });

  it('step: полоса длиннее рейки — стена 5000x3000, шаг 500, вертикально → стыковка', () => {
    // direction='vertical' → strips=floor(3000/500)+1=7
    // wait, здесь нужно понять hMm/wMm — это h=5000, w=3000.
    // vertical → strips=floor(3000/500)+1=7, stripLen=hMm=5000
    // 5000 > 3000 → целая (3000) + остаток 2000
    // 7 целых + 7 × ceil(7/1) → 7+7=14
    const r = calcByMode(500, 'step', rail3m, 5000, 3000, 'vertical');
    expect(r.qty).toBe(14);
  });

  // ── step с crossDirection — каркас под отделку ──
  it('step + crossDirection=true: отделка horizontal → каркас vertical', () => {
    // direction='horizontal' + cross=true → effDir='vertical'
    // strips=floor(3000/500)+1=7, stripLen=2500, floor(3000/2500)=1 → 7
    const r = calcByMode(500, 'step', rail3m, 2500, 3000, 'horizontal', true);
    expect(r.qty).toBe(7);
    expect(r.hint).toContain('⟂');
  });

  it('step + crossDirection=true: отделка vertical → каркас horizontal', () => {
    // direction='vertical' + cross=true → effDir='horizontal'
    // strips=floor(2500/500)+1=6, stripLen=3000, floor(3000/3000)=1 → 6
    const r = calcByMode(500, 'step', rail3m, 2500, 3000, 'vertical', true);
    expect(r.qty).toBe(6);
  });

  it('step без cross vs с cross дают разные результаты', () => {
    const normal = calcByMode(500, 'step', rail3m, 2500, 3000, 'horizontal').qty;
    const crossed = calcByMode(500, 'step', rail3m, 2500, 3000, 'horizontal', true).qty;
    expect(normal).not.toBe(crossed);
  });

  // ── step с рейкой 6м ──
  it('step: стена 5000x3000 вертикально, рейка 6м → рейки не стыкуются (5000 < 6000)', () => {
    // vertical: strips=floor(3000/500)+1=7, stripLen=5000, 5000 ≤ 6000
    // floor(6000/5000)=1 часть/рейка, ceil(7/1)=7
    const r = calcByMode(500, 'step', rail6m, 5000, 3000, 'vertical');
    expect(r.qty).toBe(7);
  });

  // ── Защита ──
  it('baseQty=0 → qty=0', () => {
    expect(calcByMode(0, 'step', rail3m, 2500, 3000, 'vertical').qty).toBe(0);
    expect(calcByMode(0, 'perim', rail3m, 2500, 3000, 'vertical').qty).toBe(0);
  });

  it('нулевые размеры стены → qty=0 для geometric режимов', () => {
    expect(calcByMode(1, 'perim', rail3m, 0, 0, 'vertical').qty).toBe(0);
    expect(calcByMode(1, 'width', rail3m, 0, 0, 'vertical').qty).toBe(0);
  });

  // ── area_sheet ──
  it('area_sheet: лист 2500x1250, стена 5м² × 1 = 2 листа (5/3.125 ×1.1 = 1.76 → 2)', () => {
    const sheet: Material = {
      id: 's1', name: 'Лист', unit: 'шт', price: 500, description: '2500x1250', sku: null,
    };
    // stena 2500×2000 = 5м², matArea = 2.5×1.25 = 3.125, 5/3.125 × 1.1 = 1.76 → 2
    const r = calcByMode(1, 'area_sheet', sheet, 2500, 2000, 'vertical');
    expect(r.qty).toBe(2);
  });
});
