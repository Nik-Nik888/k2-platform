import { describe, it, expect } from 'vitest';
import {
  distributeEvenly, redistributeAround,
  bonesTotalWidth, segmentTotalWidth,
  sectionWidths, widthsToPositions, redistributeSections, evenImpostPositions,
  redistributeSectionsWithLocks,
  scaleSectionsToFit,
  BONE_PHYSICAL_WIDTH,
} from './distribute';
import { createEmptyFrame, createEmptySegment } from '../types';

// ═══════════════════════════════════════════════════════════════════
// distributeEvenly — равномерное распределение
// ═══════════════════════════════════════════════════════════════════

describe('distributeEvenly', () => {
  it('делит 6000 на 6 рам без костей по 1000', () => {
    expect(distributeEvenly(6, 6000, 0)).toEqual([1000, 1000, 1000, 1000, 1000, 1000]);
  });

  it('остаток отправляется в последнюю раму', () => {
    // 6001 / 6 = 1000.16, base=1000, остаток=1, последняя=1001
    expect(distributeEvenly(6, 6001, 0)).toEqual([1000, 1000, 1000, 1000, 1000, 1001]);
  });

  it('учитывает ширину костей', () => {
    // 4 рамы, 3 кости (60мм), общий 4060
    // На рамы остаётся 4000, по 1000 каждая
    expect(distributeEvenly(4, 4060, 60)).toEqual([1000, 1000, 1000, 1000]);
  });

  it('делит 3850 на 5 рам = по 770', () => {
    expect(distributeEvenly(5, 3850, 0)).toEqual([770, 770, 770, 770, 770]);
  });

  it('1283.33 → 1283 + 1283 + 1284 (остаток в последнюю)', () => {
    // 3850 / 3 = 1283.33, base=1283, остаток=1
    expect(distributeEvenly(3, 3850, 0)).toEqual([1283, 1283, 1284]);
    // Сумма должна точно совпасть
    const sum = 1283 + 1283 + 1284;
    expect(sum).toBe(3850);
  });

  it('возвращает null если ширина слишком мала', () => {
    // 3 рамы по min=300, надо хотя бы 900
    expect(distributeEvenly(3, 800, 0)).toBeNull();
  });

  it('возвращает null если рам 0', () => {
    expect(distributeEvenly(0, 6000, 0)).toBeNull();
  });

  it('сумма всегда равна newTotal − bones', () => {
    const cases: Array<[number, number, number]> = [
      [3, 5000, 0], [5, 4850, 0], [7, 6543, 40],
      [4, 3001, 60], [10, 12345, 180],
    ];
    for (const [n, total, bones] of cases) {
      const w = distributeEvenly(n, total, bones);
      expect(w).not.toBeNull();
      const sum = w!.reduce((s, v) => s + v, 0);
      expect(sum + bones).toBe(total);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// redistributeAround — фиксируем одну раму, перераспределяем остальные
// ═══════════════════════════════════════════════════════════════════

describe('redistributeAround', () => {
  it('фиксируем 1000 в раме 0 — остальные 5 распределяют 4850 - 1000 = 3850 по 770', () => {
    const frames = [
      createEmptyFrame(750, 1400),
      createEmptyFrame(750, 1400),
      createEmptyFrame(750, 1400),
      createEmptyFrame(750, 1400),
      createEmptyFrame(750, 1400),
      createEmptyFrame(750, 1400),
    ];
    // total = 6×750 = 4500, без костей
    const result = redistributeAround(frames, 0, 1000, 4500, 0);
    expect(result).toEqual([1000, 700, 700, 700, 700, 700]);
    // Сумма = 4500
    expect(result!.reduce((s, v) => s + v, 0)).toBe(4500);
  });

  it('сохраняет общую ширину', () => {
    const frames = [
      createEmptyFrame(750, 1400),
      createEmptyFrame(750, 1400),
      createEmptyFrame(750, 1400),
    ];
    const total = 2250;
    // Меняем середину на 900 → крайние пересчитываются
    const result = redistributeAround(frames, 1, 900, total, 0);
    expect(result).not.toBeNull();
    expect(result![1]).toBe(900); // фиксированная
    expect(result!.reduce((s, v) => s + v, 0)).toBe(total);
    expect(result![0]).toBe(result![2]); // равномерно
  });

  it('одна рама — становится равной полной ширине', () => {
    const frames = [createEmptyFrame(1500, 1400)];
    const result = redistributeAround(frames, 0, 2000, 1500, 0);
    // Сегмент остался 1500, поэтому игнорируем запрос и возвращаем 1500
    expect(result).toEqual([1500]);
  });

  it('возвращает null если запрошенная ширина не оставляет места другим', () => {
    const frames = [
      createEmptyFrame(750, 1400),
      createEmptyFrame(750, 1400),
      createEmptyFrame(750, 1400),
    ];
    const total = 2250;
    // Одна рама хочет 2000, остаётся 250 на 2 рамы — ниже min=300
    const result = redistributeAround(frames, 0, 2000, total, 0);
    expect(result).toBeNull();
  });

  it('остаток уходит в последнюю НЕ-фиксированную раму', () => {
    const frames = [
      createEmptyFrame(1000, 1400),
      createEmptyFrame(1000, 1400),
      createEmptyFrame(1000, 1400),
      createEmptyFrame(1000, 1400),
    ];
    // total = 4000, фиксируем idx=1 на 999
    // Остаётся 4000 - 999 = 3001 на 3 рамы
    // 3001 / 3 = 1000.33, base=1000, остаток=1 в последнюю не-фиксированную = idx=3
    const result = redistributeAround(frames, 1, 999, 4000, 0);
    expect(result).toEqual([1000, 999, 1000, 1001]);
  });

  it('учитывает ширину костей', () => {
    const frames = [
      createEmptyFrame(1000, 1400),
      createEmptyFrame(1000, 1400),
      createEmptyFrame(1000, 1400),
    ];
    // total = 3000 + 2 кости × 20 = 3040
    const result = redistributeAround(frames, 0, 1500, 3040, 40);
    // Бюджет на остальные = 3040 - 40 - 1500 = 1500 → по 750
    expect(result).toEqual([1500, 750, 750]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Хелперы
// ═══════════════════════════════════════════════════════════════════

describe('bonesTotalWidth', () => {
  it('сумма физических ширин костей', () => {
    const seg = createEmptySegment();
    expect(bonesTotalWidth(seg)).toBe(0);
    seg.bones.push({ id: 'b1', afterFrameIndex: 0 });
    seg.bones.push({ id: 'b2', afterFrameIndex: 1 });
    expect(bonesTotalWidth(seg)).toBe(2 * BONE_PHYSICAL_WIDTH);
  });
});

describe('segmentTotalWidth', () => {
  it('рамы + кости', () => {
    const seg = createEmptySegment();
    seg.frames = [createEmptyFrame(1000, 1400), createEmptyFrame(1500, 1400)];
    seg.bones.push({ id: 'b', afterFrameIndex: 0 });
    expect(segmentTotalWidth(seg)).toBe(1000 + 1500 + BONE_PHYSICAL_WIDTH);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Секции внутри рамы
// ═══════════════════════════════════════════════════════════════════

describe('sectionWidths', () => {
  it('пустой массив импостов = одна секция = вся рама', () => {
    expect(sectionWidths([], 'vertical', 3000)).toEqual([3000]);
  });

  it('1 вертикальный импост на 1500 → [1500, 1500]', () => {
    expect(sectionWidths(
      [{ id: 'i1', orientation: 'vertical', position: 1500 }],
      'vertical', 3000
    )).toEqual([1500, 1500]);
  });

  it('3 импоста на 750/1500/2250 → [750, 750, 750, 750]', () => {
    expect(sectionWidths([
      { id: 'i1', orientation: 'vertical', position: 750 },
      { id: 'i2', orientation: 'vertical', position: 1500 },
      { id: 'i3', orientation: 'vertical', position: 2250 },
    ], 'vertical', 3000)).toEqual([750, 750, 750, 750]);
  });

  it('импосты разной ориентации не смешиваются', () => {
    expect(sectionWidths([
      { id: 'i1', orientation: 'vertical', position: 1000 },
      { id: 'i2', orientation: 'horizontal', position: 700 },
    ], 'vertical', 3000)).toEqual([1000, 2000]);
    expect(sectionWidths([
      { id: 'i1', orientation: 'vertical', position: 1000 },
      { id: 'i2', orientation: 'horizontal', position: 700 },
    ], 'horizontal', 1400)).toEqual([700, 700]);
  });

  it('импосты сортируются по позиции', () => {
    expect(sectionWidths([
      { id: 'i2', orientation: 'vertical', position: 2250 },
      { id: 'i1', orientation: 'vertical', position: 750 },
    ], 'vertical', 3000)).toEqual([750, 1500, 750]);
  });
});

describe('widthsToPositions', () => {
  it('одна секция → [] (импостов нет)', () => {
    expect(widthsToPositions([3000])).toEqual([]);
  });

  it('[1500, 1500] → [1500]', () => {
    expect(widthsToPositions([1500, 1500])).toEqual([1500]);
  });

  it('[750, 750, 750, 750] → [750, 1500, 2250]', () => {
    expect(widthsToPositions([750, 750, 750, 750])).toEqual([750, 1500, 2250]);
  });
});

describe('redistributeSections', () => {
  it('фиксируем 1000 в секции 0 — остальные делят 2000 поровну', () => {
    expect(redistributeSections([750, 750, 750, 750], 0, 1000, 3000))
      .toEqual([1000, 666, 666, 668]); // остаток 2 в последнюю
  });

  it('фиксируем середину — крайние пересчитываются', () => {
    expect(redistributeSections([1000, 1000, 1000], 1, 1500, 3000))
      .toEqual([750, 1500, 750]);
  });

  it('сохраняет общий размер кадра', () => {
    const r = redistributeSections([500, 800, 700], 1, 1200, 2000);
    expect(r).not.toBeNull();
    expect(r!.reduce((s, v) => s + v, 0)).toBe(2000);
  });

  it('null если запрошенная секция не оставляет места', () => {
    // 2 секции по 200мм минимум, рама 1000, фиксированная = 700 → остаётся 300 на 1 секцию = ок
    expect(redistributeSections([500, 500], 0, 700, 1000)).toEqual([700, 300]);
    // А вот 850 уже не оставит места (150 < min=200)
    expect(redistributeSections([500, 500], 0, 850, 1000)).toBeNull();
  });

  it('одна секция — вся рама', () => {
    expect(redistributeSections([3000], 0, 5000, 3000)).toEqual([3000]);
  });
});

describe('redistributeSectionsWithLocks', () => {
  it('без закрепов работает как redistributeSections', () => {
    expect(redistributeSectionsWithLocks([750, 750, 750, 750], 0, 1000, [], 3000))
      .toEqual([1000, 666, 666, 668]);
  });

  it('закреплённая секция не меняется', () => {
    // 4 секции по 750. Закреплена #1 (=750). Меняем #0 на 1000.
    // Свободные: #2, #3. Им остаётся 3000 - 1000 - 750 = 1250 → по 625
    expect(redistributeSectionsWithLocks([750, 750, 750, 750], 0, 1000, [1], 3000))
      .toEqual([1000, 750, 625, 625]);
  });

  it('две закреплённые', () => {
    // Закреплены #1=800 и #2=900. Меняем #0 на 600.
    // Свободные: #3. Ей: 3000 - 600 - 800 - 900 = 700
    expect(redistributeSectionsWithLocks([700, 800, 900, 600], 0, 600, [1, 2], 3000))
      .toEqual([600, 800, 900, 700]);
  });

  it('меняемая секция не считается закреплённой даже если в lockedIndices', () => {
    // #0 закреплено, но мы как раз его меняем — должно сработать (lock игнорируется для меняемой)
    expect(redistributeSectionsWithLocks([750, 750, 750, 750], 0, 1000, [0, 1], 3000))
      .toEqual([1000, 750, 625, 625]);
  });

  it('null если все секции закреплены и сумма не сходится', () => {
    // Все закреплены: 1000 + 800 + 500 = 2300, меняем #3 на 800 → сумма 3100 ≠ 3000
    expect(redistributeSectionsWithLocks([1000, 800, 500, 700], 3, 800, [0, 1, 2], 3000))
      .toBeNull();
  });

  it('все закреплены и сумма сходится — возвращает массив', () => {
    // 1000 + 800 + 500 = 2300, меняем #3 на 700 → 3000 ✓
    expect(redistributeSectionsWithLocks([1000, 800, 500, 700], 3, 700, [0, 1, 2], 3000))
      .toEqual([1000, 800, 500, 700]);
  });

  it('null если свободных секций недостаточно для распределения', () => {
    // 3 секции, закреплено #1=2500. Меняем #0 на 200.
    // Свободно: #2, ему остаётся 3000 - 200 - 2500 = 300 < min*1 = 200 — ок
    expect(redistributeSectionsWithLocks([200, 2500, 300], 0, 200, [1], 3000))
      .toEqual([200, 2500, 300]);
    // А вот если поменяем #0 на 500 → свободному 0мм, < 200
    expect(redistributeSectionsWithLocks([200, 2500, 300], 0, 500, [1], 3000))
      .toBeNull();
  });
});

describe('evenImpostPositions', () => {
  it('1 импост в раме 3000 → [1500] (2 секции по 1500)', () => {
    expect(evenImpostPositions(1, 3000)).toEqual([1500]);
  });

  it('3 импоста в раме 3000 → [750, 1500, 2250]', () => {
    expect(evenImpostPositions(3, 3000)).toEqual([750, 1500, 2250]);
  });

  it('5 импостов в раме 3000 → секции по 500', () => {
    expect(evenImpostPositions(5, 3000)).toEqual([500, 1000, 1500, 2000, 2500]);
  });

  it('null если рама слишком мала для нужного количества', () => {
    // 3 импоста = 4 секции, в раме 600мм будет по 150 < min=200
    expect(evenImpostPositions(3, 600)).toBeNull();
  });

  it('count=0 → пустой массив', () => {
    expect(evenImpostPositions(0, 3000)).toEqual([]);
  });
});

describe('scaleSectionsToFit', () => {
  it('без закрепов — пропорциональное масштабирование', () => {
    // 3 секции по 500 = 1500, новый размер 3000 → каждая 1000
    expect(scaleSectionsToFit([500, 500, 500], [], 3000))
      .toEqual([1000, 1000, 1000]);
  });

  it('одна закреплённая секция остаётся как была', () => {
    // 4 секции по 500 = 2000, локнута #1=500, новый размер 3000.
    // Свободные #0,#2,#3 поглощают (3000-500)=2500 из старых (1500) → масштаб ~1.667
    // 500*1.667=833, 833, и последняя забирает остаток.
    const result = scaleSectionsToFit([500, 500, 500, 500], [1], 3000);
    expect(result).not.toBeNull();
    expect(result![1]).toBe(500); // закреплённая
    expect(result!.reduce((a, b) => a + b, 0)).toBe(3000); // сумма точно
  });

  it('сумма всегда равна newTotal', () => {
    const result = scaleSectionsToFit([700, 800, 900], [], 4000);
    expect(result!.reduce((a, b) => a + b, 0)).toBe(4000);
  });

  it('все секции закреплены — fallback пропорциональное масштабирование', () => {
    // Все закреплены по 500, рама была 1500, новая 3000 → fallback 2x
    const result = scaleSectionsToFit([500, 500, 500], [0, 1, 2], 3000);
    expect(result!.reduce((a, b) => a + b, 0)).toBe(3000);
    // Каждая ~1000
    expect(result![0]).toBe(1000);
    expect(result![1]).toBe(1000);
  });

  it('при сильном уменьшении свободные не помещаются — fallback пропорциональный', () => {
    // 4 секции по 500 = 2000, лок #0=500. Уменьшаем до 600.
    // Свободным остаётся 600-500=100 на 3 секции, < 200 минимум → fallback.
    // Все масштабируются 600/2000 = 0.3, секции по 150 каждая. Сумма 600.
    const result = scaleSectionsToFit([500, 500, 500, 500], [0], 600);
    expect(result!.reduce((a, b) => a + b, 0)).toBe(600);
  });

  it('null если newTotal <= 0', () => {
    expect(scaleSectionsToFit([500, 500], [], 0)).toBeNull();
    expect(scaleSectionsToFit([500, 500], [], -100)).toBeNull();
  });

  it('null если массив пустой', () => {
    expect(scaleSectionsToFit([], [], 1000)).toBeNull();
  });
});
