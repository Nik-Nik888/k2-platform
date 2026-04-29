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

/**
 * Список шаблонов проектов остекления.
 * Стандартные шаблоны убраны по запросу пользователя — пользователь
 * создаёт пустой проект и сам конфигурирует его, потом может сохранить
 * как пользовательский шаблон (планируется).
 *
 * При желании сюда можно добавить пользовательские шаблоны (Stage 3.5).
 */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [];

/** Получить шаблоны по типу конструкции. */
export function getTemplatesByType(type: ConstructionType): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter((t) => t.constructionType === type);
}

/** Найти шаблон по id. */
export function findTemplateById(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.id === id);
}

/**
 * Создать пустой проект с указанным типом конструкции.
 * Используется в попапе создания нового проекта когда пользователь
 * выбирает тип, но не выбирает конкретный шаблон (пока их нет).
 */
export function createProjectByType(
  name: string,
  constructionType: ConstructionType
): GlazingProject {
  // Балконный блок — особая конструкция: дверь + connector + окно над выступом
  if (constructionType === 'balcony_block') {
    const door = buildFrame(700, 2100, ['tilt_turn_right']);
    const win = buildFrame(1500, 1300, ['fixed']);
    win.bottomOffset = 800;  // окно висит на высоте 800мм над полом
    const segment: Segment = {
      id: uid(),
      heightLeft: 2100,
      heightRight: 2100,
      frames: [door, win],
      bones: [
        { id: uid(), afterFrameIndex: 0, type: 'connector' },
      ],
    };
    const project = makeProject(name, [segment]);
    project.constructionType = constructionType;
    return project;
  }

  // Базовые размеры под другие типы
  let frameWidth = 750, frameHeight = 1500;
  if (constructionType === 'balcony') { frameWidth = 3000; frameHeight = 1400; }
  else if (constructionType === 'loggia') { frameWidth = 6000; frameHeight = 1400; }

  const project = makeProject(name, [
    buildSingleFrameSegment(buildFrame(frameWidth, frameHeight, ['fixed'])),
  ]);
  project.constructionType = constructionType;
  return project;
}
