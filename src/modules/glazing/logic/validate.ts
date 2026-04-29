import {
  GOST_LIMITS,
  type GlazingProject, type Frame, type Cell, type Segment,
  type ValidationWarning,
} from '../types';
import { frameAreaM2, cellAreaM2 } from '../api/doGlazing';

// ═══════════════════════════════════════════════════════════════════
// Валидатор геометрии и конструктива.
//
// Возвращает массив предупреждений (warn) и ошибок (error)
// по нарушениям ГОСТ 23166-99 / 30674-99 и здравого смысла:
//
//   • размеры рамы превышают допустимые (макс 2670×2750 мм, площадь 6 м²)
//   • площадь активной (открывающейся) створки > 2.5 м²
//   • площадь глухой створки выше 1 этажа > 0.32 м² (только инфо)
//   • суммарная ширина сегмента > 3000 мм без кости (рекомендация)
//   • высота > 2500 мм — рекомендуется усиленная кость
//   • ячейка слишком узкая (<400мм) или слишком высокая аспект
//   • в раме нет ни одной открывающейся створки (предупреждение если рама >800×400)
//
// Это НЕ блокирующая валидация — менеджер может оставить нарушения
// (заказчик хочет именно так), но он будет видеть подсветку в UI.
// ═══════════════════════════════════════════════════════════════════

// ── Общая валидация проекта ───────────────────────────────────────

export function validateProject(project: GlazingProject): ValidationWarning[] {
  const out: ValidationWarning[] = [];

  for (const seg of project.segments) {
    out.push(...validateSegment(seg));
  }

  // Согласованность: число углов должно быть на 1 меньше числа сегментов
  if (project.segments.length > 1) {
    const expectedCorners = project.segments.length - 1;
    if (project.corners.length !== expectedCorners) {
      out.push({
        level: 'error',
        message:
          `Несоответствие: ${project.segments.length} сегментов, ` +
          `но ${project.corners.length} угловых соединителей ` +
          `(ожидается ${expectedCorners}).`,
      });
    }
  }

  return out;
}

// ── Валидация сегмента ────────────────────────────────────────────

export function validateSegment(seg: Segment): ValidationWarning[] {
  const out: ValidationWarning[] = [];

  // Скос крыши
  if (seg.heightLeft !== seg.heightRight) {
    const diff = Math.abs(seg.heightLeft - seg.heightRight);
    if (diff > 1500) {
      out.push({
        level: 'warn',
        targetId: seg.id,
        message:
          `Большой скос крыши: ${diff} мм разницы между левой и правой стороной. ` +
          `Проверьте замер.`,
      });
    }
  }

  // Суммарная ширина сегмента (с учётом всех рам)
  const totalWidth = seg.frames.reduce((s, f) => s + f.width, 0);
  const avgHeight = (seg.heightLeft + seg.heightRight) / 2;

  if (totalWidth > GOST_LIMITS.RECOMMEND_BONE_WIDTH_MM && seg.bones.length === 0) {
    out.push({
      level: 'warn',
      targetId: seg.id,
      message:
        `Ширина сегмента ${totalWidth} мм превышает ${GOST_LIMITS.RECOMMEND_BONE_WIDTH_MM} мм — ` +
        `рекомендуется добавить кость для жёсткости.`,
    });
  }

  if (avgHeight > GOST_LIMITS.RECOMMEND_HEAVY_BONE_HEIGHT_MM && seg.bones.length > 0) {
    out.push({
      level: 'warn',
      targetId: seg.id,
      message:
        `Высота ${Math.round(avgHeight)} мм > ${GOST_LIMITS.RECOMMEND_HEAVY_BONE_HEIGHT_MM} мм — ` +
        `используйте усиленную кость.`,
    });
  }

  // Согласованность костей: индексы должны быть валидными
  for (const bone of seg.bones) {
    if (bone.afterFrameIndex < 0 || bone.afterFrameIndex >= seg.frames.length - 1) {
      out.push({
        level: 'error',
        targetId: bone.id,
        message: `Кость указывает на несуществующую раму (индекс ${bone.afterFrameIndex}).`,
      });
    }
  }

  // Валидация каждой рамы
  for (const f of seg.frames) {
    out.push(...validateFrame(f));
  }

  return out;
}

// ── Валидация рамы ────────────────────────────────────────────────

export function validateFrame(frame: Frame): ValidationWarning[] {
  const out: ValidationWarning[] = [];

  // Габариты рамы по ГОСТ 23166-99
  if (frame.width > GOST_LIMITS.MAX_FRAME_WIDTH_MM) {
    out.push({
      level: 'error',
      targetId: frame.id,
      message:
        `Ширина рамы ${frame.width} мм превышает максимально допустимую ` +
        `${GOST_LIMITS.MAX_FRAME_WIDTH_MM} мм по ГОСТ 23166-99. ` +
        `Разделите на две рамы с костью между ними.`,
    });
  }
  if (frame.height > GOST_LIMITS.MAX_FRAME_HEIGHT_MM) {
    out.push({
      level: 'error',
      targetId: frame.id,
      message:
        `Высота рамы ${frame.height} мм превышает максимально допустимую ` +
        `${GOST_LIMITS.MAX_FRAME_HEIGHT_MM} мм по ГОСТ 23166-99.`,
    });
  }

  const area = frameAreaM2(frame);
  if (area > GOST_LIMITS.MAX_FRAME_AREA_M2) {
    out.push({
      level: 'error',
      targetId: frame.id,
      message:
        `Площадь рамы ${area.toFixed(2)} м² превышает ` +
        `${GOST_LIMITS.MAX_FRAME_AREA_M2} м² по ГОСТ 23166-99.`,
    });
  }

  // Очень маленькая рама — вероятно ошибка ввода
  if (frame.width < 200 || frame.height < 200) {
    out.push({
      level: 'warn',
      targetId: frame.id,
      message: `Очень маленькая рама ${frame.width}×${frame.height} мм. Проверьте размеры.`,
    });
  }

  // Импосты: позиция должна быть внутри рамы
  for (const imp of frame.imposts) {
    const limit = imp.orientation === 'vertical' ? frame.width : frame.height;
    if (imp.position <= 0 || imp.position >= limit) {
      out.push({
        level: 'error',
        targetId: imp.id,
        message:
          `Импост вне рамы: позиция ${imp.position} мм, ` +
          `${imp.orientation === 'vertical' ? 'ширина' : 'высота'} рамы ${limit} мм.`,
      });
    }
  }

  // Валидация ячеек
  for (const c of frame.cells) {
    out.push(...validateCell(c, frame));
  }

  // Если рама большая, но все ячейки неоткрывающиеся (глухие или сэндвич) — предупреждение
  // (по ГОСТ глухие выше 1 этажа допустимы только до 800×400)
  const totalArea = area;
  const allClosed = frame.cells.every((c) => c.sash === 'fixed' || c.sash === 'sandwich');
  if (allClosed && totalArea > 0.32) {
    out.push({
      level: 'warn',
      targetId: frame.id,
      message:
        `Все ячейки глухие, площадь ${area.toFixed(2)} м². ` +
        `Согласно ГОСТ 30674-99, выше 1-го этажа глухие конструкции допустимы только ` +
        `до ${GOST_LIMITS.MAX_DEAF_SASH_AREA_M2} м² (для мытья снаружи). ` +
        `Уточните этаж монтажа.`,
    });
  }

  return out;
}

// ── Валидация ячейки ──────────────────────────────────────────────

export function validateCell(cell: Cell, frame: Frame): ValidationWarning[] {
  const out: ValidationWarning[] = [];
  const area = cellAreaM2(cell);

  // Ячейка должна быть внутри рамы
  if (cell.x < 0 || cell.y < 0 ||
      cell.x + cell.width > frame.width + 0.5 ||
      cell.y + cell.height > frame.height + 0.5) {
    out.push({
      level: 'error',
      targetId: cell.id,
      message:
        `Ячейка выходит за пределы рамы: ` +
        `(${cell.x},${cell.y})+${cell.width}×${cell.height} ` +
        `при раме ${frame.width}×${frame.height}.`,
    });
  }

  // Активная створка (не глухая и не сэндвич) не должна быть слишком большой
  const isActiveSash = cell.sash !== 'fixed' && cell.sash !== 'sandwich';
  if (isActiveSash && area > GOST_LIMITS.MAX_SASH_AREA_M2) {
    out.push({
      level: 'warn',
      targetId: cell.id,
      message:
        `Открывающаяся створка ${cell.width}×${cell.height} мм (${area.toFixed(2)} м²) ` +
        `превышает рекомендуемые ${GOST_LIMITS.MAX_SASH_AREA_M2} м². ` +
        `Может провисать или плохо закрываться.`,
    });
  }

  // Слишком узкая активная створка
  if (isActiveSash && cell.width < 400) {
    out.push({
      level: 'warn',
      targetId: cell.id,
      message:
        `Открывающаяся створка шириной ${cell.width} мм. ` +
        `Минимальная рекомендуемая ширина — 400 мм.`,
    });
  }

  // Раздвижная створка слишком высокая (узкая) — некомфортно
  if ((cell.sash === 'sliding_left' || cell.sash === 'sliding_right')) {
    if (cell.height / cell.width > 4) {
      out.push({
        level: 'warn',
        targetId: cell.id,
        message: `Раздвижная створка имеет необычные пропорции (выс/шир > 4).`,
      });
    }
  }

  return out;
}

// ── Хелперы для UI ────────────────────────────────────────────────

export function hasErrors(warnings: ValidationWarning[]): boolean {
  return warnings.some((w) => w.level === 'error');
}

export function countErrors(warnings: ValidationWarning[]): number {
  return warnings.filter((w) => w.level === 'error').length;
}

export function countWarns(warnings: ValidationWarning[]): number {
  return warnings.filter((w) => w.level === 'warn').length;
}

/**
 * Группирует предупреждения по targetId для удобной подсветки в UI:
 *   const map = warningsByTarget(validateProject(p));
 *   const cellWarnings = map.get(cell.id) ?? [];
 */
export function warningsByTarget(
  warnings: ValidationWarning[]
): Map<string, ValidationWarning[]> {
  const map = new Map<string, ValidationWarning[]>();
  for (const w of warnings) {
    if (!w.targetId) continue;
    if (!map.has(w.targetId)) map.set(w.targetId, []);
    map.get(w.targetId)!.push(w);
  }
  return map;
}
