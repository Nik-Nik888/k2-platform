import type { GlazingProject, Segment, Frame, Impost, Cell, SashType } from '../types';
import { uid, emptyProjectConfig } from '../types';

// ═══════════════════════════════════════════════════════════════════
// Шаблоны проектов — пресеты для попапа «Новый проект».
//
// Каждый шаблон описывает базовую конструкцию (рамы, импосты, створки)
// которая создаётся одним тапом. После применения шаблона пользователь
// может всё перенастроить вручную в канвасе.
//
// Шаблоны сгруппированы по типу конструкции для удобной фильтрации.
// ═══════════════════════════════════════════════════════════════════

export type ConstructionType = 'window' | 'balcony' | 'balcony_block' | 'loggia';

export const CONSTRUCTION_TYPE_LABELS: Record<ConstructionType, string> = {
  window:        'Окно',
  balcony:       'Балкон',
  balcony_block: 'Балконный блок',
  loggia:        'Лоджия',
};

export interface ProjectTemplate {
  id: string;
  /** Тип конструкции — для фильтрации в попапе создания. */
  constructionType: ConstructionType;
  /** Название шаблона (например, «Окно 2-створчатое»). */
  name: string;
  /** Краткое описание для tooltip / подписи. */
  description: string;
  /**
   * Фабрика, создающая объект GlazingProject. Не делаем статические
   * объекты, чтобы id были уникальными при каждом создании.
   *
   * @param projectName название проекта (вводит пользователь, например «Балкон 1»)
   */
  build: (projectName: string) => GlazingProject;
}

// ─── Хелперы для построения ────────────────────────────────────────

/**
 * Создать раму с N равномерными вертикальными импостами и заданными
 * типами створок в каждой ячейке (слева направо).
 */
function buildFrame(width: number, height: number, sashes: SashType[]): Frame {
  const N = sashes.length;
  const imposts: Impost[] = [];
  // N створок → (N-1) импостов
  if (N > 1) {
    const step = width / N;
    for (let i = 1; i < N; i++) {
      imposts.push({
        id: uid(),
        orientation: 'vertical',
        position: Math.round(step * i),
        belongsToRow: 0,
      });
    }
  }
  // Создаём ячейки в порядке слева направо
  const cells: Cell[] = [];
  for (let i = 0; i < N; i++) {
    const x = (width / N) * i;
    cells.push({
      id: uid(),
      x: Math.round(x),
      y: 0,
      width: Math.round(width / N),
      height,
      sash: sashes[i] ?? 'fixed',
    });
  }
  return {
    id: uid(),
    width,
    height,
    imposts,
    cells,
  };
}

/**
 * Создать раму с горизонтальной фрамугой сверху и заданными створками снизу.
 * fragWidth = высота фрамуги (полосы сверху), bottomSashes = типы створок в нижней полосе.
 */
function buildFrameWithFramuga(
  width: number, height: number,
  framugaHeight: number,
  bottomSashes: SashType[],
): Frame {
  const N = bottomSashes.length;
  const imposts: Impost[] = [];
  // Один горизонтальный импост = граница полос
  imposts.push({
    id: uid(),
    orientation: 'horizontal',
    position: height - framugaHeight,
  });
  // Вертикальные импосты в нижней полосе (rowIdx=0)
  if (N > 1) {
    const step = width / N;
    for (let i = 1; i < N; i++) {
      imposts.push({
        id: uid(),
        orientation: 'vertical',
        position: Math.round(step * i),
        belongsToRow: 0,
      });
    }
  }
  // Ячейки: верхняя полоса = 1 фрамуга-fixed, нижняя полоса = N створок
  const cells: Cell[] = [];
  // Верхняя полоса — одна ячейка-фрамуга
  cells.push({
    id: uid(),
    x: 0,
    y: height - framugaHeight,
    width,
    height: framugaHeight,
    sash: 'fixed',
  });
  // Нижняя полоса — N ячеек
  for (let i = 0; i < N; i++) {
    const x = (width / N) * i;
    cells.push({
      id: uid(),
      x: Math.round(x),
      y: 0,
      width: Math.round(width / N),
      height: height - framugaHeight,
      sash: bottomSashes[i] ?? 'fixed',
    });
  }
  return {
    id: uid(),
    width,
    height,
    imposts,
    cells,
  };
}

/** Создать сегмент с одной рамой. */
function buildSingleFrameSegment(frame: Frame): Segment {
  return {
    id: uid(),
    heightLeft: frame.height,
    heightRight: frame.height,
    frames: [frame],
    bones: [],
  };
}

/** Создать пустой проект-обёртку с заданным названием и сегментами. */
function makeProject(projectName: string, segments: Segment[]): GlazingProject {
  return {
    id: uid(),
    name: projectName,
    segments,
    corners: segments.length > 1
      ? segments.slice(1).map(() => ({ id: uid(), type: 'h_90' as const }))
      : [],
    config: emptyProjectConfig(),
  };
}

// ─── Сами шаблоны ──────────────────────────────────────────────────

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  // ═══ ОКНА ═══════════════════════════════════════════════════════
  {
    id: 'tpl-window-empty',
    constructionType: 'window',
    name: 'Пустая рама',
    description: 'Одна рама 750×1500 без импостов',
    build: (name) => makeProject(name, [
      buildSingleFrameSegment(buildFrame(750, 1500, ['fixed'])),
    ]),
  },
  {
    id: 'tpl-window-2',
    constructionType: 'window',
    name: '2-створчатое окно',
    description: 'Глухая + поворотно-откидная',
    build: (name) => makeProject(name, [
      buildSingleFrameSegment(buildFrame(1500, 1400, ['fixed', 'tilt_turn_right'])),
    ]),
  },
  {
    id: 'tpl-window-3',
    constructionType: 'window',
    name: '3-створчатое окно',
    description: 'Поворотная + глухая + поворотно-откидная',
    build: (name) => makeProject(name, [
      buildSingleFrameSegment(buildFrame(1800, 1400, ['turn_left', 'fixed', 'tilt_turn_right'])),
    ]),
  },
  {
    id: 'tpl-window-framuga',
    constructionType: 'window',
    name: 'Окно с фрамугой',
    description: '2-створчатое + горизонтальная фрамуга сверху',
    build: (name) => makeProject(name, [
      buildSingleFrameSegment(
        buildFrameWithFramuga(1500, 1700, 400, ['fixed', 'tilt_turn_right'])
      ),
    ]),
  },

  // ═══ БАЛКОНЫ ════════════════════════════════════════════════════
  {
    id: 'tpl-balcony-straight',
    constructionType: 'balcony',
    name: 'Прямой балкон',
    description: '4 створки в линию, 3000×1400',
    build: (name) => makeProject(name, [
      buildSingleFrameSegment(
        buildFrame(3000, 1400, ['fixed', 'tilt_turn_left', 'tilt_turn_right', 'fixed'])
      ),
    ]),
  },
  {
    id: 'tpl-balcony-l',
    constructionType: 'balcony',
    name: 'Г-образный балкон',
    description: 'Длинная стена 3м + короткая 1м под 90°',
    build: (name) => makeProject(name, [
      buildSingleFrameSegment(
        buildFrame(3000, 1400, ['fixed', 'tilt_turn_left', 'tilt_turn_right', 'fixed'])
      ),
      buildSingleFrameSegment(
        buildFrame(1000, 1400, ['fixed'])
      ),
    ]),
  },
  {
    id: 'tpl-balcony-p',
    constructionType: 'balcony',
    name: 'П-образный балкон',
    description: '1м + 3м (перед) + 1м, два угла 90°',
    build: (name) => makeProject(name, [
      buildSingleFrameSegment(buildFrame(1000, 1400, ['fixed'])),
      buildSingleFrameSegment(
        buildFrame(3000, 1400, ['fixed', 'tilt_turn_left', 'tilt_turn_right', 'fixed'])
      ),
      buildSingleFrameSegment(buildFrame(1000, 1400, ['fixed'])),
    ]),
  },

  // ═══ БАЛКОННЫЙ БЛОК ═════════════════════════════════════════════
  {
    id: 'tpl-block-classic',
    constructionType: 'balcony_block',
    name: 'Классический балконный блок',
    description: 'Окно 1500 + дверь 700 (как глухая пока)',
    build: (name) => makeProject(name, [
      buildSingleFrameSegment(buildFrame(1500, 1400, ['fixed', 'tilt_turn_right'])),
      buildSingleFrameSegment(buildFrame(700, 2100, ['turn_left'])),
    ]),
  },

  // ═══ ЛОДЖИЯ ═════════════════════════════════════════════════════
  {
    id: 'tpl-loggia-6',
    constructionType: 'loggia',
    name: 'Лоджия 6 створок',
    description: '6м, чередование глухих и открывающихся',
    build: (name) => makeProject(name, [
      buildSingleFrameSegment(
        buildFrame(6000, 1400, [
          'fixed', 'tilt_turn_left', 'fixed', 'fixed', 'tilt_turn_right', 'fixed'
        ])
      ),
    ]),
  },
];

/** Получить шаблоны по типу конструкции. */
export function getTemplatesByType(type: ConstructionType): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter((t) => t.constructionType === type);
}

/** Найти шаблон по id. */
export function findTemplateById(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.id === id);
}
