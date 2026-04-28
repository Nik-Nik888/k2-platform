import { create } from 'zustand';
import {
  type GlazingFormData, type GlazingProject, type Segment, type Frame,
  type Cell, type Impost, type Bone, type Corner,
  type ProjectConfig, type FrameConfig, type SashType, type CornerConnector,
  type MosquitoType, type HardwareItem,
  createEmptyProject, createEmptySegment, createEmptyFrame, createDefaultCell,
} from '../types';
import {
  distributeEvenly, redistributeAround,
  bonesTotalWidth, segmentTotalWidth,
  sectionWidths, widthsToPositions, evenImpostPositions,
  redistributeSectionsWithLocks,
  scaleSectionsToFit,
} from '../logic/distribute';

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
  /**
   * Разделить сегмент в указанной точке (после рамы afterFrameIndex).
   * Все рамы справа от этой точки переезжают в новый сегмент.
   * Между ними автоматически создаётся угол 90° (Г-образный поворот).
   * Кости, которые были в этой точке, удаляются (заменяются углом).
   * Возвращает id нового сегмента (правого).
   */
  splitSegmentAt: (projectId: string, segmentId: string, afterFrameIndex: number) => string | null;
  removeSegment: (projectId: string, segmentId: string) => void;
  setSegmentHeight: (projectId: string, segmentId: string, side: 'left' | 'right' | 'both', value: number) => void;

  // ── Рамы ─────────────────────────────────────────────────────
  addFrame: (projectId: string, segmentId: string, width?: number, position?: 'start' | 'end') => string;
  removeFrame: (projectId: string, segmentId: string, frameId: string) => void;
  setFrameSize: (projectId: string, segmentId: string, frameId: string, width: number, height: number) => void;
  /**
   * Установить ширину одной рамы И равномерно перераспределить остальные
   * рамы того же сегмента, чтобы общая ширина сегмента осталась прежней.
   * Если перераспределение невозможно (запрошенная ширина слишком велика) —
   * стор вызывает onError и не меняет данные.
   */
  setFrameWidthRedistribute: (projectId: string, segmentId: string, frameId: string, width: number) => boolean;
  /**
   * Установить новую общую ширину сегмента — все рамы делят её равномерно.
   * Учитывает суммарную ширину костей.
   */
  setSegmentTotalWidth: (projectId: string, segmentId: string, totalWidth: number) => boolean;
  setFrameOverride: (projectId: string, segmentId: string, frameId: string, override: Partial<FrameConfig> | undefined) => void;

  // ── Импосты ──────────────────────────────────────────────────
  addImpost: (projectId: string, segmentId: string, frameId: string, orientation: 'vertical' | 'horizontal', position: number, targetRowIdx?: number) => void;
  /**
   * Добавить N равномерно распределённых импостов одной ориентации.
   * Для ВЕРТИКАЛЬНЫХ импостов: добавляются в указанную полосу (targetRowIdx).
   * Если targetRowIdx не задан — в нижнюю полосу (rowIdx=0).
   * Возвращает false если рама/полоса слишком мала для запрошенного количества.
   */
  addImpostsEven: (projectId: string, segmentId: string, frameId: string, orientation: 'vertical' | 'horizontal', count: number, targetRowIdx?: number) => boolean;
  removeImpost: (projectId: string, segmentId: string, frameId: string, impostId: string) => void;
  moveImpost: (projectId: string, segmentId: string, frameId: string, impostId: string, position: number) => void;
  /**
   * Изменить ширину/высоту одной секции внутри рамы.
   * Для вертикальных секций: rowIdx указывает, в какой горизонтальной полосе.
   *
   * Возвращает:
   *   • 'ok' — успешно применено
   *   • 'overflow' — все секции закреплены и сумма не сходится; изменения НЕ применены
   *   • 'too_small' — свободным секциям не хватает минимума 200мм; изменения НЕ применены
   */
  setSectionWidth: (
    projectId: string, segmentId: string, frameId: string,
    orientation: 'vertical' | 'horizontal',
    sectionIdx: number,
    newWidth: number,
    rowIdx?: number,
  ) => 'ok' | 'overflow' | 'too_small';
  /**
   * Сбросить закрепы секций.
   * Для вертикальных — можно указать конкретную полосу (rowIdx).
   */
  resetSectionLocks: (
    projectId: string, segmentId: string, frameId: string,
    orientation?: 'vertical' | 'horizontal',
    rowIdx?: number,
  ) => void;

  // ── Ячейки ───────────────────────────────────────────────────
  setCellSash: (projectId: string, segmentId: string, frameId: string, cellId: string, sash: SashType) => void;
  setCellMosquito: (projectId: string, segmentId: string, frameId: string, cellId: string, mosquito: MosquitoType | null) => void;
  setCellHardware: (projectId: string, segmentId: string, frameId: string, cellId: string, hardware: HardwareItem[]) => void;
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

  splitSegmentAt: (projectId, segmentId, afterFrameIndex) => {
    let newSegmentId: string | null = null;
    const data = updProject(get().data, projectId, (p) => {
      const segIdx = p.segments.findIndex((s) => s.id === segmentId);
      if (segIdx < 0) return p;
      const seg = p.segments[segIdx]!;

      // Проверяем что точка разделения валидна
      // Должна быть хотя бы одна рама слева и одна справа
      if (afterFrameIndex < 0 || afterFrameIndex >= seg.frames.length - 1) return p;

      // Делим рамы: слева [0..afterFrameIndex], справа [afterFrameIndex+1..]
      const framesLeft = seg.frames.slice(0, afterFrameIndex + 1);
      const framesRight = seg.frames.slice(afterFrameIndex + 1);

      // Делим кости по тому же принципу.
      // Кость с afterFrameIndex == точке деления — удаляется (её место занимает угол).
      // Кости с afterFrameIndex < точки — остаются в левом сегменте.
      // Кости с afterFrameIndex > точки — переезжают в правый, индексы сдвигаются.
      const bonesLeft = seg.bones.filter((b) => b.afterFrameIndex < afterFrameIndex);
      const bonesRight = seg.bones
        .filter((b) => b.afterFrameIndex > afterFrameIndex)
        .map((b) => ({ ...b, afterFrameIndex: b.afterFrameIndex - (afterFrameIndex + 1) }));

      const leftSegment: Segment = { ...seg, frames: framesLeft, bones: bonesLeft };
      const rightSegment: Segment = {
        ...createEmptySegment(),
        heightLeft: seg.heightLeft,
        heightRight: seg.heightRight,
        frames: framesRight,
        bones: bonesRight,
      };
      newSegmentId = rightSegment.id;

      // Вставляем правый сегмент сразу после левого в массив сегментов
      const newSegments = [
        ...p.segments.slice(0, segIdx),
        leftSegment,
        rightSegment,
        ...p.segments.slice(segIdx + 1),
      ];

      // Угловой соединитель: вставляется в массив corners на позицию segIdx
      // (между leftSegment и rightSegment)
      const newCorner: Corner = { id: uid(), type: 'h_90' as CornerConnector };
      const newCorners = [
        ...p.corners.slice(0, segIdx),
        newCorner,
        ...p.corners.slice(segIdx),
      ];

      return { ...p, segments: newSegments, corners: newCorners };
    });
    set({ data });
    if (!get().orderId) saveDraft(data);
    return newSegmentId;
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

  addFrame: (projectId, segmentId, width = 750, position = 'end') => {
    let newFrameId = '';
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) => {
        // Стандартная высота новой рамы — 1500, если в сегменте нет других рам.
        // Иначе — берём высоту первой существующей рамы (чтобы они визуально совпадали).
        const height = s.frames.length > 0
          ? s.frames[0]!.height
          : Math.round((s.heightLeft + s.heightRight) / 2) || 1500;
        const frame = createEmptyFrame(width, height);
        newFrameId = frame.id;

        let newFrames: Frame[];
        let newBones = s.bones;
        if (position === 'start') {
          // Вставляем в начало → все кости сдвигают свой afterFrameIndex на +1
          newFrames = [frame, ...s.frames];
          newBones = s.bones.map((b) => ({
            ...b,
            afterFrameIndex: b.afterFrameIndex + 1,
          }));
        } else {
          newFrames = [...s.frames, frame];
        }

        // Также подстраиваем высоту сегмента, если новая рама выше текущей —
        // это редкий случай, но защита от рассинхрона
        const newHeightLeft = Math.max(s.heightLeft, height);
        const newHeightRight = Math.max(s.heightRight, height);

        return {
          ...s,
          frames: newFrames,
          bones: newBones,
          heightLeft: newHeightLeft,
          heightRight: newHeightRight,
        };
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
          const oldW = f.width;
          const oldH = f.height;

          // Если рама пустая (нет импостов) — просто меняем размер и тянем единственную ячейку
          if (f.imposts.length === 0) {
            const single = f.cells.length === 1
              ? [{ ...f.cells[0]!, x: 0, y: 0, width, height }]
              : f.cells;
            return { ...f, width, height, cells: single };
          }

          // Иначе — пересчитываем позиции импостов под новый размер.
          // Для каждой ориентации:
          //   • НЕзакреплённые секции масштабируются пропорционально
          //     (вместе они поглощают разницу размера)
          //   • Закреплённые секции остаются с их прежними ширинами
          //   • Если все закреплены — рассчитываем как если бы лок-ов не было
          //     (это аварийный fallback — лучше заполнить раму чем оставить пустоту)
          let next: Frame = { ...f };

          // ── Горизонтальные секции (высота полос) ─────────────────
          if (oldH !== height) {
            const horImposts = next.imposts
              .filter((i) => i.orientation === 'horizontal')
              .sort((a, b) => a.position - b.position);
            if (horImposts.length > 0) {
              const oldSecs = sectionWidths(horImposts, 'horizontal', oldH);
              const horLocks = next.lockedSections?.horizontal ?? [];
              const newSecs = scaleSectionsToFit(oldSecs, horLocks, height);
              if (newSecs) {
                const positions = widthsToPositions(newSecs);
                const newHor: Impost[] = horImposts.map((imp, i) => ({
                  ...imp, position: positions[i]!,
                }));
                const others = next.imposts.filter((i) => i.orientation !== 'horizontal');
                next = { ...next, imposts: [...others, ...newHor] };
              }
            }
          }

          // ── Вертикальные секции (ширина в каждой полосе) ─────────
          if (oldW !== width) {
            // Собираем все полосы (rowIdx) с вертикалями
            const verticals = next.imposts.filter((i) => i.orientation === 'vertical');
            const rowsWithVerticals = Array.from(new Set(
              verticals.map((v) => v.belongsToRow ?? 0)
            ));

            for (const rowIdx of rowsWithVerticals) {
              const inRow = next.imposts
                .filter((i) => i.orientation === 'vertical' && (i.belongsToRow ?? 0) === rowIdx)
                .sort((a, b) => a.position - b.position);
              if (inRow.length === 0) continue;

              const oldSecs = sectionWidths(inRow, 'vertical', oldW);
              const vertLocks = next.lockedSections?.verticalByRow?.[rowIdx] ?? [];
              const newSecs = scaleSectionsToFit(oldSecs, vertLocks, width);
              if (!newSecs) continue;
              const positions = widthsToPositions(newSecs);
              const newInRow: Impost[] = inRow.map((imp, i) => ({
                ...imp, position: positions[i]!, belongsToRow: rowIdx,
              }));
              const others = next.imposts.filter((i) =>
                i.orientation !== 'vertical' || (i.belongsToRow ?? 0) !== rowIdx
              );
              next = { ...next, imposts: [...others, ...newInRow] };
            }
          }

          // Меняем размер и пересобираем ячейки под новую сетку
          next = { ...next, width, height };
          return rebuildFrameCells(next);
        })
      )
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  setFrameWidthRedistribute: (projectId, segmentId, frameId, width) => {
    // 1. Найдём сегмент и индекс рамы
    const proj = get().data.projects.find((p) => p.id === projectId);
    const seg = proj?.segments.find((s) => s.id === segmentId);
    if (!proj || !seg) return false;
    const fixedIdx = seg.frames.findIndex((f) => f.id === frameId);
    if (fixedIdx < 0) return false;

    // 2. Сохраняем текущий total — он не должен меняться
    const total = segmentTotalWidth(seg);
    const bones = bonesTotalWidth(seg);

    // 3. Вычисляем новые ширины
    const newWidths = redistributeAround(seg.frames, fixedIdx, width, total, bones);
    if (!newWidths) return false; // запрос невозможен

    // 4. Применяем
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) => ({
        ...s,
        frames: s.frames.map((f, i) => {
          const w = newWidths[i]!;
          // Если рама не меняется — оставляем как есть
          if (w === f.width) return f;
          // Иначе растягиваем ячейку (если она одна) и обновляем width
          const single = f.cells.length === 1 && f.imposts.length === 0;
          const cells = single
            ? [{ ...f.cells[0]!, x: 0, y: 0, width: w, height: f.height }]
            : f.cells;
          return { ...f, width: w, cells };
        }),
      }))
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
    return true;
  },

  setSegmentTotalWidth: (projectId, segmentId, totalWidth) => {
    const proj = get().data.projects.find((p) => p.id === projectId);
    const seg = proj?.segments.find((s) => s.id === segmentId);
    if (!proj || !seg) return false;

    const bones = bonesTotalWidth(seg);
    const newWidths = distributeEvenly(seg.frames.length, totalWidth, bones);
    if (!newWidths) return false;

    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) => ({
        ...s,
        frames: s.frames.map((f, i) => {
          const w = newWidths[i]!;
          if (w === f.width) return f;
          const single = f.cells.length === 1 && f.imposts.length === 0;
          const cells = single
            ? [{ ...f.cells[0]!, x: 0, y: 0, width: w, height: f.height }]
            : f.cells;
          return { ...f, width: w, cells };
        }),
      }))
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
    return true;
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

  addImpost: (projectId, segmentId, frameId, orientation, position, targetRowIdx) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) => {
          let next: Frame = f;

          if (orientation === 'horizontal') {
            // Добавление горизонтального импоста.
            // Если это ПЕРВЫЙ горизонтальный — существующие вертикальные
            // (без belongsToRow или с belongsToRow=0) надо продублировать
            // во ВТОРУЮ полосу (которая появится после добавления горизонтали).
            const hadHorizontal = f.imposts.some((i) => i.orientation === 'horizontal');
            const newHorizontal: Impost = { id: uid(), orientation, position };

            let newImposts = [...f.imposts, newHorizontal];

            if (!hadHorizontal) {
              // Это был первый горизонтальный → дублируем вертикальные
              const verticals = f.imposts.filter((i) => i.orientation === 'vertical');
              const dupVerticals: Impost[] = verticals.map((v) => ({
                ...v,
                id: uid(),
                belongsToRow: 1,  // в верхнюю полосу
              }));
              // Старые вертикальные явно "приземляем" в нижнюю полосу
              newImposts = newImposts.map((i) =>
                i.orientation === 'vertical' && i.belongsToRow === undefined
                  ? { ...i, belongsToRow: 0 }
                  : i
              );
              newImposts = [...newImposts, ...dupVerticals];
            }
            next = { ...f, imposts: newImposts };
          } else {
            // Добавление вертикального импоста — в указанную полосу
            const rowIdx = targetRowIdx ?? 0;
            const impost: Impost = { id: uid(), orientation, position, belongsToRow: rowIdx };
            next = { ...f, imposts: [...f.imposts, impost] };
          }

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
          const removed = f.imposts.find((i) => i.id === impostId);
          if (!removed) return f;

          const oldLocks = f.lockedSections ?? { horizontal: [], verticalByRow: {} };
          let newHorizontal = oldLocks.horizontal ?? [];
          let newVerticalByRow = { ...(oldLocks.verticalByRow ?? {}) };

          if (removed.orientation === 'horizontal') {
            // Удалили горизонталь — сбрасываем все закрепы (полосы перестроены)
            newHorizontal = [];
            newVerticalByRow = {};
          } else {
            // Удалили вертикаль — сбрасываем закрепы её полосы
            const rowIdx = removed.belongsToRow ?? 0;
            newVerticalByRow[rowIdx] = [];
          }

          const next: Frame = {
            ...f,
            imposts: f.imposts.filter((i) => i.id !== impostId),
            lockedSections: { horizontal: newHorizontal, verticalByRow: newVerticalByRow },
          };
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

  addImpostsEven: (projectId, segmentId, frameId, orientation, count, targetRowIdx) => {
    const proj = get().data.projects.find((p) => p.id === projectId);
    const seg = proj?.segments.find((s) => s.id === segmentId);
    const frame = seg?.frames.find((f) => f.id === frameId);
    if (!proj || !seg || !frame) return false;

    if (orientation === 'horizontal') {
      // ─── Добавление горизонтальных импостов ────────────────────
      // Считаем сколько уже есть + добавляем count новых равномерно
      const existing = frame.imposts.filter((i) => i.orientation === 'horizontal');
      const totalCount = existing.length + count;
      const positions = evenImpostPositions(totalCount, frame.height);
      if (!positions) return false;

      const hadHorizontal = existing.length > 0;
      const newHorizontals: Impost[] = positions.map((pos) => ({
        id: uid(), orientation: 'horizontal' as const, position: pos,
      }));

      // Старые горизонтальные удаляем (пересоздаём с нуля для равномерности)
      // Вертикальные оставляем, но если первая горизонталь — присваиваем им belongsToRow
      let otherImposts = frame.imposts.filter((i) => i.orientation !== 'horizontal');

      if (!hadHorizontal && newHorizontals.length > 0) {
        // Первый горизонтальный → дублируем вертикали в каждую новую полосу
        const verticals = otherImposts.filter((i) => i.orientation === 'vertical');
        // Полос будет totalCount + 1 (т.е. positions.length + 1)
        const rowsCount = positions.length + 1;
        const newVerticals: Impost[] = [];
        for (let row = 0; row < rowsCount; row++) {
          for (const v of verticals) {
            newVerticals.push({ ...v, id: uid(), belongsToRow: row });
          }
        }
        otherImposts = newVerticals; // полностью заменяем
      }

      const data = updProject(get().data, projectId, (p) =>
        updSegment(p, segmentId, (s) =>
          updFrame(s, frameId, (f) => {
            const next: Frame = {
              ...f,
              imposts: [...otherImposts, ...newHorizontals],
              lockedSections: {
                horizontal: [],  // сбросили
                verticalByRow: {},  // тоже сбросили (т.к. полосы перестроены)
              },
            };
            return rebuildFrameCells(next);
          })
        )
      );
      set({ data });
      if (!get().orderId) saveDraft(data);
      return true;
    }

    // ─── Добавление вертикальных импостов в указанную полосу ────────
    const rowIdx = targetRowIdx ?? 0;
    const { yBottom, yTop } = getRowYRange(frame, rowIdx);
    const rowH = yTop - yBottom;
    if (rowH <= 0) return false;

    // Считаем сколько вертикальных уже есть В ЭТОЙ полосе
    const existingInRow = frame.imposts.filter(
      (i) => i.orientation === 'vertical' && (i.belongsToRow ?? 0) === rowIdx
    );
    const totalCount = existingInRow.length + count;
    const positions = evenImpostPositions(totalCount, frame.width);
    if (!positions) return false;

    // Старые вертикали этой полосы удаляем — пересоздаём
    const newVerticalsForRow: Impost[] = positions.map((pos) => ({
      id: uid(), orientation: 'vertical' as const, position: pos, belongsToRow: rowIdx,
    }));
    // Сохраняем импосты ДРУГОЙ ориентации + вертикали других полос
    const otherImposts = frame.imposts.filter((i) =>
      i.orientation !== 'vertical' || (i.belongsToRow ?? 0) !== rowIdx
    );

    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) => {
          const oldLocks = f.lockedSections ?? { horizontal: [], verticalByRow: {} };
          const newVerticalByRow = { ...(oldLocks.verticalByRow ?? {}) };
          newVerticalByRow[rowIdx] = []; // сбрасываем закрепы этой полосы
          const next: Frame = {
            ...f,
            imposts: [...otherImposts, ...newVerticalsForRow],
            lockedSections: {
              horizontal: oldLocks.horizontal ?? [],
              verticalByRow: newVerticalByRow,
            },
          };
          return rebuildFrameCells(next);
        })
      )
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
    return true;
  },

  setSectionWidth: (projectId, segmentId, frameId, orientation, sectionIdx, newWidth, rowIdx) => {
    const proj = get().data.projects.find((p) => p.id === projectId);
    const seg = proj?.segments.find((s) => s.id === segmentId);
    const frame = seg?.frames.find((f) => f.id === frameId);
    if (!proj || !seg || !frame) return 'too_small';

    if (orientation === 'horizontal') {
      // ─── Изменение ВЫСОТЫ горизонтальной секции (полосы) ──────
      const oldWidths = sectionWidths(frame.imposts, 'horizontal', frame.height);
      const currentLocks = frame.lockedSections?.horizontal ?? [];

      const newWidths = redistributeSectionsWithLocks(
        oldWidths, sectionIdx, newWidth, currentLocks, frame.height
      );

      if (!newWidths) {
        const lockedSet = new Set(currentLocks.filter((i) => i !== sectionIdx));
        const freeCount = oldWidths.length - lockedSet.size - 1;
        return freeCount <= 0 ? 'overflow' : 'too_small';
      }

      const newPositions = widthsToPositions(newWidths);
      const sameOri = frame.imposts
        .filter((i) => i.orientation === 'horizontal')
        .sort((a, b) => a.position - b.position);
      const newSameOri: Impost[] = sameOri.map((imp, i) => ({
        ...imp, position: newPositions[i]!,
      }));
      const otherImposts = frame.imposts.filter((i) => i.orientation !== 'horizontal');

      const newLocks = currentLocks.includes(sectionIdx)
        ? currentLocks
        : [...currentLocks, sectionIdx].sort((a, b) => a - b);

      const data = updProject(get().data, projectId, (p) =>
        updSegment(p, segmentId, (s) =>
          updFrame(s, frameId, (f) => {
            const next: Frame = {
              ...f,
              imposts: [...otherImposts, ...newSameOri],
              lockedSections: {
                horizontal: newLocks,
                verticalByRow: f.lockedSections?.verticalByRow ?? {},
              },
            };
            return rebuildFrameCells(next);
          })
        )
      );
      set({ data });
      if (!get().orderId) saveDraft(data);
      return 'ok';
    }

    // ─── Изменение ШИРИНЫ вертикальной секции в указанной полосе ────────
    const targetRow = rowIdx ?? 0;

    // Берём только вертикальные импосты этой полосы
    const verticalsInRow = frame.imposts.filter(
      (i) => i.orientation === 'vertical' && (i.belongsToRow ?? 0) === targetRow
    );
    const oldWidths = sectionWidths(verticalsInRow, 'vertical', frame.width);

    const currentLocks = frame.lockedSections?.verticalByRow?.[targetRow] ?? [];

    const newWidths = redistributeSectionsWithLocks(
      oldWidths, sectionIdx, newWidth, currentLocks, frame.width
    );

    if (!newWidths) {
      const lockedSet = new Set(currentLocks.filter((i) => i !== sectionIdx));
      const freeCount = oldWidths.length - lockedSet.size - 1;
      return freeCount <= 0 ? 'overflow' : 'too_small';
    }

    const newPositions = widthsToPositions(newWidths);
    const sortedVerticals = [...verticalsInRow].sort((a, b) => a.position - b.position);
    const newVerticalsForRow: Impost[] = sortedVerticals.map((imp, i) => ({
      ...imp, position: newPositions[i]!, belongsToRow: targetRow,
    }));

    // Сохраняем все импосты КРОМЕ вертикалей этой полосы
    const otherImposts = frame.imposts.filter((i) =>
      i.orientation !== 'vertical' || (i.belongsToRow ?? 0) !== targetRow
    );

    const oldLocks = frame.lockedSections ?? { horizontal: [], verticalByRow: {} };
    const newVerticalByRow = { ...(oldLocks.verticalByRow ?? {}) };
    const updatedLocks = currentLocks.includes(sectionIdx)
      ? currentLocks
      : [...currentLocks, sectionIdx].sort((a, b) => a - b);
    newVerticalByRow[targetRow] = updatedLocks;

    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) => {
          const next: Frame = {
            ...f,
            imposts: [...otherImposts, ...newVerticalsForRow],
            lockedSections: {
              horizontal: oldLocks.horizontal ?? [],
              verticalByRow: newVerticalByRow,
            },
          };
          return rebuildFrameCells(next);
        })
      )
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
    return 'ok';
  },

  resetSectionLocks: (projectId, segmentId, frameId, orientation, rowIdx) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) => {
          const oldLocks = f.lockedSections ?? { horizontal: [], verticalByRow: {} };
          let newHorizontal = oldLocks.horizontal ?? [];
          let newVerticalByRow = { ...(oldLocks.verticalByRow ?? {}) };

          // Сбрасываем нужные закрепы
          if (!orientation || orientation === 'horizontal') {
            newHorizontal = [];
          }
          if (!orientation || orientation === 'vertical') {
            if (rowIdx !== undefined) {
              newVerticalByRow[rowIdx] = [];
            } else {
              newVerticalByRow = {};
            }
          }

          let next: Frame = {
            ...f,
            lockedSections: { horizontal: newHorizontal, verticalByRow: newVerticalByRow },
          };

          // Равномерно распределяем то что сбросили
          if (!orientation || orientation === 'horizontal') {
            const horImposts = next.imposts
              .filter((i) => i.orientation === 'horizontal')
              .sort((a, b) => a.position - b.position);
            if (horImposts.length > 0) {
              const positions = evenImpostPositions(horImposts.length, next.height);
              if (positions) {
                const newHorImposts: Impost[] = horImposts.map((imp, i) => ({
                  ...imp, position: positions[i]!,
                }));
                const otherImposts = next.imposts.filter((i) => i.orientation !== 'horizontal');
                next = { ...next, imposts: [...otherImposts, ...newHorImposts] };
              }
            }
          }

          if (!orientation || orientation === 'vertical') {
            // Распределяем вертикали в каждой полосе (или конкретно в rowIdx)
            const rowsToBalance = rowIdx !== undefined
              ? [rowIdx]
              : Array.from(new Set(
                  next.imposts
                    .filter((i) => i.orientation === 'vertical')
                    .map((i) => i.belongsToRow ?? 0)
                ));

            for (const ri of rowsToBalance) {
              const vertsInRow = next.imposts
                .filter((i) => i.orientation === 'vertical' && (i.belongsToRow ?? 0) === ri)
                .sort((a, b) => a.position - b.position);
              if (vertsInRow.length === 0) continue;
              const positions = evenImpostPositions(vertsInRow.length, next.width);
              if (!positions) continue;
              const newVerts: Impost[] = vertsInRow.map((imp, i) => ({
                ...imp, position: positions[i]!, belongsToRow: ri,
              }));
              const otherImposts = next.imposts.filter((i) =>
                i.orientation !== 'vertical' || (i.belongsToRow ?? 0) !== ri
              );
              next = { ...next, imposts: [...otherImposts, ...newVerts] };
            }
          }

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

  setCellMosquito: (projectId, segmentId, frameId, cellId, mosquito) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) =>
          updCell(f, cellId, (c) => ({ ...c, mosquito: mosquito ?? undefined }))
        )
      )
    );
    set({ data });
    if (!get().orderId) saveDraft(data);
  },

  setCellHardware: (projectId, segmentId, frameId, cellId, hardware) => {
    const data = updProject(get().data, projectId, (p) =>
      updSegment(p, segmentId, (s) =>
        updFrame(s, frameId, (f) =>
          updCell(f, cellId, (c) => ({
            ...c,
            hardware: hardware.length > 0 ? hardware : undefined,
          }))
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

/**
 * Возвращает список горизонтальных границ полос рамы (от низа), включая 0 и frame.height.
 * Например, если есть 1 горизонтальный импост на 700 — вернёт [0, 700, 1400].
 * Если горизонтальных импостов нет — вернёт [0, frame.height] (одна полоса).
 */
function getRowBoundaries(frame: Frame): number[] {
  const horizontals = frame.imposts
    .filter((i) => i.orientation === 'horizontal')
    .map((i) => i.position)
    .sort((a, b) => a - b);
  return [0, ...horizontals, frame.height];
}

/**
 * Возвращает Y-границы полосы по индексу (от низа): { yBottom, yTop }
 * (yBottom = низ полосы относительно низа рамы, yTop = верх).
 */
export function getRowYRange(frame: Frame, rowIdx: number): { yBottom: number; yTop: number } {
  const b = getRowBoundaries(frame);
  return {
    yBottom: b[rowIdx] ?? 0,
    yTop: b[rowIdx + 1] ?? frame.height,
  };
}

/**
 * Определяет в какую горизонтальную полосу (rowIdx, нумерация снизу вверх)
 * попадает Y-координата (от низа рамы).
 */
export function findRowIdxByY(frame: Frame, y: number): number {
  const b = getRowBoundaries(frame);
  for (let i = 0; i < b.length - 1; i++) {
    if (y >= b[i]! && y <= b[i + 1]!) return i;
  }
  return 0;
}

function rebuildFrameCells(frame: Frame): Frame {
  // 1. Находим горизонтальные границы полос (стопкой снизу вверх)
  const yBoundaries = getRowBoundaries(frame);
  // Защита от мусорных позиций — фильтруем дубли и значения вне рамы
  const uniqY = yBoundaries
    .filter((v, i, a) => i === 0 || v - a[i - 1]! > 0.5)
    .filter((v) => v >= 0 && v <= frame.height + 0.5);

  const oldCells = frame.cells;
  const newCells: Cell[] = [];

  // 2. Для каждой полосы строим её собственную сетку
  for (let rowIdx = 0; rowIdx < uniqY.length - 1; rowIdx++) {
    const yBottom = uniqY[rowIdx]!;
    const yTop = uniqY[rowIdx + 1]!;
    const rowH = yTop - yBottom;
    if (rowH <= 0) continue;

    // Вертикальные импосты ЭТОЙ полосы
    // belongsToRow не задано (старые данные) → считаем что в полосе 0
    const verticalsInRow = frame.imposts
      .filter((i) => i.orientation === 'vertical')
      .filter((i) => (i.belongsToRow ?? 0) === rowIdx)
      .map((i) => i.position)
      .sort((a, b) => a - b);

    const xs = [0, frame.width, ...verticalsInRow];
    const uniqX = xs
      .sort((a, b) => a - b)
      .filter((v, i, a) => i === 0 || v - a[i - 1]! > 0.5)
      .filter((v) => v >= 0 && v <= frame.width + 0.5);

    // 3. Создаём ячейки для этой полосы
    for (let xi = 0; xi < uniqX.length - 1; xi++) {
      const x = uniqX[xi]!;
      const w = uniqX[xi + 1]! - x;
      if (w <= 0) continue;

      // Наследуем sash от старой ячейки по центру
      const cx = x + w / 2;
      const cy = yBottom + rowH / 2;
      const inherited = oldCells.find((c) =>
        cx >= c.x && cx <= c.x + c.width &&
        cy >= c.y && cy <= c.y + c.height
      );

      newCells.push({
        id: uid(),
        x, y: yBottom,
        width: w, height: rowH,
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
