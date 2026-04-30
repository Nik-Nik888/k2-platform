import type {
  GlazingProject, Frame, Cell, ProjectConfig,
  EstimateLine, ProjectEstimate, ProjectMetrics,
  GlazingEstimate, GlazingFormData, FrameConfig,
  MosquitoType, HardwareItem,
} from '../types';

// ═══════════════════════════════════════════════════════════════════
// doGlazing — расчётчик стоимости остекления.
//
// Чистая функция: на вход — проект и справочник материалов,
// на выход — готовая смета. Не делает запросов к Supabase,
// не зависит от React/Zustand. Поэтому легко тестируется.
//
// Формула расчёта (вариант A — простой, по площади):
//   профиль  = площадь_рам(м²) × цена_проф_системы_за_м²
//   стекло   = площадь_рам(м²) × цена_стеклопакета_за_м²
//             (один проф/стекло на проект, override на уровне рамы)
//   фурнитура = (число открыв. створок) × цена_фурнитуры_за_створку
//   ламинация = площадь_рам(м²) × цена_ламинации_за_м²  (если задана)
//   кости     = (число костей) × цена_кости_за_шт
//   углы      = (число угловых соединителей) × цена_углового × средняя_высота
//   подоконники / отливы / москитки / доборы / нащельники — по конфигу
//   работы   — по конфигу (qty × price)
//   ИТОГ     = сумма - скидка%   ИЛИ   customPrice (если задан)
// ═══════════════════════════════════════════════════════════════════

// ── Минимальная форма материала, которую ждёт расчётчик ───────────
// Дублируем чтобы не тащить в этот модуль RefMaterial из reference/api
// (расчётчик не должен знать про Supabase-схему).
export interface CalcMaterial {
  id: string;
  name: string;
  unit: string;
  price: number;
}

/**
 * Карта материалов по id для быстрого поиска внутри расчётчика.
 * UI собирает её из loadGlazingReference() перед вызовом doGlazing().
 */
export type MaterialMap = Map<string, CalcMaterial>;

// ── Геометрические утилиты ────────────────────────────────────────

/** Площадь рамы в м² (мм × мм → м²). */
export function frameAreaM2(frame: Frame): number {
  return (frame.width * frame.height) / 1_000_000;
}

/** Площадь ячейки в м². */
export function cellAreaM2(cell: Cell): number {
  return (cell.width * cell.height) / 1_000_000;
}

/** Площадь всех рам проекта, м². */
export function projectAreaM2(project: GlazingProject): number {
  let total = 0;
  for (const seg of project.segments) {
    for (const f of seg.frames) total += frameAreaM2(f);
  }
  return total;
}

/** Число открывающихся створок (всё кроме fixed) во всём проекте. */
export function projectOpeningSashesCount(project: GlazingProject): number {
  let n = 0;
  for (const seg of project.segments) {
    for (const f of seg.frames) {
      for (const c of f.cells) {
        // Открывающиеся = не глухие и не сэндвич-панели
        if (c.sash !== 'fixed' && c.sash !== 'sandwich') n++;
      }
    }
  }
  return n;
}

/** Число костей во всём проекте (по сегментам). */
export function projectBonesCount(project: GlazingProject): number {
  return project.segments.reduce((sum, s) => sum + s.bones.length, 0);
}

/** Средняя высота сегментов (для расчёта углового соединителя за пог.м). */
export function avgSegmentHeightM(project: GlazingProject): number {
  if (project.segments.length === 0) return 0;
  let sum = 0;
  for (const s of project.segments) {
    sum += (s.heightLeft + s.heightRight) / 2;
  }
  return sum / project.segments.length / 1000; // мм → м
}

// ── Хелперы создания строк сметы ──────────────────────────────────

function line(
  scope: EstimateLine['scope'],
  mat: CalcMaterial | undefined,
  quantity: number,
  fallbackName?: string,
  fallbackUnit = 'шт.'
): EstimateLine | null {
  if (!mat) {
    // Если материала в справочнике нет — пропускаем позицию.
    // Это безопасно: лучше показать смету без позиции, чем с NaN.
    if (!fallbackName) return null;
    return {
      materialId: null,
      name: fallbackName,
      unit: fallbackUnit,
      quantity: round(quantity, 2),
      unitPrice: 0,
      total: 0,
      scope,
    };
  }
  const total = mat.price * quantity;
  return {
    materialId: mat.id,
    name: mat.name,
    unit: mat.unit,
    quantity: round(quantity, 2),
    unitPrice: mat.price,
    total: round(total, 2),
    scope,
  };
}

function round(n: number, digits = 2): number {
  const k = Math.pow(10, digits);
  return Math.round(n * k) / k;
}

// ── Главный расчётчик одного проекта ──────────────────────────────

/**
 * Считает смету для одного проекта остекления.
 *
 * @param project — проект с геометрией и конфигом
 * @param materials — карта материалов из справочника (id → material)
 */

// ═══════════════════════════════════════════════════════════════════
// Матчинг типов москиток/фурнитуры с материалами справочника.
//
// В коде ячейки хранят логические типы:
//   • MosquitoType: 'standard' | 'plug' | 'antiсat' | 'antidust'
//   • HardwareItem: 'child_lock' | 'comb' | 'air_box'
//
// А в БД material справочника лежат именованными строками («Сетка
// антипыль», «Детские замки», ...). Матчим их по подстроке в названии,
// без учёта регистра. Если ничего не нашлось — возвращаем undefined,
// и в смету эта позиция не попадает (с предупреждением в console).
//
// Подстроки специально написаны в нижнем регистре и в русской
// транслитерации соответствующей seed-данным.
// ═══════════════════════════════════════════════════════════════════

const MOSQUITO_NAME_PATTERNS: Record<MosquitoType, string[]> = {
  // Сетка стандартная: «сетка» + «стандарт» (двойной фильтр чтобы не
  // спутать с «Кость стандарт» из категории костей)
  standard: ['сетка стандарт', 'сетка белая стандарт'],
  // Вкладная (без рамки) — «вкладная» или «плунжер»
  plug:     ['вкладн', 'плунжер'],
  // Антикошка — содержит «антикошка» или просто «кошк»
  antiсat:  ['антикошк', 'кошк'],
  // Антипыль — «антипыль» или «пыл»
  antidust: ['антипыл'],
};

const HARDWARE_NAME_PATTERNS: Record<HardwareItem, string[]> = {
  child_lock: ['детские замки', 'детский замок', 'child lock'],
  comb:       ['гребёнк', 'гребенк'],
  air_box:    ['эйрбокс', 'air box', 'клапан'],
};

/**
 * Найти CalcMaterial для москитки заданного типа.
 * Сначала пробуем точное совпадение по подстрокам, иначе undefined.
 */
function matchMosquitoMaterial(
  type: MosquitoType,
  materials: MaterialMap,
): CalcMaterial | undefined {
  const patterns = MOSQUITO_NAME_PATTERNS[type] ?? [];
  for (const pattern of patterns) {
    for (const mat of materials.values()) {
      if (mat.name.toLowerCase().includes(pattern.toLowerCase())) {
        return mat;
      }
    }
  }
  return undefined;
}

/**
 * Найти CalcMaterial для дополнительной фурнитуры заданного типа.
 */
function matchHardwareMaterial(
  item: HardwareItem,
  materials: MaterialMap,
): CalcMaterial | undefined {
  const patterns = HARDWARE_NAME_PATTERNS[item] ?? [];
  for (const pattern of patterns) {
    for (const mat of materials.values()) {
      if (mat.name.toLowerCase().includes(pattern.toLowerCase())) {
        return mat;
      }
    }
  }
  return undefined;
}

/**
 * Пройти по всем ячейкам проекта и посчитать сколько раз встречается
 * каждый тип москитки и каждый тип фурнитуры. На выходе — две карты:
 *   • mosquitoCounts: {standard: 3, antidust: 1, ...}
 *   • hardwareCounts: {child_lock: 2, comb: 1, ...}
 *
 * Используется в calcProject для добавления соответствующих строк в смету.
 */
function aggregateCellExtras(project: GlazingProject): {
  mosquitoCounts: Partial<Record<MosquitoType, number>>;
  hardwareCounts: Partial<Record<HardwareItem, number>>;
} {
  const mosquitoCounts: Partial<Record<MosquitoType, number>> = {};
  const hardwareCounts: Partial<Record<HardwareItem, number>> = {};

  for (const seg of project.segments) {
    for (const frame of seg.frames) {
      for (const cell of frame.cells) {
        // Москитка — может быть только одного типа (или null) на ячейку
        if (cell.mosquito) {
          mosquitoCounts[cell.mosquito] = (mosquitoCounts[cell.mosquito] ?? 0) + 1;
        }
        // Фурнитура — массив, на одной ячейке может быть несколько
        if (cell.hardware) {
          for (const item of cell.hardware) {
            hardwareCounts[item] = (hardwareCounts[item] ?? 0) + 1;
          }
        }
      }
    }
  }

  return { mosquitoCounts, hardwareCounts };
}

// ═══════════════════════════════════════════════════════════════════
// Геометрические метрики проекта (без участия материалов).
// Используются для столбцов «площадь / рамы / импосты / штапики / ...»
// в таблице сметы PVC-style.
// ═══════════════════════════════════════════════════════════════════

export function calcProjectMetrics(project: GlazingProject): ProjectMetrics {
  let areaM2 = 0;
  let framesPerimeterM = 0;
  let impostsM = 0;
  let beadingM = 0;
  let sealM = 0;
  let sashCount = 0;
  let glassAreaM2 = 0;
  let sandwichAreaM2 = 0;

  for (const seg of project.segments) {
    for (const frame of seg.frames) {
      const fW = frame.width / 1000;   // → м
      const fH = frame.height / 1000;
      const fArea = fW * fH;
      areaM2 += fArea;
      framesPerimeterM += 2 * (fW + fH);

      const horCount = frame.imposts.filter((i) => i.orientation === 'horizontal').length;
      const vertCount = frame.imposts.filter((i) => i.orientation === 'vertical').length;
      const verticalRowH = fH / (horCount + 1);
      impostsM += horCount * fW;
      impostsM += vertCount * verticalRowH;

      for (const cell of frame.cells) {
        const cW = cell.width / 1000;
        const cH = cell.height / 1000;
        const cellPerim = 2 * (cW + cH);
        beadingM += cellPerim;
        sealM += cellPerim * 2;

        // Сэндвич-панель занимает место стекла, но идёт отдельной графой
        if (cell.sash === 'sandwich') {
          sandwichAreaM2 += cW * cH;
        } else {
          glassAreaM2 += cW * cH;
        }

        // Sandwich и fixed — неоткрывающиеся, не считаются как створка
        if (cell.sash !== 'fixed' && cell.sash !== 'sandwich') sashCount++;
      }
    }
  }

  return {
    areaM2: round(areaM2, 2),
    framesPerimeterM: round(framesPerimeterM, 2),
    impostsM: round(impostsM, 2),
    beadingM: round(beadingM, 2),
    sealM: round(sealM, 2),
    sashCount,
    doorSashCount: 0,         // двери появятся в Этапе 5
    glassAreaM2: round(glassAreaM2, 2),
    sandwichAreaM2: round(sandwichAreaM2, 2),
  };
}

export function calcProject(
  project: GlazingProject,
  materials: MaterialMap
): ProjectEstimate {
  const lines: EstimateLine[] = [];
  const cfg = project.config;

  // Проходим по рамам и группируем площади по «эффективному конфигу»
  // (с учётом override на раме). Чаще всего конфиг общий — тогда получим
  // одну строку «REHAU Blitz, м², Х шт».
  const profileGroups = new Map<string, { mat: CalcMaterial; area: number }>();
  const glassGroups   = new Map<string, { mat: CalcMaterial; area: number }>();
  const lamInGroups   = new Map<string, { mat: CalcMaterial; area: number }>();
  const lamOutGroups  = new Map<string, { mat: CalcMaterial; area: number }>();

  for (const seg of project.segments) {
    for (const frame of seg.frames) {
      const eff = effectiveFrameConfig(cfg, frame);
      const area = frameAreaM2(frame);

      // Профиль
      if (eff.profileSystemId) {
        const mat = materials.get(eff.profileSystemId);
        if (mat) {
          const g = profileGroups.get(mat.id) ?? { mat, area: 0 };
          g.area += area;
          profileGroups.set(mat.id, g);
        }
      }

      // Стеклопакет
      if (eff.glassId) {
        const mat = materials.get(eff.glassId);
        if (mat) {
          const g = glassGroups.get(mat.id) ?? { mat, area: 0 };
          g.area += area;
          glassGroups.set(mat.id, g);
        }
      }

      // Ламинация внутр.
      if (eff.laminationInnerId) {
        const mat = materials.get(eff.laminationInnerId);
        if (mat) {
          const g = lamInGroups.get(mat.id) ?? { mat, area: 0 };
          g.area += area;
          lamInGroups.set(mat.id, g);
        }
      }

      // Ламинация внешн.
      if (eff.laminationOuterId) {
        const mat = materials.get(eff.laminationOuterId);
        if (mat) {
          const g = lamOutGroups.get(mat.id) ?? { mat, area: 0 };
          g.area += area;
          lamOutGroups.set(mat.id, g);
        }
      }
    }
  }

  // Раскладываем группы в строки сметы
  for (const { mat, area } of profileGroups.values()) {
    const ln = line('profile', mat, area);
    if (ln) lines.push(ln);
  }
  for (const { mat, area } of glassGroups.values()) {
    const ln = line('glass', mat, area);
    if (ln) lines.push(ln);
  }
  for (const { mat, area } of lamInGroups.values()) {
    const ln = line('lamination', mat, area);
    if (ln) lines.push(ln);
  }
  for (const { mat, area } of lamOutGroups.values()) {
    const ln = line('lamination', mat, area);
    if (ln) lines.push(ln);
  }

  // Фурнитура — за каждую открывающуюся створку.
  // Берём общий hardwareId из конфига (на уровне проекта).
  if (cfg.hardwareId) {
    const mat = materials.get(cfg.hardwareId);
    const sashCount = projectOpeningSashesCount(project);
    if (mat && sashCount > 0) {
      const ln = line('hardware', mat, sashCount);
      if (ln) lines.push(ln);
    }
  }

  // ── Соединители (углы между сегментами) ──────────────────────
  // Каждый corner стоит между сегментами и имеет materialId.
  // Цена за пог.м, длина = средняя высота сегментов в этом стыке.
  for (let i = 0; i < project.corners.length; i++) {
    const corner = project.corners[i];
    if (!corner || !corner.materialId) continue;
    const mat = materials.get(corner.materialId);
    if (!mat) continue;
    // Берём среднюю высоту между двумя смежными сегментами.
    const segA = project.segments[i];
    const segB = project.segments[i + 1];
    if (!segA || !segB) continue;
    const hA = (segA.heightLeft + segA.heightRight) / 2;
    const hB = (segB.heightLeft + segB.heightRight) / 2;
    const lengthM = ((hA + hB) / 2) / 1000;
    const ln = line('connector', mat, lengthM);
    if (ln) lines.push(ln);
  }

  // ── Кости (внутри сегментов, между рамами) ───────────────────
  // Каждая кость — отдельная позиция (шт), либо группируем по materialId.
  const boneGroups = new Map<string, number>();
  for (const seg of project.segments) {
    for (const bone of seg.bones) {
      if (!bone.materialId) continue;
      boneGroups.set(bone.materialId, (boneGroups.get(bone.materialId) ?? 0) + 1);
    }
  }
  for (const [matId, qty] of boneGroups) {
    const mat = materials.get(matId);
    const ln = line('bone', mat, qty);
    if (ln) lines.push(ln);
  }

  // ── Подоконники / Отливы / Москитки / Доборы / Нащельники ────
  for (const item of cfg.sills) {
    const mat = materials.get(item.materialId);
    const ln = line('sill', mat, item.length);
    if (ln) lines.push(ln);
  }
  for (const item of cfg.ebbs) {
    const mat = materials.get(item.materialId);
    const ln = line('ebb', mat, item.length);
    if (ln) lines.push(ln);
  }
  for (const item of cfg.mosquitos) {
    const mat = materials.get(item.materialId);
    const ln = line('mosquito', mat, item.quantity);
    if (ln) lines.push(ln);
  }

  // ── Доп. москитки и фурнитура из ячеек проекта ───────────────
  // Менеджер ставит на конкретные открывающиеся створки в попапе ячейки
  // (вкладки «Сетка» и «Фурнитура»). Тут собираем их в смету.
  const { mosquitoCounts, hardwareCounts } = aggregateCellExtras(project);

  for (const [type, count] of Object.entries(mosquitoCounts)) {
    if (!count) continue;
    const mat = matchMosquitoMaterial(type as MosquitoType, materials);
    if (mat) {
      const ln = line('mosquito', mat, count);
      if (ln) lines.push(ln);
    } else {
      console.warn(
        `[glazing] Не найден материал для москитки типа "${type}". ` +
        `Проверьте, что в справочнике есть подходящая позиция (Сетка стандартная/антипыль/вкладная/антикошка).`
      );
    }
  }

  for (const [item, count] of Object.entries(hardwareCounts)) {
    if (!count) continue;
    const mat = matchHardwareMaterial(item as HardwareItem, materials);
    if (mat) {
      const ln = line('hardware', mat, count);
      if (ln) lines.push(ln);
    } else {
      console.warn(
        `[glazing] Не найден материал для фурнитуры "${item}". ` +
        `Проверьте, что в справочнике есть позиция (Детские замки/Гребёнка/Эйрбокс).`
      );
    }
  }

  for (const item of cfg.addons) {
    const mat = materials.get(item.materialId);
    const ln = line('addon', mat, item.length);
    if (ln) lines.push(ln);
  }
  for (const item of cfg.extensions) {
    const mat = materials.get(item.materialId);
    const ln = line('extension', mat, item.length);
    if (ln) lines.push(ln);
  }
  for (const item of cfg.overlaps) {
    const mat = materials.get(item.materialId);
    const ln = line('overlap', mat, item.length);
    if (ln) lines.push(ln);
  }

  // ── Работы ───────────────────────────────────────────────────
  // Особый случай: если в работе указана единица 'м²' — считаем
  // площадь как qty * projectAreaM2. Иначе берём qty как есть.
  const projArea = projectAreaM2(project);
  for (const item of cfg.works) {
    const mat = materials.get(item.materialId);
    if (!mat) continue;
    let qty = item.quantity;
    // Если qty=0 и единица "м²" — подставляем площадь проекта.
    // Это удобно для работ типа «монтаж окна 800₽/м²» — менеджер
    // не должен вручную считать площадь.
    if (qty === 0 && mat.unit === 'м²') qty = projArea;
    const ln = line('work', mat, qty);
    if (ln) lines.push(ln);
  }

  // ── Расходники монтажа ───────────────────────────────────────
  for (const item of cfg.miscs) {
    const mat = materials.get(item.materialId);
    const ln = line('misc', mat, item.quantity);
    if (ln) lines.push(ln);
  }

  // ── Итоги ────────────────────────────────────────────────────
  const subtotal = round(lines.reduce((s, l) => s + l.total, 0), 2);

  let total: number;
  let discountAmount: number;
  let isCustomPrice = false;

  if (cfg.customPrice !== null && cfg.customPrice >= 0) {
    // Override: финальная цена задана менеджером, скидка игнорируется
    total = round(cfg.customPrice, 2);
    discountAmount = round(subtotal - total, 2);
    isCustomPrice = true;
  } else {
    // Применяем скидку
    discountAmount = round(subtotal * (cfg.discountPercent / 100), 2);
    total = round(subtotal - discountAmount, 2);
  }

  return {
    projectId: project.id,
    projectName: project.name,
    lines,
    subtotal,
    discountAmount,
    total,
    isCustomPrice,
    metrics: calcProjectMetrics(project),
  };
}

/**
 * Объединяет конфиг проекта с переопределениями на уровне рамы.
 * Frame.override может задать любое поле — оно перебивает соответствующее в проекте.
 */
function effectiveFrameConfig(projectCfg: ProjectConfig, frame: Frame): FrameConfig {
  const base: FrameConfig = {
    profileSystemId:   projectCfg.profileSystemId,
    glassId:           projectCfg.glassId,
    hardwareId:        projectCfg.hardwareId,
    laminationInnerId: projectCfg.laminationInnerId,
    laminationOuterId: projectCfg.laminationOuterId,
  };
  if (!frame.override) return base;
  return { ...base, ...frame.override };
}

// ── Расчёт всех проектов в form_data ──────────────────────────────

export function calcAll(
  data: GlazingFormData,
  materials: MaterialMap
): GlazingEstimate {
  const projects = data.projects.map((p) => calcProject(p, materials));
  const grandTotal = round(
    projects.reduce((s, p) => s + p.total, 0),
    2
  );
  return { projects, grandTotal };
}
