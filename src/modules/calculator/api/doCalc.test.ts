import { describe, it, expect } from 'vitest';
import { mergeResults } from './doCalc';
import type { CalcResults } from './doCalc';

// ──────────────────────────────────────────────────────────
// mergeResults — слияние результатов разных вкладок в сводную
// ──────────────────────────────────────────────────────────
describe('mergeResults', () => {
  it('пустой объект → пустой массив', () => {
    expect(mergeResults({})).toEqual([]);
  });

  it('одна вкладка с одной позицией → одна позиция', () => {
    const results: CalcResults = {
      main_wall: [
        { name: 'Вагонка', qty: 10, unit: 'шт', price: 100, cost: 1000 },
      ],
    };
    const merged = mergeResults(results);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ name: 'Вагонка', qty: 10, cost: 1000 });
  });

  it('два одинаковых материала на разных вкладках → объединяются (суммируется qty и cost)', () => {
    const results: CalcResults = {
      main_wall: [{ name: 'Саморез', qty: 50, unit: 'шт', price: 2, cost: 100 }],
      facade_wall: [{ name: 'Саморез', qty: 30, unit: 'шт', price: 2, cost: 60 }],
    };
    const merged = mergeResults(results);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ name: 'Саморез', qty: 80, cost: 160 });
  });

  it('одинаковое имя но разные единицы → НЕ сливаются', () => {
    const results: CalcResults = {
      main_wall: [{ name: 'Пена', qty: 1, unit: 'бут', price: 500, cost: 500 }],
      facade_wall: [{ name: 'Пена', qty: 2, unit: 'л', price: 100, cost: 200 }],
    };
    const merged = mergeResults(results);
    expect(merged).toHaveLength(2);
  });

  it('info-строки выводятся отдельно и в начале', () => {
    const results: CalcResults = {
      main_wall: [
        { name: 'Главная стена', qty: 0, unit: '', price: 0, cost: 0, isInfo: true },
        { name: 'Саморез', qty: 50, unit: 'шт', price: 2, cost: 100 },
      ],
      facade_wall: [
        { name: 'Фасадная стена', qty: 0, unit: '', price: 0, cost: 0, isInfo: true },
        { name: 'Саморез', qty: 30, unit: 'шт', price: 2, cost: 60 },
      ],
    };
    const merged = mergeResults(results);
    expect(merged[0].isInfo).toBe(true);
    expect(merged[1].isInfo).toBe(true);
    const nonInfo = merged.filter((it) => !it.isInfo);
    expect(nonInfo).toHaveLength(1);
    expect(nonInfo[0].qty).toBe(80);
  });

  it('сохраняет auto-флаг', () => {
    const results: CalcResults = {
      main_wall: [
        { name: 'Рейка', qty: 7, unit: 'шт', price: 100, cost: 700, auto: true },
      ],
    };
    const merged = mergeResults(results);
    expect(merged[0].auto).toBe(true);
  });

  it('сводная отсортирована по имени (localeCompare)', () => {
    const results: CalcResults = {
      main_wall: [
        { name: 'Саморез', qty: 10, unit: 'шт', price: 2, cost: 20 },
        { name: 'Антисептик', qty: 1, unit: 'л', price: 300, cost: 300 },
        { name: 'Гвоздь', qty: 100, unit: 'шт', price: 1, cost: 100 },
      ],
    };
    const merged = mergeResults(results);
    const names = merged.filter((it) => !it.isInfo).map((it) => it.name);
    expect(names).toEqual(['Антисептик', 'Гвоздь', 'Саморез']);
  });

  it('три экземпляра одного материала из трёх вкладок → один, qty=сумма', () => {
    const results: CalcResults = {
      main_wall: [{ name: 'Саморез', qty: 50, unit: 'шт', price: 2, cost: 100 }],
      facade_wall: [{ name: 'Саморез', qty: 30, unit: 'шт', price: 2, cost: 60 }],
      bl_wall: [{ name: 'Саморез', qty: 20, unit: 'шт', price: 2, cost: 40 }],
    };
    const merged = mergeResults(results);
    const screws = merged.find((it) => it.name === 'Саморез');
    expect(screws?.qty).toBe(100);
    expect(screws?.cost).toBe(200);
  });

  it('не мутирует исходный объект', () => {
    const orig = { name: 'Саморез', qty: 50, unit: 'шт', price: 2, cost: 100 };
    const results: CalcResults = { main_wall: [orig] };
    mergeResults(results);
    expect(orig.qty).toBe(50); // исходник не тронут
  });
});
