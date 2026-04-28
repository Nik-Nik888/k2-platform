import { describe, it, expect } from 'vitest';
import {
  validateProject, validateFrame, validateCell, validateSegment,
  hasErrors, countErrors, countWarns, warningsByTarget,
} from './validate';
import {
  createEmptyProject, createEmptyFrame, createEmptySegment,
  GOST_LIMITS,
  type Cell,
} from '../types';

// ═══════════════════════════════════════════════════════════════════
// validateFrame
// ═══════════════════════════════════════════════════════════════════

describe('validateFrame — габариты', () => {
  it('нормальная рама 1500×1400 со створкой — без замечаний', () => {
    const f = createEmptyFrame(1500, 1400);
    f.cells[0]!.sash = 'turn_left';
    expect(validateFrame(f)).toEqual([]);
  });

  it('ширина больше ГОСТ — error', () => {
    const f = createEmptyFrame(GOST_LIMITS.MAX_FRAME_WIDTH_MM + 100, 1400);
    const w = validateFrame(f);
    const errs = w.filter((x) => x.level === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]?.message).toMatch(/ширина/i);
  });

  it('высота больше ГОСТ — error', () => {
    const f = createEmptyFrame(1500, GOST_LIMITS.MAX_FRAME_HEIGHT_MM + 100);
    const errs = validateFrame(f).filter((x) => x.level === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]?.message).toMatch(/высота/i);
  });

  it('площадь больше ГОСТ — error (даже если стороны в норме)', () => {
    // 2500 × 2500 = 6.25 м² > 6.0
    const f = createEmptyFrame(2500, 2500);
    const errs = validateFrame(f).filter((x) => x.level === 'error');
    expect(errs.some((e) => /площадь/i.test(e.message))).toBe(true);
  });

  it('маленькая рама — warn', () => {
    const f = createEmptyFrame(100, 100);
    const warns = validateFrame(f).filter((x) => x.level === 'warn');
    expect(warns.length).toBeGreaterThan(0);
  });
});

describe('validateFrame — глухие конструкции', () => {
  it('большая полностью глухая рама — warn про этаж', () => {
    const f = createEmptyFrame(1500, 1400);
    // Все ячейки fixed по умолчанию
    const w = validateFrame(f);
    expect(w.some((x) => /этаж|глухие/i.test(x.message))).toBe(true);
  });

  it('маленькая глухая (≤0.32м²) — без замечания про этаж', () => {
    const f = createEmptyFrame(800, 400);
    const w = validateFrame(f);
    expect(w.some((x) => /этаж/i.test(x.message))).toBe(false);
  });

  it('рама с открывающейся створкой — без замечания про этаж', () => {
    const f = createEmptyFrame(1500, 1400);
    f.cells[0]!.sash = 'turn_left';
    const w = validateFrame(f);
    expect(w.some((x) => /этаж/i.test(x.message))).toBe(false);
  });
});

describe('validateFrame — импосты', () => {
  it('импост вне рамы — error', () => {
    const f = createEmptyFrame(1500, 1400);
    f.imposts.push({ id: 'i1', orientation: 'vertical', position: 2000 });
    const errs = validateFrame(f).filter((x) => x.level === 'error');
    expect(errs.some((e) => /импост вне рамы/i.test(e.message))).toBe(true);
  });

  it('импост на нулевой позиции — error', () => {
    const f = createEmptyFrame(1500, 1400);
    f.imposts.push({ id: 'i1', orientation: 'horizontal', position: 0 });
    const errs = validateFrame(f).filter((x) => x.level === 'error');
    expect(errs.some((e) => /импост вне рамы/i.test(e.message))).toBe(true);
  });

  it('импост на правильной позиции — ок', () => {
    const f = createEmptyFrame(1500, 1400);
    f.imposts.push({ id: 'i1', orientation: 'vertical', position: 750 });
    const errs = validateFrame(f).filter((x) => x.level === 'error');
    expect(errs.filter((e) => /импост/i.test(e.message))).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// validateCell
// ═══════════════════════════════════════════════════════════════════

describe('validateCell — створки', () => {
  it('активная створка >2.5 м² — warn', () => {
    const f = createEmptyFrame(2000, 1500); // 3 м²
    const cell: Cell = { id: 'c', x: 0, y: 0, width: 2000, height: 1500, sash: 'turn_left' };
    const w = validateCell(cell, f);
    expect(w.some((x) => /превышает рекомендуемые/i.test(x.message))).toBe(true);
  });

  it('глухая 3 м² — без замечания про створку', () => {
    const f = createEmptyFrame(2000, 1500);
    const cell: Cell = { id: 'c', x: 0, y: 0, width: 2000, height: 1500, sash: 'fixed' };
    const w = validateCell(cell, f);
    expect(w.some((x) => /превышает рекомендуемые/i.test(x.message))).toBe(false);
  });

  it('узкая створка <400мм — warn', () => {
    const f = createEmptyFrame(1500, 1400);
    const cell: Cell = { id: 'c', x: 0, y: 0, width: 350, height: 1400, sash: 'turn_left' };
    const w = validateCell(cell, f);
    expect(w.some((x) => /Минимальная.*ширина/i.test(x.message))).toBe(true);
  });

  it('ячейка вне рамы — error', () => {
    const f = createEmptyFrame(1500, 1400);
    const cell: Cell = { id: 'c', x: 0, y: 0, width: 1800, height: 1400, sash: 'fixed' };
    const w = validateCell(cell, f);
    expect(w.some((x) => x.level === 'error' && /выходит за пределы/i.test(x.message))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// validateSegment
// ═══════════════════════════════════════════════════════════════════

describe('validateSegment', () => {
  it('сегмент с шириной >3000мм без кости — warn', () => {
    const seg = createEmptySegment(1400);
    seg.frames = [createEmptyFrame(2000, 1400), createEmptyFrame(2000, 1400)];
    // Нет костей
    const w = validateSegment(seg);
    expect(w.some((x) => /рекомендуется добавить кость/i.test(x.message))).toBe(true);
  });

  it('сегмент с шириной >3000мм С костью — без warn про кость', () => {
    const seg = createEmptySegment(1400);
    seg.frames = [createEmptyFrame(2000, 1400), createEmptyFrame(2000, 1400)];
    seg.bones.push({ id: 'b', afterFrameIndex: 0 });
    const w = validateSegment(seg);
    expect(w.some((x) => /рекомендуется добавить кость/i.test(x.message))).toBe(false);
  });

  it('высокий сегмент (2700мм) с костью — рекомендация усиленной', () => {
    const seg = createEmptySegment(2700);
    seg.frames = [createEmptyFrame(1500, 2700), createEmptyFrame(1500, 2700)];
    seg.bones.push({ id: 'b', afterFrameIndex: 0 });
    const w = validateSegment(seg);
    expect(w.some((x) => /усиленную/i.test(x.message))).toBe(true);
  });

  it('кость с битым индексом — error', () => {
    const seg = createEmptySegment(1400);
    seg.frames = [createEmptyFrame(1500, 1400), createEmptyFrame(1500, 1400)];
    seg.bones.push({ id: 'b', afterFrameIndex: 99 });
    const errs = validateSegment(seg).filter((x) => x.level === 'error');
    expect(errs.some((e) => /несуществующую/i.test(e.message))).toBe(true);
  });

  it('сильный скос крыши (>1500мм) — warn', () => {
    const seg = createEmptySegment(1400);
    seg.heightLeft = 2000;
    seg.heightRight = 200;
    const w = validateSegment(seg);
    expect(w.some((x) => /скос крыши/i.test(x.message))).toBe(true);
  });

  it('небольшой скос (<1500мм) — без warn', () => {
    const seg = createEmptySegment(1400);
    seg.heightLeft = 1500;
    seg.heightRight = 1300;
    const w = validateSegment(seg);
    expect(w.some((x) => /скос крыши/i.test(x.message))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// validateProject — общая согласованность
// ═══════════════════════════════════════════════════════════════════

describe('validateProject', () => {
  it('пустой проект (1 пустой сегмент) — нет ошибок', () => {
    const p = createEmptyProject();
    const errs = validateProject(p).filter((x) => x.level === 'error');
    expect(errs).toEqual([]);
  });

  it('2 сегмента, 0 углов — error про несоответствие', () => {
    const p = createEmptyProject();
    p.segments.push(createEmptySegment());
    // corners остаётся пустым
    const errs = validateProject(p).filter((x) => x.level === 'error');
    expect(errs.some((e) => /Несоответствие/i.test(e.message))).toBe(true);
  });

  it('2 сегмента, 1 угол — нет ошибки про несоответствие', () => {
    const p = createEmptyProject();
    p.segments.push(createEmptySegment());
    p.corners.push({ id: 'c', type: 'h_90' });
    const errs = validateProject(p).filter((x) => x.level === 'error');
    expect(errs.some((e) => /Несоответствие/i.test(e.message))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Хелперы UI
// ═══════════════════════════════════════════════════════════════════

describe('хелперы', () => {
  const sampleWarnings = [
    { level: 'error' as const, message: 'e1', targetId: 'a' },
    { level: 'error' as const, message: 'e2', targetId: 'b' },
    { level: 'warn' as const,  message: 'w1', targetId: 'a' },
  ];

  it('hasErrors / countErrors / countWarns', () => {
    expect(hasErrors(sampleWarnings)).toBe(true);
    expect(countErrors(sampleWarnings)).toBe(2);
    expect(countWarns(sampleWarnings)).toBe(1);
    expect(hasErrors([])).toBe(false);
  });

  it('warningsByTarget группирует по targetId', () => {
    const map = warningsByTarget(sampleWarnings);
    expect(map.get('a')).toHaveLength(2);
    expect(map.get('b')).toHaveLength(1);
    expect(map.get('c')).toBeUndefined();
  });

  it('warningsByTarget игнорирует элементы без targetId', () => {
    const map = warningsByTarget([
      { level: 'warn', message: 'global' }, // нет targetId
      { level: 'warn', message: 'local', targetId: 'x' },
    ]);
    expect(map.size).toBe(1);
    expect(map.get('x')).toHaveLength(1);
  });
});
