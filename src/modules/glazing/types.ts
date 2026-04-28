// ═══════════════════════════════════════════════════════════════════
// Типы модуля Остекление.
//
// Иерархия данных:
//   GlazingProject
//   ├─ segments[]                — фасадные плоскости между углами
//   │  ├─ frames[]               — отдельные рамы внутри сегмента
//   │  │  ├─ imposts[]           — импосты внутри рамы (горизонт./вертикал.)
//   │  │  └─ cells[]             — ячейки (глухие или со створкой)
//   │  └─ bones[]                — кости (усил. соединители) между рамами
//   ├─ corners[]                 — угловые соединители между сегментами
//   └─ config                    — общие настройки проекта
//
// Этот файл — чистые типы, без логики и без зависимостей от Supabase.
// ═══════════════════════════════════════════════════════════════════

// ─── Базовые ──────────────────────────────────────────────────────

/** Тип открывания створки. */
export type SashType =
  | 'fixed'             // глухая (не открывается)
  | 'turn_left'         // поворотная влево (петли слева)
  | 'turn_right'        // поворотная вправо (петли справа)
  | 'tilt'              // откидная (фрамуга)
  | 'tilt_turn_left'    // поворотно-откидная, петли слева
  | 'tilt_turn_right'   // поворотно-откидная, петли справа
  | 'sliding_left'      // раздвижная влево
  | 'sliding_right';    // раздвижная вправо

/** Подписи типов створок (для UI). */
export const SASH_LABELS: Record<SashType, string> = {
  fixed:             'Глухая',
  turn_left:         'Поворотная (петли слева)',
  turn_right:        'Поворотная (петли справа)',
  tilt:              'Откидная (фрамуга)',
  tilt_turn_left:    'Поворотно-откидная (петли слева)',
  tilt_turn_right:   'Поворотно-откидная (петли справа)',
  sliding_left:      'Раздвижная влево',
  sliding_right:     'Раздвижная вправо',
};

/** Ориентация импоста. */
export type ImpostOrientation = 'vertical' | 'horizontal';

/** Тип углового соединителя между сегментами. */
export type CornerConnector =
  | 'h_90'              // 90° (Г-образный балкон)
  | 'h_135'             // 135° (эркер скошенный)
  | 'h_universal'       // произвольный угол
  | 'flat';             // плоский переход (180°, без угла) — фактически просто кость

// ─── Геометрия рамы ───────────────────────────────────────────────

/**
 * Импост — горизонтальный или вертикальный профиль внутри рамы,
 * делящий её на ячейки.
 */
export interface Impost {
  id: string;
  orientation: ImpostOrientation;
  /**
   * Положение импоста в раме, мм.
   * Для vertical — от левого края рамы.
   * Для horizontal — от низа рамы.
   */
  position: number;
  /**
   * Для ВЕРТИКАЛЬНОГО импоста: индекс горизонтальной полосы (row), к которой
   * он принадлежит. Полоса = область между двумя соседними горизонтальными
   * импостами (или между гор. импостом и краем рамы), нумерация снизу вверх.
   *
   * Если в раме нет горизонтальных импостов → полоса всегда 0 (единственная).
   * Если задано — вертикальный импост рисуется только в пределах своей полосы
   * и НЕ пересекает горизонтальные.
   *
   * Для горизонтальных импостов поле игнорируется.
   */
  belongsToRow?: number;
}

/**
 * Ячейка — прямоугольная область внутри рамы, ограниченная
 * импостами и/или контуром рамы. Может быть глухой или содержать створку.
 *
 * Координаты задаются в мм относительно левого нижнего угла рамы.
 */
/**
 * Тип москитной сетки. null/undefined = без сетки.
 */
export type MosquitoType = 'standard' | 'plug' | 'antiсat' | 'antidust';

export const MOSQUITO_LABELS: Record<MosquitoType, string> = {
  standard: 'Стандартная',
  plug:     'Вкладная',
  antiсat:  'Антикошка',
  antidust: 'Антипыль',
};

/**
 * Дополнительная фурнитура. Можно установить несколько одновременно
 * на одну ячейку (например, детские замки + гребёнка).
 */
export type HardwareItem = 'child_lock' | 'comb' | 'air_box';

export const HARDWARE_LABELS: Record<HardwareItem, string> = {
  child_lock: 'Детские замки',
  comb:       'Гребёнка',
  air_box:    'Эйрбокс',
};

/**
 * Ячейка — прямоугольная область внутри рамы, ограниченная
 * импостами и/или контуром рамы. Может быть глухой или содержать створку.
 *
 * Координаты задаются в мм относительно левого нижнего угла рамы.
 */
export interface Cell {
  id: string;
  x: number;           // левый край, мм
  y: number;           // нижний край, мм
  width: number;       // ширина, мм
  height: number;      // высота, мм
  sash: SashType;      // тип открывания (fixed = глухая)
  /** Тип москитной сетки. null/undefined = без сетки. */
  mosquito?: MosquitoType | null;
  /** Доп. фурнитура (можно несколько). */
  hardware?: HardwareItem[];
}

/**
 * Рама — отдельный конструктивный элемент.
 * Несколько рам могут стоять в одном сегменте, соединённые костями.
 */
export interface Frame {
  id: string;
  width: number;       // ширина рамы, мм
  height: number;      // высота рамы, мм
  imposts: Impost[];
  cells: Cell[];
  /** Override настроек проекта на уровне отдельной рамы (необязательно). */
  override?: Partial<FrameConfig>;
  /**
   * Закреплённые секции (по индексам в массиве, отсортированном по позиции).
   * При изменении ширины одной секции остальные пересчитываются равномерно,
   * но закреплённые сохраняют свою ширину.
   *
   * • horizontal — закреплённые ВЫСОТЫ горизонтальных полос (общие для всей рамы).
   * • verticalByRow — закреплённые ШИРИНЫ вертикальных секций для каждой полосы
   *   (ключ — индекс полосы 0,1,2... снизу вверх).
   *
   * Закрепы сбрасываются при добавлении/удалении импостов и по кнопке "выровнять".
   */
  lockedSections?: {
    horizontal: number[];
    verticalByRow: Record<number, number[]>;
  };
}

/**
 * Кость — усиленный вертикальный соединитель между двумя рамами
 * в одной фасадной плоскости. Не делит раму, а стоит МЕЖДУ рамами.
 */
export interface Bone {
  id: string;
  /** Индекс рамы слева в массиве segment.frames, после которой идёт кость. */
  afterFrameIndex: number;
  /** ID материала кости из справочника (категория «Кости»). */
  materialId?: string;
}

// ─── Сегмент (фасадная плоскость) ──────────────────────────────────

/**
 * Скос крыши — задаётся разными высотами слева и справа сегмента.
 * Если heightLeft === heightRight — крыша горизонтальная.
 */
export interface Segment {
  id: string;
  /** Высота слева, мм (для скоса). По умолчанию = config.defaultHeight. */
  heightLeft: number;
  /** Высота справа, мм (для скоса). По умолчанию = config.defaultHeight. */
  heightRight: number;
  /** Рамы внутри сегмента (слева направо). */
  frames: Frame[];
  /** Кости между рамами. */
  bones: Bone[];
}

/**
 * Угловой соединитель между сегментами.
 * Привязывается к стыку: corners[i] стоит между segments[i] и segments[i+1].
 */
export interface Corner {
  id: string;
  type: CornerConnector;
  /** Угол в градусах для type='h_universal'. Для остальных игнорируется. */
  customAngle?: number;
  /** ID материала из справочника (категория «Соединительные профили»). */
  materialId?: string;
}

// ─── Конфигурация рамы / проекта ───────────────────────────────────

/**
 * Конфиг рамы — параметры, влияющие на расчёт стоимости.
 * На уровне проекта задаётся общий конфиг, который наследуют все рамы.
 * Отдельные рамы могут переопределить любое поле через Frame.override.
 */
export interface FrameConfig {
  /** ID профильной системы из справочника (категория «Профильные системы»). */
  profileSystemId: string | null;
  /** ID стеклопакета (категория «Стеклопакеты»). */
  glassId: string | null;
  /** ID фурнитуры (категория «Фурнитура»). */
  hardwareId: string | null;
  /** ID ламинации внутр. (категория «Ламинация внутренняя»). null = без ламинации. */
  laminationInnerId: string | null;
  /** ID ламинации внешн. */
  laminationOuterId: string | null;
}

/**
 * Конфиг проекта — всё что не привязано к конкретной раме:
 * подоконники, отливы, москитки, работы, доборы, расходники, скидка.
 *
 * Этот блок — то что в PVC Studio задаётся в правой панели «настройки окна»
 * (фото 7-10). У нас он на уровне проекта (или отдельной рамы через override).
 */
export interface ProjectConfig extends FrameConfig {
  /** Подоконники: id материала + длина в п.м. */
  sills: { materialId: string; length: number }[];
  /** Отливы: id + длина. */
  ebbs: { materialId: string; length: number }[];
  /** Москитные сетки: id + количество. */
  mosquitos: { materialId: string; quantity: number }[];
  /** Дополнения по размеру (подставочный профиль, порог, наличник). */
  addons: { materialId: string; length: number }[];
  /** Доборные профили. */
  extensions: { materialId: string; length: number }[];
  /** Нащельники. */
  overlaps: { materialId: string; length: number }[];
  /** Работы (демонтаж, монтаж, отделка откосов). */
  works: { materialId: string; quantity: number }[];
  /** Расходники монтажа. */
  miscs: { materialId: string; quantity: number }[];
  /** Скидка: 0 / 1 / 3 / 5 (процент). */
  discountPercent: 0 | 1 | 3 | 5;
  /** Override итоговой цены проекта. null = считать автоматически. */
  customPrice: number | null;
  /** Произвольная заметка к проекту. */
  note: string;
}

/** Минимальные дефолты для нового пустого проекта. */
export function emptyProjectConfig(): ProjectConfig {
  return {
    profileSystemId: null,
    glassId: null,
    hardwareId: null,
    laminationInnerId: null,
    laminationOuterId: null,
    sills: [],
    ebbs: [],
    mosquitos: [],
    addons: [],
    extensions: [],
    overlaps: [],
    works: [],
    miscs: [],
    discountPercent: 0,
    customPrice: null,
    note: '',
  };
}

// ─── Проект целиком ────────────────────────────────────────────────

/**
 * Один «проект остекления» = один балкон/окно/группа окон,
 * привязанная к заказу из CRM.
 */
export interface GlazingProject {
  id: string;
  name: string;             // человекочитаемое имя ("Балкон зал", "Окно кухня")
  segments: Segment[];
  corners: Corner[];        // длина = segments.length - 1
  config: ProjectConfig;
}

/**
 * Полный объект, который сохраняется в orders.form_data.glazing.
 * Обычно содержит несколько проектов (балкон + окна квартиры).
 */
export interface GlazingFormData {
  projects: GlazingProject[];
  /** Активный проект для UI (при загрузке). */
  activeProjectId: string | null;
}

// ─── Результат расчёта ─────────────────────────────────────────────

/** Одна позиция в смете. */
export interface EstimateLine {
  materialId: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  /** К чему относится позиция. */
  scope: 'profile' | 'glass' | 'hardware' | 'lamination' |
         'sill' | 'ebb' | 'mosquito' | 'addon' | 'connector' | 'bone' |
         'extension' | 'overlap' | 'work' | 'misc';
}

export interface ProjectEstimate {
  projectId: string;
  projectName: string;
  lines: EstimateLine[];
  subtotal: number;        // до скидки и override
  discountAmount: number;  // фактическая скидка в рублях
  total: number;           // итог: либо subtotal-discount, либо customPrice
  isCustomPrice: boolean;  // использован ли override
}

export interface GlazingEstimate {
  projects: ProjectEstimate[];
  grandTotal: number;
}

// ─── Утилиты создания пустых сущностей ────────────────────────────

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Создать дефолтную ячейку, занимающую всю раму. */
export function createDefaultCell(width: number, height: number): Cell {
  return {
    id: uid(),
    x: 0, y: 0,
    width, height,
    sash: 'fixed',
  };
}

/** Создать пустую раму с одной глухой ячейкой. */
export function createEmptyFrame(width = 750, height = 1500): Frame {
  return {
    id: uid(),
    width,
    height,
    imposts: [],
    cells: [createDefaultCell(width, height)],
  };
}

/** Создать пустой сегмент с одной рамой. */
export function createEmptySegment(height = 1500): Segment {
  return {
    id: uid(),
    heightLeft: height,
    heightRight: height,
    frames: [createEmptyFrame(750, height)],
    bones: [],
  };
}

/** Создать пустой проект. */
export function createEmptyProject(name = 'Балкон'): GlazingProject {
  return {
    id: uid(),
    name,
    segments: [createEmptySegment()],
    corners: [],
    config: emptyProjectConfig(),
  };
}

// ─── Валидация по ГОСТ 23166-99 / 30674-99 ────────────────────────

export interface ValidationWarning {
  level: 'warn' | 'error';
  message: string;
  /** К какой сущности относится (frame.id / cell.id / segment.id). */
  targetId?: string;
}

/** Лимиты по ГОСТ для предупреждений в UI. */
export const GOST_LIMITS = {
  /** Макс. площадь одного оконного блока, м². */
  MAX_FRAME_AREA_M2: 6.0,
  /** Макс. ширина рамы, мм. */
  MAX_FRAME_WIDTH_MM: 2670,
  /** Макс. высота рамы, мм. */
  MAX_FRAME_HEIGHT_MM: 2750,
  /** Макс. площадь активной (открывающейся) створки, м². */
  MAX_SASH_AREA_M2: 2.5,
  /** Макс. площадь глухой створки выше 1 этажа, м² (~800×400 мм). */
  MAX_DEAF_SASH_AREA_M2: 0.32,
  /** Длина балкона, при которой рекомендуется кость, мм. */
  RECOMMEND_BONE_WIDTH_MM: 3000,
  /** Высота балкона, при которой рекомендуется усиленная кость, мм. */
  RECOMMEND_HEAVY_BONE_HEIGHT_MM: 2500,
} as const;
