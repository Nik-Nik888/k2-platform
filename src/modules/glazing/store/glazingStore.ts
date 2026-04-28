import { create } from 'zustand';
import {
  type GlazingFormData, type GlazingProject, type Segment, type Frame,
  type Cell, type Impost, type Bone, type Corner,
  type ProjectConfig, type FrameConfig, type SashType, type CornerConnector,
  createEmptyProject, createEmptySegment, createEmptyFrame, createDefaultCell,
} from '../types';

// ═══════════════════════════════════════════════════════════════════
// glazingStore — состояние редактора остекления.
//
// Хранит:
//   • массив проектов (form_data) — несколько окон в одной карточке заказа
//   • активный проект, активный сегмент, активную раму, активную ячейку
//   • orderId (привязка к CRM) — null если редактируем вне заказа
//
// Autosave в localStorage (ключ k2_glazing_draft) — на случай ухода
// со страницы без сохранения. При загрузке заказа draft перезаписывается.
// ═══════════════════════════════════════════════════════════════════

const DRAFT_KEY = 'k2_glazing_draft';

// ── Утилиты ────────────────────────────────────────────────────────

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function emptyFormData(): GlazingFormData {
  const project = createEmptyProject('Балкон');
  return {
    projects: [project],
    activeProjectId: project.id,
  };
}

function loadDraft(): GlazingFormData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GlazingFormData;
  } catch {
    return null;
  }
}

function saveDraft(data: GlazingFormData) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded или приватный режим — игнорируем.
  }
}

// ── Иммутабельные апдейтеры (без structuredClone — поддерживаем старые браузеры) ─

function updProject(
  data: GlazingFormData,
  projectId: string,
  fn: (p: GlazingProject) => GlazingProject
): GlazingFormData {
  return {
    ...data,
    projects: data.projects.map((p) => (p.id === projectId ? fn(p) : p)),
  };
}

function updSegment(
  project: GlazingProject,
  segmentId: string,
  fn: (s: Segment) => Segment
): GlazingProject {
  return {
    ...project,
    segments: project.segments.map((s) => (s.id === segmentId ? fn(s) : s)),
  };
}

function updFrame(
  segment: Segment,
  frameId: string,
  fn: (f: Frame) => Frame
): Segment {
  return {
    ...segment,
    frames: segment.frames.map((f) => (f.id === frameId ? fn(f) : f)),
  };
}

function updCell(
  frame: Frame,
  cellId: string,
  fn: (c: Cell) => Cell
): Frame {
  return {
    ...frame,
    cells: frame.cells.map((c) => (c.id === cellId ? fn(c) : c)),
  };
}

// ── Состояние и actions ────────────────────────────────────────────

interface GlazingState {
  data: GlazingFormData;
  orderId: string | null;
  // Активные сущности (для UI редактора)
  activeSegmentId: string | null;
  activeFrameId: string | null;
  activeCellId: string | null;
  // Загрузка/сохранение
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // ── Инициализация ────────────────────────────────────────────
  initFromDraft: () => void;
  initFromOrder: (orderId: string, data: GlazingFormData | null) => void;
  reset: () => void;

  // ── Проекты ──────────────────────────────────────────────────
  addProject: (name?: string) => string;       // возвращает id нового
  removeProject: (projectId: string) => void;
  setActiveProject: (projectId: string) => void;
  renameProject: (projectId: string, name: string) => void;
  duplicateProject: (projectId: string) => string;

  // ── Сегменты ─────────────────────────────────────────────────
  addSegment: (projectId: string) => string;
  removeSegment: (projectId: string, segmentId: string) => void;
  setSegmentHeight: (projectId: string, segmentId: string, side: 'left' | 'right' | 'both', value: number) => void;

  // ── Рамы ─────────────────────────────────────────────────────
  addFrame: (projectId: string, segmentId: string, width?: number) => string;
  removeFrame: (projectId: string, segmentId: string, frameId: string) => void;
  setFrameSize: (projectId: string, segmentId: string, frameId: string, width: number, height: number) => void;
  setFrameOverride: (projectId: string, segmentId: string, frameId: string, override: Partial<FrameConfig> | undefined) => void;

  // ── Импосты ──────────────────────────────────────────────────
  addImpost: (projectId: string, segmentId: string, frameId: string, orientation: 'vertical' | 'horizontal', position: number) => void;
  removeImpost: (projectId: string, segmentId: string, frameId: string, impostId: string) => void;
  moveImpost: (projectId: string, segmentId: string, frameId: string, impostId: string, position: number) => void;

  // ── Ячейки ───────────────────────────────────────────────────
  setCellSash: (projectId: string, segmentId: string, frameId: string, cellId: string, sash: SashType) => void;
  rebuildCells: (projectId: string, segmentId: string, frameId: string) => void;

  // ── Кости ────────────────────────────────────────────────────
  addBone: (projectId: string, segmentId: string, afterFrameIndex: number, materialId?: string) => void;
  removeBone: (projectId: string, segmentId: string, boneId: string) => void;

  // ── Углы между сегментами ────────────────────────────────────
  setCorner: (projectId: string, index: number, type: CornerConnector, materialId?: string, customAngle?: number) => void;
  removeCorner: (projectId: string, index: number) => void;

  // ── Конфиг проекта ───────────────────────────────────────────
  setProjectConfig: (projectId: string, patch: Partial<ProjectConfig>) => void;

  // ── Активные сущности ────────────────────────────────────────
  setActive: (segmentId: string | null, frameId: string | null, cellId: string | null) => void;
}

// ═══════════════════════════════════════════════════════════════════

export const useGlazingStore = create<GlazingState>((set, get) => ({
  data: emptyFormData(),
  orderId: null,
  activeSegmentId: null,
  activeFrameId: null,
  activeCellId: null,
  isLoading: false,
  isSaving: false,
  error: null,

  // ── Инициализация ──────────────────────────────────────────────

  initFromDraft: () => {
    const draft = loadDraft();
    if (draft && draft.projects.length > 0) {
      set({ data: draft, orderId: null });
    } else {
      set({ data: emptyFormData(), orderId: null });
    }
  },

  initFromOrder: (orderId, data) => {
    if (data && data.projects.length > 0) {
      set({ data, orderId, error: null });
    } else {
      // Заказ найден, но glazing-данных нет — создаём пустой проект
      const fresh = emptyFormData();
      set({ data: fresh, orderId, error: null });
    }
    // При работе с заказом отдельный draft не нужен
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  },

  reset: () => {
    const fresh = emptyFormData();
    set({
      data: fresh,
      orderId: null,
      activeSegmentId: null,
      activeFrameId: null,
      activeCellId: null,
      error: null,
    });
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  },

  // ── Проекты ────────────────────────────────────────────────────

  addProject: (name = 'Окно') => {
    const project = createEmptyProject(name);
    const data = {
      ...get().data,
      projects: [...get().data.projects, project],
      activeProjectId: project.id,
    };
    set({ data });
    if (!get().orderId) saveDraft(data);
    return project.id;
  },

  removeProject: (projectId) => {
    const projects = get().data.projects.filter((p) => p.id !== projectId);
    if (projects.length === 0) {
      // Не позволяем удалить последний — создаём новый пустой
      const fresh = createEmptyProject('Балкон');
      const data = { projects: [fresh], activeProjectId: fresh.id };
      set({ data });
      if (!get().orderId) saveDraft(data);
      return;
    }
    let activeProjectId = get().data.activeProjectId;
    if (activeProjectId === projectId) {
      activeProjectId = projects[0]!.id;
    }
    const data = { ...get().data, projects, activeProjectId };
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  setActiveProject: (projectId) => {
    const data = { ...get().data, activeProjectId: projectId };
    set({ data, activeSegmentId: null, activeFrameId: null, activeCellId: null });
    if (!get().orderId) saveDraft(data);
  },

  renameProject: (projectId, name) => {
    const data = updProject(get().data, projectId, (p) => ({ ...p, name }));
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  duplicateProject: (projectId) => {
    const src = get().data.projects.find((p) => p.id === projectId);
    if (!src) return '';
    // Глубокий клон через JSON (типы простые, без Date/Map/функций)
    const clone: GlazingProject = JSON.parse(JSON.stringify(src));
    clone.id = uid();
    clone.name = src.name + ' (копия)';
    // Перевыдаём id всем вложенным сущностям, чтобы не было дублей
    for (const seg of clone.segments) {
      seg.id = uid();
      for (const f of seg.frames) {
        f.id = uid();
        for (const i of f.imposts) i.id = uid();
        for (const c of f.cells) c.id = uid();
      }
      for (const b of seg.bones) b.id = uid();
    }
    for (const c of clone.corners) c.id = uid();

    const data = {
      ...get().data,
      projects: [...get().data.projects, clone],
      activeProjectId: clone.id,
    };
    set({ data });
    if (!get().orderId) saveDraft(data);
    return clone.id;
  },

  // ── Сегменты ───────────────────────────────────────────────────

  addSegment: (projectId) => {
    const segment = createEmptySegment();
    const data = updProject(get().data, projectId, (p) => ({
      ...p,
      segments: [...p.segments, segment],
      // Каждый новый сегмент требует углового соединителя.
      // По умолчанию — 90° (Г-образный балкон).
      corners: p.segments.length > 0
        ? [...p.corners, { id: uid(), type: 'h_90' as CornerConnector }]
        : p.corners,
    }));
    set({ data });
    if (!get().orderId) saveDraft(data);
    return segment.id;
  },

  removeSegment: (projectId, segmentId) => {
    const data = updProject(get().data, projectId, (p) => {
      const idx = p.segments.findIndex((s) => s.id === segmentId);
      if (idx < 0) return p;
      const segments = p.segments.filter((s) => s.id !== segmentId);
      // Удаляем соответствующий угловой соединитель
      // Если удалён первый сегмент — убираем corners[0]
      // Если удалён последний — убираем corners[corners.length-1]
      // Иначе — убираем corners[idx-1] (между новым предыдущим и следующим остаётся 1)
      const corners = [...p.corners];
      if (segments.length === 0) {
        corners.length = 0;
      } else if (idx === 0) {
        corners.shift();
      } else {
        // Удаляем угол ПЕРЕД сегментом (между idx-1 и idx)
        corners.splice(idx - 1, 1);
      }
      return { ...p, segments, corners };
    });
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  setSegmentHeight: (projectId, segmentId, side, value) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) => ({
        ...s,
        heightLeft:  side === 'right' ? s.heightLeft  : value,
        heightRight: side === 'left'  ? s.heightRight : value,
      }))
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  // ── Рамы ───────────────────────────────────────────────────────

  addFrame: (projectId, segmentId, width = 1500) => {
    let newFrameId = '';
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) => {
        const height = (s.heightLeft + s.heightRight) / 2;
        const frame = createEmptyFrame(width, height);
        newFrameId = frame.id;
        return { ...s, frames: [...s.frames, frame] };
      })
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
    return newFrameId;
  },

  removeFrame: (projectId, segmentId, frameId) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) => {
        const idx = s.frames.findIndex((f) => f.id === frameId);
        if (idx < 0) return s;
        const frames = s.frames.filter((f) => f.id !== frameId);
        // Корректируем кости: удаляем кости, индексы которых вышли за пределы
        const bones = s.bones
          .filter((b) => b.afterFrameIndex < frames.length - 1)
          .map((b) => ({
            ...b,
            // Если удалена рама с индексом меньше bone.afterFrameIndex,
            // сдвигаем индекс на -1
            afterFrameIndex: b.afterFrameIndex >= idx
              ? Math.max(0, b.afterFrameIndex - 1)
              : b.afterFrameIndex,
          }));
        return { ...s, frames, bones };
      })
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  setFrameSize: (projectId, segmentId, frameId, width, height) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) => {
          // Если ячейка одна и она занимает всю старую раму — растягиваем на новую
          const single = f.cells.length === 1 && f.imposts.length === 0;
          const cells: Cell[] = single
            ? [{ ...f.cells[0]!, x: 0, y: 0, width, height }]
            : f.cells;
          return { ...f, width, height, cells };
        })
      )
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  setFrameOverride: (projectId, segmentId, frameId, override) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) => ({ ...f, override }))
      )
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  // ── Импосты ────────────────────────────────────────────────────

  addImpost: (projectId, segmentId, frameId, orientation, position) => {
    const impost: Impost = { id: uid(), orientation, position };
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) => {
          const next = { ...f, imposts: [...f.imposts, impost] };
          // Перестраиваем ячейки под новую сетку импостов
          return rebuildFrameCells(next);
        })
      )
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  removeImpost: (projectId, segmentId, frameId, impostId) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) => {
          const next = { ...f, imposts: f.imposts.filter((i) => i.id !== impostId) };
          return rebuildFrameCells(next);
        })
      )
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  moveImpost: (projectId, segmentId, frameId, impostId, position) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) => {
          const next = {
            ...f,
            imposts: f.imposts.map((i) => i.id === impostId ? { ...i, position } : i),
          };
          return rebuildFrameCells(next);
        })
      )
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  // ── Ячейки ─────────────────────────────────────────────────────

  setCellSash: (projectId, segmentId, frameId, cellId, sash) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) =>
          updCell(f, cellId, (c) => ({ ...c, sash }))
        )
      )
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  rebuildCells: (projectId, segmentId, frameId) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) => rebuildFrameCells(f))
      )
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  // ── Кости ──────────────────────────────────────────────────────

  addBone: (projectId, segmentId, afterFrameIndex, materialId) => {
    const bone: Bone = { id: uid(), afterFrameIndex, materialId };
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) => ({ ...s, bones: [...s.bones, bone] }))
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  removeBone: (projectId, segmentId, boneId) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) => ({
        ...s,
        bones: s.bones.filter((b) => b.id !== boneId),
      }))
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  // ── Угловые соединители ────────────────────────────────────────

  setCorner: (projectId, index, type, materialId, customAngle) => {
    const data = updProject(get().data, projectId, (p) => {
      const corners = [...p.corners];
      const existing = corners[index];
      const id = existing?.id ?? uid();
      corners[index] = { id, type, materialId, customAngle };
      return { ...p, corners };
    });
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  removeCorner: (projectId, index) => {
    const data = updProject(get().data, projectId, (p) => {
      const corners = [...p.corners];
      corners.splice(index, 1);
      return { ...p, corners };
    });
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  // ── Конфиг проекта ─────────────────────────────────────────────

  setProjectConfig: (projectId, patch) => {
    const data = updProject(get().data, projectId, (p) => ({
      ...p,
      config: { ...p.config, ...patch },
    }));
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  // ── Активные сущности ──────────────────────────────────────────

  setActive: (segmentId, frameId, cellId) => {
    set({
      activeSegmentId: segmentId,
      activeFrameId: frameId,
      activeCellId: cellId,
    });
  },
}));

// ═══════════════════════════════════════════════════════════════════
// Перестроение ячеек рамы по сетке импостов.
//
// При добавлении/удалении/перемещении импоста ячейки нужно пересчитать.
// Логика: импосты делят раму на прямоугольные «карточки», каждая из которых
// становится ячейкой. Тип створки сохраняется по принципу «ближайшая
// существующая ячейка по центру новой» (чтобы не сбрасывать настройки).
// ═══════════════════════════════════════════════════════════════════

function rebuildFrameCells(frame: Frame): Frame {
  // Собираем разделители X и Y (включая края рамы)
  const xs = [0, frame.width];
  const ys = [0, frame.height];

  for (const imp of frame.imposts) {
    if (imp.orientation === 'vertical')   xs.push(imp.position);
    else                                  ys.push(imp.position);
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);

  // Удаляем дубли и значения вне рамы (оборона от мусорных импостов)
  const uniq = (arr: number[]) =>
    arr.filter((v, i, a) => i === 0 || v - a[i - 1]! > 0.5)
       .filter((v) => v >= 0 && v <= (arr === xs ? frame.width : frame.height) + 0.5);
  const xList = uniq([...xs]);
  const yList = uniq([...ys]);

  const oldCells = frame.cells;
  const newCells: Cell[] = [];

  for (let yi = 0; yi < yList.length - 1; yi++) {
    for (let xi = 0; xi < xList.length - 1; xi++) {
      const x = xList[xi]!;
      const y = yList[yi]!;
      const w = xList[xi + 1]! - x;
      const h = yList[yi + 1]! - y;
      if (w <= 0 || h <= 0) continue;

      // Ищем старую ячейку, чей центр попадает в новую — наследуем sash
      const cx = x + w / 2;
      const cy = y + h / 2;
      const inherited = oldCells.find((c) =>
        cx >= c.x && cx <= c.x + c.width &&
        cy >= c.y && cy <= c.y + c.height
      );

      newCells.push({
        id: uid(),
        x, y, width: w, height: h,
        sash: inherited?.sash ?? 'fixed',
      });
    }
  }

  // Если после перестроения не осталось ячеек — добавляем одну дефолтную.
  if (newCells.length === 0) {
    return { ...frame, cells: [createDefaultCell(frame.width, frame.height)] };
  }

  return { ...frame, cells: newCells };
}

// ── Селекторы ──────────────────────────────────────────────────────

/** Получить текущий активный проект (или null если нет). */
export function useActiveProject(): GlazingProject | null {
  return useGlazingStore((s) => {
    const id = s.data.activeProjectId;
    if (!id) return null;
    return s.data.projects.find((p) => p.id === id) ?? null;
  });
}

// Подавляем неиспользуемые импорты, которые могут пригодиться в UI
export type { Corner, ProjectConfig };
