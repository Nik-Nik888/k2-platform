import type { GlazingProject, Frame, Cell, Impost } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// ProjectThumbnail — миниатюрное SVG-превью проекта остекления.
//
// Используется в карточках ленты WindowsStrip. Рисует упрощённую
// версию канваса: рамы, импосты, ячейки, кости, угловые соединители.
// Без подписей, без интерактивности, без декора (зум, плюсы и т.п.).
//
// Превью авто-масштабируется под заданный размер контейнера через
// SVG viewBox. Соотношение сторон проекта сохраняется.
// ═══════════════════════════════════════════════════════════════════

interface ProjectThumbnailProps {
  project: GlazingProject;
  /** Ширина контейнера в px. */
  width?: number;
  /** Высота контейнера в px. */
  height?: number;
  /** Цвет рамы. По умолчанию тёмно-серый. */
  frameColor?: string;
  /** Цвет стекла. По умолчанию голубой. */
  glassColor?: string;
}

const FRAME_THICKNESS = 70;       // мм (как в FrameShape)
const IMPOST_THICKNESS = 80;
const BONE_VISUAL = 50;
const CORNER_GAP = 100;           // визуальный разрыв между сегментами

export function ProjectThumbnail({
  project,
  width = 120,
  height = 70,
  frameColor = '#475569',
  glassColor = '#bfdbfe',
}: ProjectThumbnailProps) {
  // 1. Подсчитываем общую ширину проекта (все сегменты + разрывы между ними)
  let totalWidth = 0;
  let maxHeight = 0;
  for (let i = 0; i < project.segments.length; i++) {
    const seg = project.segments[i]!;
    let segW = 0;
    let segH = 0;
    for (const f of seg.frames) {
      segW += f.width;
      segH = Math.max(segH, f.height);
    }
    // Кости между рамами
    segW += seg.bones.length * BONE_VISUAL;
    totalWidth += segW;
    if (i < project.segments.length - 1) totalWidth += CORNER_GAP;
    maxHeight = Math.max(maxHeight, segH);
  }
  if (totalWidth === 0 || maxHeight === 0) {
    return (
      <svg width={width} height={height} viewBox="0 0 100 60" />
    );
  }

  // 2. Запас по краям — небольшой padding
  const PAD = 100;
  const vbW = totalWidth + PAD * 2;
  const vbH = maxHeight + PAD * 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      {(() => {
        const elements: React.ReactElement[] = [];
        let cursorX = PAD;
        const baseY = PAD;

        for (let segIdx = 0; segIdx < project.segments.length; segIdx++) {
          const seg = project.segments[segIdx]!;

          // Рамы и кости в порядке
          for (let fIdx = 0; fIdx < seg.frames.length; fIdx++) {
            const frame = seg.frames[fIdx]!;
            const frameY = baseY + (maxHeight - frame.height); // выравниваем по нижнему краю
            elements.push(
              <FrameMini
                key={`f-${segIdx}-${fIdx}`}
                frame={frame}
                x={cursorX}
                y={frameY}
                frameColor={frameColor}
                glassColor={glassColor}
              />
            );
            cursorX += frame.width;

            // Кость после этой рамы?
            const bone = seg.bones.find((b) => b.afterFrameIndex === fIdx);
            if (bone) {
              elements.push(
                <rect
                  key={`bone-${segIdx}-${fIdx}`}
                  x={cursorX} y={frameY}
                  width={BONE_VISUAL} height={frame.height}
                  fill={frameColor}
                />
              );
              cursorX += BONE_VISUAL;
            }
          }

          // Угловой разрыв между сегментами
          if (segIdx < project.segments.length - 1) {
            // Маленький треугольник как визуальный «угол»
            const tx = cursorX + CORNER_GAP / 2;
            const ty = baseY + maxHeight / 2;
            elements.push(
              <g key={`corner-${segIdx}`}>
                <line
                  x1={cursorX} y1={baseY + maxHeight}
                  x2={cursorX + CORNER_GAP} y2={baseY + maxHeight}
                  stroke={frameColor} strokeWidth={6} strokeDasharray="20 10"
                />
                <circle
                  cx={tx} cy={ty} r={30}
                  fill="#fef3c7" stroke="#f59e0b" strokeWidth={4}
                />
              </g>
            );
            cursorX += CORNER_GAP;
          }
        }

        return elements;
      })()}
    </svg>
  );
}

// ─── Мини-копия рамы ───────────────────────────────────────────────

function FrameMini({ frame, x, y, frameColor, glassColor }: {
  frame: Frame; x: number; y: number;
  frameColor: string; glassColor: string;
}) {
  return (
    <g>
      {/* Профиль рамы */}
      <rect
        x={x} y={y}
        width={frame.width} height={frame.height}
        fill="#ffffff"
        stroke={frameColor}
        strokeWidth={6}
      />
      {/* Стекло (на всю внутреннюю область) */}
      <rect
        x={x + FRAME_THICKNESS}
        y={y + FRAME_THICKNESS}
        width={frame.width - FRAME_THICKNESS * 2}
        height={frame.height - FRAME_THICKNESS * 2}
        fill={glassColor}
        fillOpacity={0.7}
      />
      {/* Импосты */}
      {frame.imposts.map((imp) => (
        <ImpostMini
          key={imp.id}
          impost={imp}
          frameX={x}
          frameY={y}
          frameW={frame.width}
          frameH={frame.height}
          allImposts={frame.imposts}
          color={frameColor}
        />
      ))}
      {/* Створки в ячейках — простой крестик/треугольник */}
      {frame.cells.map((cell) => (
        <SashMarker
          key={cell.id}
          cell={cell}
          frameX={x}
          frameY={y}
          frameH={frame.height}
          color={frameColor}
        />
      ))}
    </g>
  );
}

function ImpostMini({ impost, frameX, frameY, frameW, frameH, allImposts, color }: {
  impost: Impost;
  frameX: number; frameY: number;
  frameW: number; frameH: number;
  allImposts: Impost[];
  color: string;
}) {
  const half = IMPOST_THICKNESS / 2;
  if (impost.orientation === 'horizontal') {
    // Горизонтальный импост — сквозной по ширине рамы (минус FRAME_THICKNESS с каждой стороны)
    const yPos = frameY + (frameH - impost.position) - half;
    return (
      <rect
        x={frameX + FRAME_THICKNESS}
        y={yPos}
        width={frameW - FRAME_THICKNESS * 2}
        height={IMPOST_THICKNESS}
        fill={color}
      />
    );
  }
  // Вертикальный — обрезается полосами (по belongsToRow)
  const horizontals = allImposts
    .filter((i) => i.orientation === 'horizontal')
    .map((i) => i.position)
    .sort((a, b) => a - b);
  const rowBoundaries = [0, ...horizontals, frameH];
  const rowIdx = impost.belongsToRow ?? 0;
  const rowBottomFromBottom = rowBoundaries[rowIdx] ?? 0;
  const rowTopFromBottom = rowBoundaries[rowIdx + 1] ?? frameH;
  const svgYTop = frameY + (frameH - rowTopFromBottom);
  const svgYBottom = frameY + (frameH - rowBottomFromBottom);
  const insetTop = rowIdx === rowBoundaries.length - 2 ? FRAME_THICKNESS : IMPOST_THICKNESS / 2;
  const insetBottom = rowIdx === 0 ? FRAME_THICKNESS : IMPOST_THICKNESS / 2;
  return (
    <rect
      x={frameX + impost.position - half}
      y={svgYTop + insetTop}
      width={IMPOST_THICKNESS}
      height={(svgYBottom - svgYTop) - insetTop - insetBottom}
      fill={color}
    />
  );
}

function SashMarker({ cell, frameX, frameY, frameH, color }: {
  cell: Cell;
  frameX: number; frameY: number; frameH: number;
  color: string;
}) {
  if (cell.sash === 'fixed') return null;
  // Очень упрощённо — крестик «X» в центре открывающейся ячейки
  const cellSvgX = frameX + cell.x;
  const cellSvgY = frameY + (frameH - cell.y - cell.height);
  const w = cell.width;
  const h = cell.height;
  // Подрезаем под штапик (чтобы линии не уходили в раму)
  const PAD = 100;
  const x1 = cellSvgX + PAD;
  const x2 = cellSvgX + w - PAD;
  const y1 = cellSvgY + PAD;
  const y2 = cellSvgY + h - PAD;
  if (x2 <= x1 || y2 <= y1) return null;

  // Tilt и tilt_turn — треугольник вершиной вверх
  const isTilt = cell.sash === 'tilt';
  const isTiltTurnLeft = cell.sash === 'tilt_turn_left';
  const isTiltTurnRight = cell.sash === 'tilt_turn_right';
  const isTurnLeft = cell.sash === 'turn_left';
  const isTurnRight = cell.sash === 'turn_right';

  return (
    <g pointerEvents="none">
      {isTilt && (
        <polyline
          points={`${x1},${y2} ${(x1 + x2) / 2},${y1} ${x2},${y2}`}
          fill="none" stroke={color} strokeWidth={4}
        />
      )}
      {(isTurnLeft || isTiltTurnLeft) && (
        <polyline
          points={`${x2},${y1} ${x1},${(y1 + y2) / 2} ${x2},${y2}`}
          fill="none" stroke={color} strokeWidth={4}
        />
      )}
      {(isTurnRight || isTiltTurnRight) && (
        <polyline
          points={`${x1},${y1} ${x2},${(y1 + y2) / 2} ${x1},${y2}`}
          fill="none" stroke={color} strokeWidth={4}
        />
      )}
      {(isTiltTurnLeft || isTiltTurnRight) && (
        <polyline
          points={`${x1},${y2} ${(x1 + x2) / 2},${y1} ${x2},${y2}`}
          fill="none" stroke={color} strokeWidth={4}
        />
      )}
    </g>
  );
}
