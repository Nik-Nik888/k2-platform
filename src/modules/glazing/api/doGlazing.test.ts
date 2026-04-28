import { describe, it, expect } from 'vitest';
import {
  calcProject, calcAll, frameAreaM2, cellAreaM2,
  projectAreaM2, projectOpeningSashesCount, projectBonesCount,
  type CalcMaterial, type MaterialMap,
} from './doGlazing';
import {
  createEmptyProject, createEmptyFrame,
  type GlazingProject,
} from '../types';

// ═══════════════════════════════════════════════════════════════════
// Тестовый справочник материалов
// ═══════════════════════════════════════════════════════════════════

const MATS: CalcMaterial[] = [
  { id: 'profile-rehau',     name: 'REHAU Blitz',       unit: 'м²',     price: 3200 },
  { id: 'glass-1',           name: 'Однокамерный 4-16-4', unit: 'м²',   price: 1200 },
  { id: 'glass-2',           name: 'Двухкамерный',      unit: 'м²',     price: 1800 },
  { id: 'hardware-1',        name: 'Фурнитура белая',   unit: 'компл.', price: 2500 },
  { id: 'lam-in-oak',        name: 'Ламинация дуб внутр.', unit: 'м²',  price: 450 },
  { id: 'sill-300',          name: 'Подоконник 300',    unit: 'п.м.',   price: 520 },
  { id: 'ebb-200',           name: 'Отлив 200',         unit: 'п.м.',   price: 280 },
  { id: 'mosquito-white',    name: 'Сетка белая',       unit: 'шт.',    price: 1200 },
  { id: 'bone-std',          name: 'Кость стандарт',    unit: 'шт.',    price: 1800 },
  { id: 'corner-90',         name: 'Соединитель 90°',   unit: 'п.м.',   price: 450 },
  { id: 'work-install',      name: 'Монтаж окна',       unit: 'м²',     price: 800 },
  { id: 'work-demont',       name: 'Демонтаж',          unit: 'шт.',    price: 1500 },
  { id: 'misc-foam',         name: 'Пена монтажная',    unit: 'шт.',    price: 450 },
];

const matMap: MaterialMap = new Map(MATS.map((m) => [m.id, m]));

// ═══════════════════════════════════════════════════════════════════
// Хелпер: создать стандартный проект «прямой балкон 3000×1400»
// ═══════════════════════════════════════════════════════════════════

function standardProject(): GlazingProject {
  const p = createEmptyProject('Тест балкон');
  p.config.profileSystemId = 'profile-rehau';
  p.config.glassId = 'glass-1';
  p.config.hardwareId = 'hardware-1';
  // Меняем дефолтную раму на 3000×1400
  const seg = p.segments[0]!;
  seg.frames[0] = createEmptyFrame(3000, 1400);
  seg.heightLeft = 1400;
  seg.heightRight = 1400;
  return p;
}

// ═══════════════════════════════════════════════════════════════════
// Геометрические утилиты
// ═══════════════════════════════════════════════════════════════════

describe('frameAreaM2', () => {
  it('переводит мм² в м²', () => {
    const f = createEmptyFrame(2000, 1500);
    expect(frameAreaM2(f)).toBe(3); // 2000×1500мм = 3 м²
  });

  it('1м × 1м = 1 м²', () => {
    expect(frameAreaM2(createEmptyFrame(1000, 1000))).toBe(1);
  });
});

describe('cellAreaM2', () => {
  it('считает площадь ячейки', () => {
    const cell = { id: 'x', x: 0, y: 0, width: 800, height: 1400, sash: 'fixed' as const };
    expect(cellAreaM2(cell)).toBeCloseTo(1.12, 5);
  });
});

describe('projectAreaM2', () => {
  it('сумма площадей всех рам всех сегментов', () => {
    const p = standardProject();
    // Одна рама 3000×1400 = 4.2 м²
    expect(projectAreaM2(p)).toBe(4.2);

    // Добавим вторую раму 1500×1400 = 2.1 м²
    p.segments[0]!.frames.push(createEmptyFrame(1500, 1400));
    expect(projectAreaM2(p)).toBeCloseTo(6.3, 5);
  });

  it('пустой проект = 0', () => {
    const p = createEmptyProject();
    p.segments = [];
    expect(projectAreaM2(p)).toBe(0);
  });
});

describe('projectOpeningSashesCount', () => {
  it('считает только не-fixed ячейки', () => {
    const p = standardProject();
    const f = p.segments[0]!.frames[0]!;
    f.cells = [
      { id: 'a', x: 0, y: 0, width: 1000, height: 1400, sash: 'fixed' },
      { id: 'b', x: 1000, y: 0, width: 1000, height: 1400, sash: 'turn_left' },
      { id: 'c', x: 2000, y: 0, width: 1000, height: 1400, sash: 'tilt_turn_right' },
    ];
    expect(projectOpeningSashesCount(p)).toBe(2);
  });
});

describe('projectBonesCount', () => {
  it('сумма костей по всем сегментам', () => {
    const p = standardProject();
    p.segments[0]!.bones.push({ id: 'b1', afterFrameIndex: 0 });
    p.segments[0]!.bones.push({ id: 'b2', afterFrameIndex: 1 });
    expect(projectBonesCount(p)).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// calcProject — основной расчётчик
// ═══════════════════════════════════════════════════════════════════

describe('calcProject — базовый расчёт', () => {
  it('считает профиль + стекло для прямого балкона без створок', () => {
    const p = standardProject();
    const est = calcProject(p, matMap);

    // Площадь = 3000×1400 = 4.2 м²
    // REHAU: 4.2 × 3200 = 13440
    // Стекло: 4.2 × 1200 = 5040
    // Итого: 18480, фурнитуры нет (все ячейки fixed)
    const profileLine = est.lines.find((l) => l.scope === 'profile');
    expect(profileLine?.quantity).toBe(4.2);
    expect(profileLine?.total).toBe(13440);

    const glassLine = est.lines.find((l) => l.scope === 'glass');
    expect(glassLine?.total).toBe(5040);

    const hardwareLine = est.lines.find((l) => l.scope === 'hardware');
    expect(hardwareLine).toBeUndefined();

    expect(est.subtotal).toBe(18480);
    expect(est.total).toBe(18480);
    expect(est.discountAmount).toBe(0);
    expect(est.isCustomPrice).toBe(false);
  });

  it('добавляет фурнитуру за каждую открывающуюся створку', () => {
    const p = standardProject();
    p.segments[0]!.frames[0]!.cells = [
      { id: 'a', x: 0, y: 0, width: 1500, height: 1400, sash: 'fixed' },
      { id: 'b', x: 1500, y: 0, width: 1500, height: 1400, sash: 'turn_left' },
    ];
    const est = calcProject(p, matMap);

    const hw = est.lines.find((l) => l.scope === 'hardware');
    expect(hw?.quantity).toBe(1); // одна открывающаяся створка
    expect(hw?.total).toBe(2500);

    expect(est.subtotal).toBe(13440 + 5040 + 2500); // = 20980
  });

  it('профиль и стекло не учитываются если materialId не задан', () => {
    const p = standardProject();
    p.config.profileSystemId = null;
    p.config.glassId = null;
    const est = calcProject(p, matMap);
    expect(est.lines).toEqual([]);
    expect(est.total).toBe(0);
  });
});

describe('calcProject — несколько рам и сегментов', () => {
  it('группирует рамы с одинаковым профилем в одну строку', () => {
    const p = standardProject();
    // Добавляем вторую раму 1500×1400 = 2.1 м²
    p.segments[0]!.frames.push(createEmptyFrame(1500, 1400));
    const est = calcProject(p, matMap);

    const profileLines = est.lines.filter((l) => l.scope === 'profile');
    expect(profileLines).toHaveLength(1);
    expect(profileLines[0]?.quantity).toBe(6.3); // 4.2 + 2.1
    expect(profileLines[0]?.total).toBe(6.3 * 3200);
  });

  it('override на раме создаёт отдельную группу', () => {
    const p = standardProject();
    const seg = p.segments[0]!;
    // Вторая рама с другим стеклом (двухкамерный)
    const f2 = createEmptyFrame(1500, 1400);
    f2.override = { glassId: 'glass-2' };
    seg.frames.push(f2);

    const est = calcProject(p, matMap);
    const glassLines = est.lines.filter((l) => l.scope === 'glass');
    expect(glassLines).toHaveLength(2);

    const g1 = glassLines.find((l) => l.materialId === 'glass-1');
    const g2 = glassLines.find((l) => l.materialId === 'glass-2');
    expect(g1?.quantity).toBe(4.2);
    expect(g2?.quantity).toBe(2.1);
  });

  it('Г-образный балкон: считает угловой соединитель', () => {
    const p = standardProject();
    // Добавляем второй сегмент 1200×1400
    const seg2 = {
      id: 'seg2',
      heightLeft: 1400,
      heightRight: 1400,
      frames: [createEmptyFrame(1200, 1400)],
      bones: [],
    };
    p.segments.push(seg2);
    p.corners.push({ id: 'c1', type: 'h_90', materialId: 'corner-90' });

    const est = calcProject(p, matMap);
    const cornerLine = est.lines.find((l) => l.scope === 'connector');
    expect(cornerLine).toBeDefined();
    // Длина = средняя высота между сегментами = 1400 / 1000 = 1.4 м
    expect(cornerLine?.quantity).toBe(1.4);
    expect(cornerLine?.total).toBe(1.4 * 450);
  });
});

describe('calcProject — кости, подоконники, работы', () => {
  it('кости группируются по materialId', () => {
    const p = standardProject();
    p.segments[0]!.bones.push({ id: 'b1', afterFrameIndex: 0, materialId: 'bone-std' });
    p.segments[0]!.bones.push({ id: 'b2', afterFrameIndex: 1, materialId: 'bone-std' });

    const est = calcProject(p, matMap);
    const bones = est.lines.filter((l) => l.scope === 'bone');
    expect(bones).toHaveLength(1);
    expect(bones[0]?.quantity).toBe(2);
    expect(bones[0]?.total).toBe(3600);
  });

  it('подоконники, отливы, москитки берутся из конфига', () => {
    const p = standardProject();
    p.config.sills = [{ materialId: 'sill-300', length: 3 }];
    p.config.ebbs = [{ materialId: 'ebb-200', length: 3 }];
    p.config.mosquitos = [{ materialId: 'mosquito-white', quantity: 2 }];

    const est = calcProject(p, matMap);
    expect(est.lines.find((l) => l.scope === 'sill')?.total).toBe(3 * 520);
    expect(est.lines.find((l) => l.scope === 'ebb')?.total).toBe(3 * 280);
    expect(est.lines.find((l) => l.scope === 'mosquito')?.total).toBe(2 * 1200);
  });

  it('работы с qty=0 и unit="м²" подставляют площадь проекта', () => {
    const p = standardProject();
    p.config.works = [{ materialId: 'work-install', quantity: 0 }];

    const est = calcProject(p, matMap);
    const work = est.lines.find((l) => l.scope === 'work');
    expect(work?.quantity).toBe(4.2); // подставилась площадь
    expect(work?.total).toBe(4.2 * 800);
  });

  it('работы с явным quantity используют его', () => {
    const p = standardProject();
    p.config.works = [{ materialId: 'work-demont', quantity: 1 }];

    const est = calcProject(p, matMap);
    const work = est.lines.find((l) => l.scope === 'work');
    expect(work?.quantity).toBe(1);
    expect(work?.total).toBe(1500);
  });
});

describe('calcProject — скидка и customPrice', () => {
  it('скидка 5% уменьшает итог', () => {
    const p = standardProject();
    p.config.discountPercent = 5;
    const est = calcProject(p, matMap);
    expect(est.subtotal).toBe(18480);
    expect(est.discountAmount).toBe(924); // 18480 × 0.05
    expect(est.total).toBe(17556);
    expect(est.isCustomPrice).toBe(false);
  });

  it('customPrice перебивает всё, скидка игнорируется', () => {
    const p = standardProject();
    p.config.customPrice = 15000;
    p.config.discountPercent = 5; // должна игнорироваться
    const est = calcProject(p, matMap);
    expect(est.subtotal).toBe(18480);
    expect(est.total).toBe(15000);
    expect(est.isCustomPrice).toBe(true);
    // discountAmount показывает разницу между расчётной ценой и фактической
    expect(est.discountAmount).toBe(3480);
  });

  it('customPrice больше расчётной — discountAmount отрицательный (наценка)', () => {
    const p = standardProject();
    p.config.customPrice = 25000;
    const est = calcProject(p, matMap);
    expect(est.total).toBe(25000);
    expect(est.discountAmount).toBe(-6520); // наценка
  });
});

describe('calcProject — устойчивость', () => {
  it('не падает если material не найден в карте', () => {
    const p = standardProject();
    p.config.profileSystemId = 'unknown-id';
    p.config.glassId = null;
    const est = calcProject(p, matMap);
    expect(est.lines).toEqual([]);
    expect(est.total).toBe(0);
  });

  it('пустой проект (нет сегментов) даёт нулевую смету', () => {
    const p = createEmptyProject();
    p.segments = [];
    p.config.profileSystemId = 'profile-rehau';
    const est = calcProject(p, matMap);
    expect(est.total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// calcAll — все проекты вместе
// ═══════════════════════════════════════════════════════════════════

describe('calcAll', () => {
  it('суммирует totals всех проектов', () => {
    const p1 = standardProject();
    const p2 = standardProject();
    p2.id = 'p2';
    p2.config.discountPercent = 5;

    const all = calcAll(
      { projects: [p1, p2], activeProjectId: p1.id },
      matMap
    );

    expect(all.projects).toHaveLength(2);
    expect(all.grandTotal).toBe(18480 + 17556);
  });

  it('пустой список проектов — grandTotal = 0', () => {
    const all = calcAll({ projects: [], activeProjectId: null }, matMap);
    expect(all.grandTotal).toBe(0);
    expect(all.projects).toEqual([]);
  });
});
