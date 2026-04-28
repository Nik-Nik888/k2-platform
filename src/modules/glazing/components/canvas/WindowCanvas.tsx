import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { GlazingProject, Segment, Frame } from '../../types';
import { FrameShape } from './FrameShape';
import { CornerJoint } from './CornerJoint';
import { DimensionLabel } from './DimensionLabel';
import { sectionWidths } from '../../logic/distribute';
import { getRowYRange, findRowIdxByY } from '../../store/glazingStore';

// ═══════════════════════════════════════════════════════════════════
// WindowCanvas — главный SVG-редактор окна.
//
// Вариант А: все сегменты разворачиваются в одну прямую линию,
// между ними — стыки (CornerJoint) с подписью угла.
//
// Координаты модели — миллиметры.
// ═══════════════════════════════════════════════════════════════════

const PADDING = 800;
const DIM_OFFSET_BOTTOM = 200;
const DIM_OFFSET_LEFT = 350;
const BONE_WIDTH = 50;
const CORNER_GAP = 200;

const COLOR_DIM_LINE = '#94a3b8';
const COLOR_BONE = '#1e293b';

interface FrameLayoutItem {
  type: 'frame';
  segment: Segment;
  frame: Frame;
  segmentIdx: number;
  frameIdx: number;
  offsetX: number;
  width: number;
}

interface BoneLayoutItem {
  type: 'bone';
  segmentIdx: number;
  boneIdx: number;
  offsetX: number;
  width: number;
}

interface CornerLayoutItem {
  type: 'corner';
  cornerIdx: number;
  offsetX: number;
  width: number;
}

type LayoutItem = FrameLayoutItem | BoneLayoutItem | CornerLayoutItem;

interface WindowCanvasProps {
  project: GlazingProject;
  activeCellId?: string | null;
  /** ID активной рамы — для подсветки и показа управляющих кнопок. */
  activeFrameId?: string | null;

  onCellClick?: (segmentId: string, frameId: string, cellId: string) => void;
  onCellEditClick?: (segmentId: string, frameId: string, cellId: string) => void;
  onImpostClick?: (segmentId: string, frameId: string, impostId: string) => void;
  onBoneClick?: (segmentId: string, boneId: string) => void;
  onCornerClick?: (cornerIdx: number) => void;

  onChangeFrameWidth?: (segmentId: string, frameId: string, width: number) => void;
  onChangeSegmentHeight?: (segmentId: string, side: 'left' | 'right' | 'both', value: number) => void;
  onChangeSegmentTotalWidth?: (segmentId: string, totalWidth: number) => void;
  onAddBoneAt?: (segmentId: string, afterFrameIndex: number) => void;
  /** Большой плюс слева/справа от сегмента — добавить раму с этой стороны без кости. */
  onAddFrameToSide?: (segmentId: string, side: 'start' | 'end') => void;
  /**
   * Изменить ширину секции внутри рамы (между импостами).
   * sectionIdx — индекс секции в активной полосе (для вертикальных) или просто индекс (для горизонтальных).
   * rowIdx — индекс активной полосы (для вертикальных секций).
   */
  onChangeSection?: (
    segmentId: string, frameId: string,
    orientation: 'vertical' | 'horizontal',
    sectionIdx: number,
    newSize: number,
    rowIdx?: number,
  ) => void;
  /** Сбросить закрепы секций — равномерно распределить заново. */
  onResetSectionLocks?: (
    segmentId: string, frameId: string,
    orientation: 'vertical' | 'horizontal',
    rowIdx?: number,
  ) => void;

  heightPx?: number;
}

export function WindowCanvas({
  project, activeCellId, activeFrameId,
  onCellClick, onCellEditClick, onImpostClick, onBoneClick, onCornerClick,
  onChangeFrameWidth, onChangeSegmentHeight, onChangeSegmentTotalWidth,
  onAddBoneAt, onAddFrameToSide, onChangeSection, onResetSectionLocks,
  heightPx,
}: WindowCanvasProps) {

  const layout = useMemo(() => {
    const items: LayoutItem[] = [];
    let cursor = 0;

    for (let segIdx = 0; segIdx < project.segments.length; segIdx++) {
      const seg = project.segments[segIdx]!;

      for (let i = 0; i < seg.frames.length; i++) {
        const f = seg.frames[i]!;
        items.push({
          type: 'frame',
          segment: seg, frame: f,
          segmentIdx: segIdx, frameIdx: i,
          offsetX: cursor, width: f.width,
        });
        cursor += f.width;

        const bone = seg.bones.find((b) => b.afterFrameIndex === i);
        if (bone && i < seg.frames.length - 1) {
          const boneIdx = seg.bones.indexOf(bone);
          items.push({
            type: 'bone',
            segmentIdx: segIdx, boneIdx,
            offsetX: cursor, width: BONE_WIDTH,
          });
          cursor += BONE_WIDTH;
        }
      }

      // Стык со следующим сегментом
      if (segIdx < project.segments.length - 1) {
        items.push({
          type: 'corner',
          cornerIdx: segIdx,
          offsetX: cursor + CORNER_GAP / 2,
          width: CORNER_GAP,
        });
        cursor += CORNER_GAP;
      }
    }

    return { items, totalWidth: cursor };
  }, [project]);

  const maxSegmentHeight = useMemo(() => {
    let max = 1400;
    for (const seg of project.segments) {
      max = Math.max(max, seg.heightLeft, seg.heightRight);
    }
    return max;
  }, [project]);

  const projectW = layout.totalWidth || 1500;
  const projectH = maxSegmentHeight;

  const vbX = -PADDING;
  const vbY = -PADDING;
  const vbW = projectW + PADDING * 2;
  const vbH = projectH + PADDING * 2;

  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const effVbW = vbW / zoom;
  const effVbH = vbH / zoom;
  const effVbX = vbX + (vbW - effVbW) / 2 + panX;
  const effVbY = vbY + (vbH - effVbH) / 2 + panY;

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (zoom <= 1) return;
    const target = e.target as Element;
    if (target.closest('[data-interactive]')) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX, panY };
    svgRef.current?.setPointerCapture(e.pointerId);
  }, [zoom, panX, panY]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = effVbW / rect.width;
    const scaleY = effVbH / rect.height;
    const dxPx = e.clientX - dragRef.current.startX;
    const dyPx = e.clientY - dragRef.current.startY;
    setPanX(dragRef.current.panX - dxPx * scaleX);
    setPanY(dragRef.current.panY - dyPx * scaleY);
  }, [effVbW, effVbH]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      svgRef.current?.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }, []);

  useEffect(() => {
    setZoom(1); setPanX(0); setPanY(0);
  }, [project.id]);

  if (project.segments.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
        Нет сегментов в проекте
      </div>
    );
  }

  return (
    <div
      className="relative w-full bg-white rounded-lg overflow-hidden"
      style={{ height: heightPx ?? '100%', minHeight: 320 }}
    >
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 bg-white/90 backdrop-blur rounded-lg shadow-md p-1">
        <button onClick={() => setZoom((z) => Math.min(z + 0.5, 5))}
          className="p-2 rounded-md hover:bg-surface-100 text-gray-700"
          title="Увеличить">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(z - 0.5, 1))}
          className="p-2 rounded-md hover:bg-surface-100 text-gray-700"
          title="Уменьшить">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={() => { setZoom(1); setPanX(0); setPanY(0); }}
          className="p-2 rounded-md hover:bg-surface-100 text-gray-700"
          title="По размеру экрана">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {zoom !== 1 && (
        <div className="absolute top-3 left-3 z-10 px-2 py-1 bg-white/90 backdrop-blur rounded-md shadow text-xs text-gray-600">
          {Math.round(zoom * 100)}%
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`${effVbX} ${effVbY} ${effVbW} ${effVbH}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        style={{
          touchAction: zoom > 1 ? 'none' : 'auto',
          cursor: zoom > 1 ? (dragRef.current ? 'grabbing' : 'grab') : 'default',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Скос крыши для каждого сегмента */}
        {project.segments.map((seg, segIdx) => {
          if (seg.heightLeft === seg.heightRight) return null;
          const segItems = layout.items.filter(
            (it) => (it.type === 'frame' || it.type === 'bone') && it.segmentIdx === segIdx
          );
          if (segItems.length === 0) return null;
          const startX = segItems[0]!.offsetX;
          const lastItem = segItems[segItems.length - 1]!;
          const endX = lastItem.offsetX + lastItem.width;
          const yLeft = projectH - seg.heightLeft;
          const yRight = projectH - seg.heightRight;
          return (
            <polyline
              key={`slope-${seg.id}`}
              points={`${startX},${yLeft} ${endX},${yRight}`}
              fill="none" stroke="#94a3b8" strokeWidth={3}
              strokeDasharray="10 5" pointerEvents="none"
            />
          );
        })}

        {/* Подсветка активной рамы (без крестика — удаление через тулбар) */}
        {activeFrameId && (() => {
          const activeItem = layout.items.find(
            (it) => it.type === 'frame' && it.frame.id === activeFrameId
          ) as FrameLayoutItem | undefined;
          if (!activeItem) return null;
          const f = activeItem.frame;
          const svgYofFrameTop = projectH - f.height;
          return (
            <g pointerEvents="none">
              <rect
                x={activeItem.offsetX - 8}
                y={svgYofFrameTop - 8}
                width={f.width + 16}
                height={f.height + 16}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={6}
                strokeDasharray="20 12"
                rx={4}
              />
            </g>
          );
        })()}

        {/* Подписи секций для АКТИВНОЙ рамы (между импостами) */}
        {activeFrameId && (() => {
          const activeItem = layout.items.find(
            (it) => it.type === 'frame' && it.frame.id === activeFrameId
          ) as FrameLayoutItem | undefined;
          if (!activeItem) return null;
          const f = activeItem.frame;

          // Определяем активную полосу по активной ячейке
          // (если активной ячейки нет — берём полосу 0)
          const horImposts = f.imposts
            .filter((i) => i.orientation === 'horizontal')
            .sort((a, b) => a.position - b.position);

          let activeRow = 0;
          if (activeCellId) {
            const cell = f.cells.find((c) => c.id === activeCellId);
            if (cell) {
              const cy = cell.y + cell.height / 2;
              for (let i = 0; i < horImposts.length; i++) {
                if (cy > horImposts[i]!.position) activeRow = i + 1;
              }
            }
          }

          // ── Горизонтальные секции (подписи СЛЕВА от рамы) ──
          // Это позиции горизонтальных импостов, всегда показываем все
          const horSections = sectionWidths(
            f.imposts.filter((i) => i.orientation === 'horizontal'),
            'horizontal', f.height
          );

          // ── Вертикальные секции — ТОЛЬКО в активной полосе ──
          const vertImpostsInRow = f.imposts
            .filter((i) => i.orientation === 'vertical' && (i.belongsToRow ?? 0) === activeRow)
            .sort((a, b) => a.position - b.position);
          const vertSections = sectionWidths(
            vertImpostsInRow, 'vertical', f.width
          );

          const SECTION_LABEL_OFFSET = 130;
          const sectionLabelY = projectH + 70;
          const sectionLabelX = activeItem.offsetX - SECTION_LABEL_OFFSET;

          return (
            <g>
              {/* ─── Вертикальные секции активной полосы ─────────── */}
              {vertSections.length > 1 && vertSections.map((w, i) => {
                const sectionStart = i === 0 ? 0 : vertImpostsInRow[i - 1]!.position;
                const cx = activeItem.offsetX + sectionStart + w / 2;
                return (
                  <g key={`v-section-${activeRow}-${i}`} pointerEvents="auto" data-interactive>
                    <DimensionLabel
                      x={cx}
                      y={sectionLabelY}
                      value={w}
                      onChange={onChangeSection
                        ? (v) => onChangeSection(activeItem.segment.id, f.id, 'vertical', i, v, activeRow)
                        : undefined}
                      min={200} max={3000}
                    />
                  </g>
                );
              })}

              {/* ─── Горизонтальные секции (общие для рамы) ──────── */}
              {horSections.length > 1 && horSections.map((h, i) => {
                let sectionStartFromBottom = 0;
                if (i > 0) sectionStartFromBottom = horImposts[i - 1]!.position;
                const cyFromBottom = sectionStartFromBottom + h / 2;
                const cySvg = projectH - cyFromBottom;
                return (
                  <g key={`h-section-${i}`} pointerEvents="auto" data-interactive>
                    <DimensionLabel
                      x={sectionLabelX}
                      y={cySvg}
                      value={h}
                      onChange={onChangeSection
                        ? (v) => onChangeSection(activeItem.segment.id, f.id, 'horizontal', i, v)
                        : undefined}
                      min={200} max={3500}
                    />
                  </g>
                );
              })}

              {/* ─── Кнопка "выровнять" вертикальные секции ──────── */}
              {vertSections.length > 1 && onResetSectionLocks && (
                <ResetLocksButton
                  cx={activeItem.offsetX + activeItem.width + 200}
                  cy={sectionLabelY}
                  label="↻ Выровнять"
                  onClick={() => onResetSectionLocks(activeItem.segment.id, f.id, 'vertical', activeRow)}
                />
              )}
              {/* ─── Кнопка "выровнять" горизонтальные секции ──────── */}
              {horSections.length > 1 && onResetSectionLocks && (
                <ResetLocksButton
                  cx={sectionLabelX}
                  cy={projectH - f.height - 150}
                  label="↻ Выровнять"
                  onClick={() => onResetSectionLocks(activeItem.segment.id, f.id, 'horizontal')}
                />
              )}
            </g>
          );
        })()}

        {/* Layout: рамы, кости, стыки */}
        {layout.items.map((it) => {
          if (it.type === 'frame') {
            const svgYofFrameTop = projectH - it.frame.height;

            // Если это активная рама — определяем активную полосу
            // и передаём её Y-диапазон в FrameShape для голубой подсветки
            let activeRowYRange: { yBottom: number; yTop: number } | null = null;
            if (it.frame.id === activeFrameId && activeCellId) {
              const activeCell = it.frame.cells.find((c) => c.id === activeCellId);
              if (activeCell) {
                const cellCenterY = activeCell.y + activeCell.height / 2;
                const rowIdx = findRowIdxByY(it.frame, cellCenterY);
                activeRowYRange = getRowYRange(it.frame, rowIdx);
              }
            }

            return (
              <g key={`frame-${it.frame.id}`} data-interactive>
                <FrameShape
                  frame={it.frame}
                  offsetX={it.offsetX}
                  offsetY={svgYofFrameTop}
                  activeCellId={activeCellId}
                  activeRowYRange={activeRowYRange}
                  onCellClick={onCellClick
                    ? (cellId) => onCellClick(it.segment.id, it.frame.id, cellId)
                    : undefined}
                  onCellEditClick={onCellEditClick
                    ? (cellId) => onCellEditClick(it.segment.id, it.frame.id, cellId)
                    : undefined}
                  onImpostClick={onImpostClick
                    ? (impostId) => onImpostClick(it.segment.id, it.frame.id, impostId)
                    : undefined}
                />
              </g>
            );
          }

          if (it.type === 'bone') {
            const seg = project.segments[it.segmentIdx]!;
            const bone = seg.bones[it.boneIdx]!;
            const segH = Math.max(seg.heightLeft, seg.heightRight);
            return (
              <BoneShape
                key={`bone-${bone.id}`}
                x={it.offsetX}
                y={projectH - segH}
                width={it.width}
                height={segH}
                onClick={onBoneClick ? () => onBoneClick(seg.id, bone.id) : undefined}
              />
            );
          }

          // corner
          const corner = project.corners[it.cornerIdx]!;
          const segLeft = project.segments[it.cornerIdx];
          const segRight = project.segments[it.cornerIdx + 1];
          const segH = Math.max(
            segLeft ? Math.max(segLeft.heightLeft, segLeft.heightRight) : 0,
            segRight ? Math.max(segRight.heightLeft, segRight.heightRight) : 0,
          ) || projectH;
          return (
            <CornerJoint
              key={`corner-${corner.id}`}
              corner={corner}
              x={it.offsetX}
              segmentHeight={segH}
              bottomY={projectH}
              onClick={onCornerClick ? () => onCornerClick(it.cornerIdx) : undefined}
            />
          );
        })}

        {/* Чёрточки-указатели на стыке двух рам без кости/угла.
            Тонкие вертикальные линии чуть выше и ниже рам — показывают
            что это две независимые рамы, а не одна. */}
        {project.segments.map((seg, segIdx) =>
          seg.frames.map((_, fIdx) => {
            if (fIdx >= seg.frames.length - 1) return null;
            // Если кость в этом месте уже есть — стык виден через кость
            if (seg.bones.some((b) => b.afterFrameIndex === fIdx)) return null;

            const frameItem = layout.items.find(
              (it) => it.type === 'frame' && it.segmentIdx === segIdx && it.frameIdx === fIdx
            ) as FrameLayoutItem | undefined;
            if (!frameItem) return null;

            const x = frameItem.offsetX + frameItem.width;
            const segH = Math.max(seg.heightLeft, seg.heightRight);
            const yTop = projectH - segH;
            const yBottom = projectH;
            const STICK_OUT = 150; // мм за пределы рам сверху и снизу

            return (
              <g key={`stub-${seg.id}-${fIdx}`} pointerEvents="none">
                <line
                  x1={x} y1={yTop - STICK_OUT}
                  x2={x} y2={yTop - 30}
                  stroke="#475569" strokeWidth={3}
                />
                <line
                  x1={x} y1={yBottom + 30}
                  x2={x} y2={yBottom + STICK_OUT}
                  stroke="#475569" strokeWidth={3}
                />
              </g>
            );
          })
        )}

        {/* Значки ⊕ — между рамами в сегменте, где НЕТ кости. */}
        {/* Тап = открыть попап (Кость или Поворот). */}
        {onAddBoneAt && project.segments.map((seg, segIdx) =>
          seg.frames.map((_, fIdx) => {
            // Только между соседними рамами (после рамы fIdx)
            if (fIdx >= seg.frames.length - 1) return null;
            // Если кость в этом месте уже есть — пропускаем
            if (seg.bones.some((b) => b.afterFrameIndex === fIdx)) return null;

            // Найдём X-позицию: правый край рамы fIdx в сегменте segIdx
            const frameItem = layout.items.find(
              (it) => it.type === 'frame' && it.segmentIdx === segIdx && it.frameIdx === fIdx
            ) as FrameLayoutItem | undefined;
            if (!frameItem) return null;
            const x = frameItem.offsetX + frameItem.width;
            const segH = Math.max(seg.heightLeft, seg.heightRight);
            const cy = projectH - segH / 2;

            return (
              <AddBoneButton
                key={`add-bone-${seg.id}-${fIdx}`}
                cx={x}
                cy={cy}
                onClick={() => onAddBoneAt(seg.id, fIdx)}
              />
            );
          })
        )}

        {/* Большие голубые плюсы — только по внешним краям всего проекта.
            Между сегментами с углом плюсы не нужны (там уже стоит угол). */}
        {onAddFrameToSide && project.segments.map((seg, segIdx) => {
          const isFirstSegment = segIdx === 0;
          const isLastSegment = segIdx === project.segments.length - 1;
          if (!isFirstSegment && !isLastSegment) return null;

          const segFrames = layout.items.filter(
            (it) => it.type === 'frame' && it.segmentIdx === segIdx
          ) as FrameLayoutItem[];
          if (segFrames.length === 0) return null;
          const first = segFrames[0]!;
          const last = segFrames[segFrames.length - 1]!;
          const segH = Math.max(seg.heightLeft, seg.heightRight);
          const cy = projectH - segH / 2;
          const SIDE_OFFSET = 200;

          return (
            <g key={`add-side-${seg.id}`}>
              {isFirstSegment && (
                <AddFrameSideButton
                  cx={first.offsetX - SIDE_OFFSET}
                  cy={cy}
                  onClick={() => onAddFrameToSide(seg.id, 'start')}
                />
              )}
              {isLastSegment && (
                <AddFrameSideButton
                  cx={last.offsetX + last.width + SIDE_OFFSET}
                  cy={cy}
                  onClick={() => onAddFrameToSide(seg.id, 'end')}
                />
              )}
            </g>
          );
        })}

        <DimensionsBottom
          items={layout.items}
          baseY={projectH + DIM_OFFSET_BOTTOM}
          segments={project.segments}
          onChangeFrameWidth={onChangeFrameWidth}
          onChangeSegmentTotalWidth={onChangeSegmentTotalWidth}
        />

        <DimensionsLeft
          segments={project.segments}
          layoutItems={layout.items}
          baseX={-DIM_OFFSET_LEFT}
          totalHeight={projectH}
          onChangeHeight={onChangeSegmentHeight}
        />
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════

function BoneShape({ x, y, width, height, onClick }: {
  x: number; y: number; width: number; height: number;
  onClick?: () => void;
}) {
  return (
    <g
      data-interactive
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <rect x={x} y={y} width={width} height={height}
        fill={COLOR_BONE} stroke={COLOR_BONE} strokeWidth={1} />
      <line
        x1={x + width / 2} y1={y}
        x2={x + width / 2} y2={y + height}
        stroke="#475569" strokeWidth={2}
      />
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AddBoneButton — значок ⊕ между рамами для добавления кости.
// Видим всегда (не на hover) — так удобнее для тачскринов.
// ═══════════════════════════════════════════════════════════════════

function AddBoneButton({ cx, cy, onClick }: {
  cx: number; cy: number; onClick: () => void;
}) {
  const R = 70;       // радиус круга в мм
  const TICK = 35;    // длина чёрточки + и - в круге
  return (
    <g
      data-interactive
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {/* Круг с заливкой */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="#fff7ed"
        stroke="#f97316"
        strokeWidth={4}
        opacity={0.85}
      />
      {/* Плюсик */}
      <line
        x1={cx - TICK} y1={cy} x2={cx + TICK} y2={cy}
        stroke="#ea580c" strokeWidth={8} strokeLinecap="round"
      />
      <line
        x1={cx} y1={cy - TICK} x2={cx} y2={cy + TICK}
        stroke="#ea580c" strokeWidth={8} strokeLinecap="round"
      />
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AddFrameSideButton — большой плюс по краю сегмента для добавления
// новой рамы слева/справа без кости. Цвет — голубой (как стекло).
// ═══════════════════════════════════════════════════════════════════

function AddFrameSideButton({ cx, cy, onClick }: {
  cx: number; cy: number; onClick: () => void;
}) {
  const R = 130;      // крупнее чем AddBoneButton — главная кнопка
  const TICK = 65;
  return (
    <g
      data-interactive
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <circle
        cx={cx} cy={cy} r={R}
        fill="#bfdbfe"
        stroke="#3b82f6"
        strokeWidth={6}
        opacity={0.9}
      />
      <line
        x1={cx - TICK} y1={cy} x2={cx + TICK} y2={cy}
        stroke="#1d4ed8" strokeWidth={14} strokeLinecap="round"
      />
      <line
        x1={cx} y1={cy - TICK} x2={cx} y2={cy + TICK}
        stroke="#1d4ed8" strokeWidth={14} strokeLinecap="round"
      />
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ResetLocksButton — кнопка "выровнять секции" (сбрасывает закрепы).
// Рядом с подписями секций активной рамы.
// ═══════════════════════════════════════════════════════════════════

function ResetLocksButton({ cx, cy, label, onClick }: {
  cx: number; cy: number; label: string; onClick: () => void;
}) {
  const W = 280;
  const H = 75;
  return (
    <g
      data-interactive
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={cx - W / 2} y={cy - H / 2}
        width={W} height={H}
        rx={H / 2} ry={H / 2}
        fill="#f0fdf4"
        stroke="#16a34a"
        strokeWidth={3}
      />
      <text
        x={cx} y={cy}
        fontSize={42}
        fontFamily="Inter, system-ui, sans-serif"
        fill="#15803d"
        textAnchor="middle"
        dominantBaseline="middle"
        fontWeight={600}
      >
        {label}
      </text>
    </g>
  );
}

function DimensionsBottom({
  items, baseY, segments, onChangeFrameWidth, onChangeSegmentTotalWidth,
}: {
  items: LayoutItem[];
  baseY: number;
  segments: Segment[];
  onChangeFrameWidth?: (segmentId: string, frameId: string, width: number) => void;
  onChangeSegmentTotalWidth?: (segmentId: string, totalWidth: number) => void;
}) {
  // Группируем элементы по сегментам — для каждого сегмента нужны
  // отдельные подписи рам + одна подпись общего размера сегмента.
  const segGroups = new Map<number, { startX: number; endX: number; segId: string; total: number }>();

  // Подписи отдельных рам
  const frameLabels: React.ReactElement[] = [];
  for (const it of items) {
    if (it.type === 'frame') {
      const cx = it.offsetX + it.width / 2;
      // Тики
      frameLabels.push(
        <g key={`tick-${it.frame.id}`}>
          <line x1={it.offsetX} y1={baseY - 75}
            x2={it.offsetX} y2={baseY - 45}
            stroke={COLOR_DIM_LINE} strokeWidth={1} />
          <line x1={it.offsetX + it.width} y1={baseY - 75}
            x2={it.offsetX + it.width} y2={baseY - 45}
            stroke={COLOR_DIM_LINE} strokeWidth={1} />
        </g>
      );
      // Подпись (редактируемая)
      frameLabels.push(
        <g key={`dim-w-${it.frame.id}`} pointerEvents="auto" data-interactive>
          <DimensionLabel
            x={cx} y={baseY - 60}
            value={it.frame.width}
            onChange={onChangeFrameWidth
              ? (v) => onChangeFrameWidth(it.segment.id, it.frame.id, v)
              : undefined}
            min={300} max={3000}
          />
        </g>
      );
      // Обновляем границы группы сегмента
      const existing = segGroups.get(it.segmentIdx);
      if (!existing) {
        segGroups.set(it.segmentIdx, {
          startX: it.offsetX,
          endX: it.offsetX + it.width,
          segId: it.segment.id,
          total: it.width,
        });
      } else {
        existing.endX = it.offsetX + it.width;
      }
    } else if (it.type === 'bone') {
      // Кость тоже включаем в endX сегмента
      const existing = segGroups.get(it.segmentIdx);
      if (existing) {
        existing.endX = it.offsetX + it.width;
      }
    }
  }

  // Вычисляем total для каждого сегмента (из текущей модели)
  segments.forEach((seg, segIdx) => {
    const grp = segGroups.get(segIdx);
    if (!grp) return;
    const framesSum = seg.frames.reduce((s, f) => s + f.width, 0);
    const bonesSum = seg.bones.length * 20; // BONE_PHYSICAL_WIDTH = 20мм
    grp.total = framesSum + bonesSum;
  });

  return (
    <g pointerEvents="none">
      {/* Линия для отдельных рам (на всю развёртку) */}
      {(() => {
        const xs: number[] = [];
        for (const [, grp] of segGroups) {
          xs.push(grp.startX, grp.endX);
        }
        if (xs.length === 0) return null;
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        return (
          <line x1={minX} y1={baseY - 60} x2={maxX} y2={baseY - 60}
            stroke={COLOR_DIM_LINE} strokeWidth={1} />
        );
      })()}

      {frameLabels}

      {/* Общий размер каждого сегмента — отдельно, под общей линией */}
      {Array.from(segGroups.entries()).map(([, grp]) => {
        const cx = (grp.startX + grp.endX) / 2;
        return (
          <g key={`seg-total-${grp.segId}`}>
            <line x1={grp.startX} y1={baseY + 60} x2={grp.endX} y2={baseY + 60}
              stroke={COLOR_DIM_LINE} strokeWidth={1} />
            <line x1={grp.startX} y1={baseY + 45} x2={grp.startX} y2={baseY + 75}
              stroke={COLOR_DIM_LINE} strokeWidth={1} />
            <line x1={grp.endX} y1={baseY + 45} x2={grp.endX} y2={baseY + 75}
              stroke={COLOR_DIM_LINE} strokeWidth={1} />
            <g pointerEvents="auto" data-interactive>
              <DimensionLabel
                x={cx} y={baseY + 60}
                value={grp.total}
                onChange={onChangeSegmentTotalWidth
                  ? (v) => onChangeSegmentTotalWidth(grp.segId, v)
                  : undefined}
                min={500} max={20000}
                bold
              />
            </g>
          </g>
        );
      })}
    </g>
  );
}

function DimensionsLeft({
  segments, layoutItems, baseX, totalHeight, onChangeHeight,
}: {
  segments: Segment[];
  layoutItems: LayoutItem[];
  baseX: number;
  totalHeight: number;
  onChangeHeight?: (segmentId: string, side: 'left' | 'right' | 'both', value: number) => void;
}) {
  if (segments.length === 1) {
    const seg = segments[0]!;
    const showBoth = seg.heightLeft !== seg.heightRight;
    const yTopLeft = totalHeight - seg.heightLeft;

    return (
      <g pointerEvents="none">
        <line x1={baseX} y1={yTopLeft} x2={baseX} y2={totalHeight}
          stroke={COLOR_DIM_LINE} strokeWidth={1} />
        <line x1={baseX - 15} y1={yTopLeft} x2={baseX + 15} y2={yTopLeft}
          stroke={COLOR_DIM_LINE} strokeWidth={1} />
        <line x1={baseX - 15} y1={totalHeight} x2={baseX + 15} y2={totalHeight}
          stroke={COLOR_DIM_LINE} strokeWidth={1} />

        <g pointerEvents="auto" data-interactive>
          <DimensionLabel
            x={baseX} y={yTopLeft + seg.heightLeft / 2}
            value={seg.heightLeft}
            onChange={onChangeHeight ? (v) => onChangeHeight(seg.id, showBoth ? 'left' : 'both', v) : undefined}
            min={500} max={3500}
          />
        </g>

        {showBoth && (
          <g pointerEvents="auto" data-interactive>
            <DimensionLabel
              x={baseX} y={yTopLeft + seg.heightLeft / 2 + 130}
              value={seg.heightRight}
              onChange={onChangeHeight ? (v) => onChangeHeight(seg.id, 'right', v) : undefined}
              min={500} max={3500}
            />
          </g>
        )}
      </g>
    );
  }

  // Несколько сегментов: для каждого подпись над серединой
  return (
    <g pointerEvents="none">
      {segments.map((seg, segIdx) => {
        const segItems = layoutItems.filter(
          (it) => (it.type === 'frame' || it.type === 'bone') && it.segmentIdx === segIdx
        );
        if (segItems.length === 0) return null;
        const startX = segItems[0]!.offsetX;
        const lastItem = segItems[segItems.length - 1]!;
        const endX = lastItem.offsetX + lastItem.width;
        const cx = (startX + endX) / 2;

        const segH = Math.max(seg.heightLeft, seg.heightRight);
        const yTop = totalHeight - segH;

        return (
          <g key={`dim-h-${seg.id}`} pointerEvents="auto" data-interactive>
            <line
              x1={cx - 80} y1={yTop - 100}
              x2={cx + 80} y2={yTop - 100}
              stroke={COLOR_DIM_LINE} strokeWidth={1}
              pointerEvents="none"
            />
            <DimensionLabel
              x={cx} y={yTop - 100}
              value={segH}
              onChange={onChangeHeight ? (v) => onChangeHeight(seg.id, 'both', v) : undefined}
              min={500} max={3500}
            />
          </g>
        );
      })}
    </g>
  );
}
