import type { Segment, Frame, Impost, ImpostOrientation } from '../types';

// ═══════════════════════════════════════════════════════════════════
// distributeWidths — пересчёт ширин рам в сегменте.
//
// Применяется в двух сценариях:
//
//   1. Пользователь меняет ОБЩУЮ ширину сегмента
//      → все рамы пересчитываются равномерно на новую ширину
//        (с учётом ширин костей, которые суммируются и вычитаются).
//
//   2. Пользователь меняет ширину ОДНОЙ рамы
//      → её ширина фиксируется, остальные рамы пересчитываются
//        равномерно на остаток. Общая ширина сегмента не меняется.
//
// Округление: целые миллиметры, остаток (≤ N мм, где N = число
// перераспределяемых рам - 1) добавляется к последней раме,
// чтобы сумма точно совпадала с заданной.
// ═══════════════════════════════════════════════════════════════════

// Логическая ширина кости в линейке X (для вычисления "ширины без костей").
// Это РЕАЛЬНАЯ толщина кости в мм (20мм по согласованию).
// На канвасе кость рисуется визуально шире (50мм) — это отдельная константа.
export const BONE_PHYSICAL_WIDTH = 20;

// ═══════════════════════════════════════════════════════════════════
// Хелперы
// ═══════════════════════════════════════════════════════════════════

/** Сумма ширин всех костей в сегменте (в реальных мм). */
export function bonesTotalWidth(segment: Segment): number {
  return segment.bones.length * BONE_PHYSICAL_WIDTH;
}

/** Текущая общая ширина сегмента (рамы + кости). */
export function segmentTotalWidth(segment: Segment): number {
  const framesSum = segment.frames.reduce((s, f) => s + f.width, 0);
  return framesSum + bonesTotalWidth(segment);
}

// ═══════════════════════════════════════════════════════════════════
// СЕКЦИИ ВНУТРИ РАМЫ (между импостами)
//
// Импосты делят раму на секции (1 импост = 2 секции, 2 импоста = 3 и т.д.).
// Менеджер думает в терминах СЕКЦИЙ, а не позиций импостов.
//
// Конвенция позиций:
//   • вертикальный импост: position = от ЛЕВОГО края рамы
//   • горизонтальный импост: position = от НИЖНЕГО края рамы
//
// Соответственно секции:
//   • для вертикальных импостов считаем секции по горизонтали (X)
//   • для горизонтальных — по вертикали (Y)
// ═══════════════════════════════════════════════════════════════════

/**
 * Достаёт ширины секций для заданной ориентации.
 * Например, рама 3000мм с вертикальными импостами на 750 и 1500
 * вернёт [750, 750, 1500] (секции 0-750, 750-1500, 1500-3000).
 */
export function sectionWidths(
  imposts: Impost[],
  orientation: ImpostOrientation,
  frameSize: number,
): number[] {
  const positions = imposts
    .filter((i) => i.orientation === orientation)
    .map((i) => i.position)
    .sort((a, b) => a - b);

  if (positions.length === 0) return [frameSize];

  const result: number[] = [];
  let prev = 0;
  for (const pos of positions) {
    result.push(pos - prev);
    prev = pos;
  }
  result.push(frameSize - prev);
  return result;
}

/**
 * Из массива ширин секций восстанавливает позиции импостов.
 * Например, [750, 750, 1500] → [750, 1500] (две позиции).
 */
export function widthsToPositions(widths: number[]): number[] {
  if (widths.length <= 1) return [];
  const positions: number[] = [];
  let cursor = 0;
  for (let i = 0; i < widths.length - 1; i++) {
    cursor += widths[i]!;
    positions.push(cursor);
  }
  return positions;
}

/**
 * Перераспределить секции внутри рамы при изменении одной секции.
 * Аналог redistributeAround, но работает с массивом ширин секций.
 *
 * Гарантия: сумма всех ширин = frameSize (общий размер не меняется).
 *
 * @returns null если запрошенная ширина не оставляет места другим секциям
 */
export function redistributeSections(
  currentWidths: number[],
  fixedSectionIdx: number,
  newSectionWidth: number,
  frameSize: number,
  min = 200, // минимальная секция, мм
): number[] | null {
  if (fixedSectionIdx < 0 || fixedSectionIdx >= currentWidths.length) return null;
  const others = currentWidths.length - 1;
  if (others === 0) {
    // Одна секция = вся рама
    return newSectionWidth === frameSize ? [newSectionWidth] : [frameSize];
  }
  const remaining = frameSize - newSectionWidth;
  if (remaining < min * others) return null;

  const base = Math.floor(remaining / others);
  const remainder = remaining - base * others;

  const result: number[] = [];
  let lastNonFixedIdx = -1;
  for (let i = 0; i < currentWidths.length; i++) {
    if (i === fixedSectionIdx) {
      result.push(newSectionWidth);
    } else {
      result.push(base);
      lastNonFixedIdx = i;
    }
  }
  if (remainder > 0 && lastNonFixedIdx >= 0) {
    result[lastNonFixedIdx]! += remainder;
  }
  return result;
}

/**
 * То же что redistributeSections, но с поддержкой ЗАКРЕПЛЁННЫХ секций.
 *
 * Логика:
 *   • меняющаяся секция (fixedSectionIdx) получает newSectionWidth
 *   • все секции из lockedIndices сохраняют свою ширину
 *   • остальные секции (не изменяемая, не закреплённые) делят остаток поровну
 *
 * Возвращает null если:
 *   • все секции «зафиксированы» (закреплены или меняемая) и их сумма ≠ frameSize
 *   • остатка не хватает на минимум 200мм для каждой свободной секции
 */
export function redistributeSectionsWithLocks(
  currentWidths: number[],
  fixedSectionIdx: number,
  newSectionWidth: number,
  lockedIndices: number[],
  frameSize: number,
  min = 200,
): number[] | null {
  if (fixedSectionIdx < 0 || fixedSectionIdx >= currentWidths.length) return null;

  // Считаем суммы
  // 1. Меняющаяся секция: newSectionWidth (известен)
  // 2. Закреплённые (которые НЕ совпадают с меняющейся): сумма их текущих ширин
  // 3. Свободные: всё остальное, надо распределить
  const lockedSet = new Set(lockedIndices);
  // Меняющаяся секция исключается из закреплённых — её мы и фиксируем
  lockedSet.delete(fixedSectionIdx);

  let lockedSum = 0;
  for (const idx of lockedSet) {
    if (idx >= 0 && idx < currentWidths.length) {
      lockedSum += currentWidths[idx]!;
    }
  }

  const freeBudget = frameSize - newSectionWidth - lockedSum;
  const freeIndices: number[] = [];
  for (let i = 0; i < currentWidths.length; i++) {
    if (i !== fixedSectionIdx && !lockedSet.has(i)) {
      freeIndices.push(i);
    }
  }

  // Если все секции «зафиксированы» — нужно проверить, сходится ли сумма
  if (freeIndices.length === 0) {
    return Math.abs(freeBudget) < 0.5 ? buildResult() : null;
  }

  if (freeBudget < min * freeIndices.length) return null;

  const base = Math.floor(freeBudget / freeIndices.length);
  const remainder = freeBudget - base * freeIndices.length;

  return buildResult();

  function buildResult(): number[] {
    const result: number[] = [];
    let lastFreeIdx = freeIndices[freeIndices.length - 1] ?? -1;

    for (let i = 0; i < currentWidths.length; i++) {
      if (i === fixedSectionIdx) {
        result.push(newSectionWidth);
      } else if (lockedSet.has(i)) {
        result.push(currentWidths[i]!);
      } else {
        // Свободная секция — base, остаток уйдёт в последнюю свободную
        if (i === lastFreeIdx) {
          result.push(base + remainder);
        } else {
          result.push(base);
        }
      }
    }
    return result;
  }
}
export function evenImpostPositions(
  count: number,
  frameSize: number,
  min = 200,
): number[] | null {
  if (count <= 0) return [];
  // count импостов = count+1 секция, размером frameSize/(count+1)
  const sectionSize = Math.floor(frameSize / (count + 1));
  if (sectionSize < min) return null;

  const positions: number[] = [];
  for (let i = 1; i <= count; i++) {
    positions.push(sectionSize * i);
  }
  return positions;
}

// ═══════════════════════════════════════════════════════════════════
// 1. Распределить НОВУЮ общую ширину равномерно по всем рамам
// ═══════════════════════════════════════════════════════════════════

/**
 * Возвращает массив новых ширин рам, чтобы сумма + кости = newTotal.
 *
 * @param framesCount - сколько рам в сегменте
 * @param newTotal - новая общая ширина сегмента (мм)
 * @param bonesWidth - суммарная ширина костей (мм)
 * @param min - минимальная допустимая ширина рамы (по умолчанию 300)
 * @returns массив целых ширин длиной framesCount; null если невозможно
 */
export function distributeEvenly(
  framesCount: number,
  newTotal: number,
  bonesWidth: number,
  min = 300,
): number[] | null {
  if (framesCount <= 0) return null;
  const framesBudget = newTotal - bonesWidth;
  if (framesBudget < min * framesCount) return null;

  const base = Math.floor(framesBudget / framesCount);
  const remainder = framesBudget - base * framesCount;

  const widths: number[] = [];
  for (let i = 0; i < framesCount; i++) widths.push(base);
  // Остаток (0..framesCount-1 мм) добавляем в ПОСЛЕДНЮЮ раму
  if (remainder > 0) widths[widths.length - 1]! += remainder;
  return widths;
}

// ═══════════════════════════════════════════════════════════════════
// 2. Распределить остаток между ВСЕМИ рамами кроме одной фиксированной
// ═══════════════════════════════════════════════════════════════════

/**
 * Когда пользователь поменял ширину одной рамы — остальные рамы
 * перераспределяются равномерно так, чтобы сохранить ИСХОДНУЮ
 * общую ширину сегмента.
 *
 * @param frames - массив рам сегмента (как сейчас в модели)
 * @param fixedFrameIdx - индекс рамы, ширину которой пользователь только что задал
 * @param newFixedWidth - новая ширина зафиксированной рамы
 * @param totalWidth - текущая общая ширина сегмента (которую сохраняем)
 * @param bonesWidth - суммарная ширина костей
 * @param min - минимальная ширина рамы
 * @returns массив новых ширин (включая зафиксированную) длиной frames.length;
 *          null если невозможно вписаться (запрошенная ширина слишком большая)
 */
export function redistributeAround(
  frames: Frame[],
  fixedFrameIdx: number,
  newFixedWidth: number,
  totalWidth: number,
  bonesWidth: number,
  min = 300,
): number[] | null {
  if (fixedFrameIdx < 0 || fixedFrameIdx >= frames.length) return null;
  const others = frames.length - 1;

  // Если рам всего одна — она же общий размер
  if (others === 0) {
    const expected = totalWidth - bonesWidth;
    return newFixedWidth === expected ? [newFixedWidth] : [expected];
  }

  const remainingBudget = totalWidth - bonesWidth - newFixedWidth;
  if (remainingBudget < min * others) return null;

  const base = Math.floor(remainingBudget / others);
  const remainder = remainingBudget - base * others;

  const result: number[] = [];
  let lastNonFixedIdx = -1;
  for (let i = 0; i < frames.length; i++) {
    if (i === fixedFrameIdx) {
      result.push(newFixedWidth);
    } else {
      result.push(base);
      lastNonFixedIdx = i;
    }
  }
  // Остаток в последнюю НЕ-фиксированную раму
  if (remainder > 0 && lastNonFixedIdx >= 0) {
    result[lastNonFixedIdx]! += remainder;
  }

  return result;
}

/**
 * Подогнать секции под новый размер рамы (вызывается при изменении ширины/высоты рамы).
 *
 * Логика:
 *   • Закреплённые секции (lockedIndices) сохраняют свою прежнюю ширину
 *   • Незакреплённые секции масштабируются пропорционально, чтобы
 *     общая сумма получилась = newTotal
 *
 * Случаи:
 *   • Незакреплённых секций > 0:
 *       Сумма закреплённых = locked.
 *       Свободным надо раздать (newTotal - locked).
 *       Если этого хватает (>= min на секцию) — масштабируем пропорционально.
 *       Если не хватает — fallback: масштабируем ВСЕ секции пропорционально
 *       (включая закреплённые), чтобы заполнить раму.
 *   • Все секции закреплены:
 *       Fallback: масштабируем все пропорционально (закрепы становятся неактуальны
 *       — ширина рамы изменилась, "ручные" значения уже не влезают).
 *
 * Возвращает массив новых ширин или null если ничего сделать нельзя
 * (например, newTotal <= 0).
 */
export function scaleSectionsToFit(
  oldWidths: number[],
  lockedIndices: number[],
  newTotal: number,
  min = 200,
): number[] | null {
  if (oldWidths.length === 0) return null;
  if (newTotal <= 0) return null;

  const lockedSet = new Set(lockedIndices.filter((i) => i >= 0 && i < oldWidths.length));
  const lockedSum = oldWidths.reduce((acc, w, i) => lockedSet.has(i) ? acc + w : acc, 0);
  const freeIndices: number[] = [];
  let freeSumOld = 0;
  for (let i = 0; i < oldWidths.length; i++) {
    if (!lockedSet.has(i)) {
      freeIndices.push(i);
      freeSumOld += oldWidths[i]!;
    }
  }

  // Случай 1: Все секции закреплены или незакреплённым не хватит места —
  // делаем пропорциональное масштабирование ВСЕХ секций
  const freeBudget = newTotal - lockedSum;
  const allLocked = freeIndices.length === 0;
  const notEnoughForFree = !allLocked && freeBudget < min * freeIndices.length;

  if (allLocked || notEnoughForFree) {
    const totalOld = oldWidths.reduce((a, b) => a + b, 0);
    if (totalOld <= 0) return null;
    const scale = newTotal / totalOld;
    const result = oldWidths.map((w) => Math.round(w * scale));
    // Корректируем накопленную ошибку округления — добавляем разницу в последнюю секцию
    const sum = result.reduce((a, b) => a + b, 0);
    if (result.length > 0) {
      result[result.length - 1] = result[result.length - 1]! + (newTotal - sum);
    }
    return result;
  }

  // Случай 2: Свободные секции пропорционально поглощают изменение
  if (freeSumOld <= 0) {
    // Все свободные были по 0мм — делим budget поровну
    const each = Math.floor(freeBudget / freeIndices.length);
    const rem = freeBudget - each * freeIndices.length;
    const result: number[] = [];
    for (let i = 0; i < oldWidths.length; i++) {
      if (lockedSet.has(i)) {
        result.push(oldWidths[i]!);
      } else {
        const isLastFree = i === freeIndices[freeIndices.length - 1];
        result.push(isLastFree ? each + rem : each);
      }
    }
    return result;
  }

  const scale = freeBudget / freeSumOld;
  const result: number[] = [];
  let lastFreeIdx = freeIndices[freeIndices.length - 1] ?? -1;
  let runningFreeSum = 0;
  for (let i = 0; i < oldWidths.length; i++) {
    if (lockedSet.has(i)) {
      result.push(oldWidths[i]!);
    } else if (i === lastFreeIdx) {
      // Последняя свободная — забирает остаток (защита от ошибок округления)
      result.push(freeBudget - runningFreeSum);
    } else {
      const w = Math.round(oldWidths[i]! * scale);
      result.push(w);
      runningFreeSum += w;
    }
  }
  return result;
}
