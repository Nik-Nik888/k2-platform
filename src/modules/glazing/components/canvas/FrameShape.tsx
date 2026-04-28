import type { Frame, Cell, Impost } from '../../types';
import { SashIcon } from './SashIcons';

// ═══════════════════════════════════════════════════════════════════
// FrameShape — отрисовка одной рамы со всеми её внутренностями.
//
// Принципы:
//   • Голубой стеклопакет рисуется БЕЗУСЛОВНО для каждой ячейки
//     (даже если расчёты дают странные числа). Это страхует от
//     ситуации когда ячейка есть в данных, но визуально пустая.
//   • Координаты внутри рамы — мм (как в модели), без масштабирования.
//
// Цвета (PVC Studio style):
//   • рама/импосты — чёрные
//   • стекло — голубое полупрозрачное
//   • штапик — узкая внутренняя обводка ячейки
// ═══════════════════════════════════════════════════════════════════

// ── Константы стиля (мм) ───────────────────────────────────────────
const FRAME_THICKNESS = 70;
const IMPOST_THICKNESS = 80;
const SASH_INSET = 6;
const GLASS_INSET = 12;

const COLOR_FRAME = '#1f2937';
const COLOR_FRAME_FILL = '#ffffff';
const COLOR_GLASS = '#bfdbfe';
const COLOR_GLASS_STROKE = '#93c5fd';
const COLOR_ROW_HIGHLIGHT = '#dbeafe';   // голубая подложка для активной полосы

// ── Пропсы ─────────────────────────────────────────────────────────

interface FrameShapeProps {
  frame: Frame;
  /** Левый край рамы в координатах канваса (мм). */
  offsetX: number;
  /** Верхний край рамы в координатах канваса (мм). */
  offsetY: number;
  /** ID активной ячейки (для подсветки выбранной). */
  activeCellId?: string | null;
  /** Колбэк при клике на ячейку (активация). */
  onCellClick?: (cellId: string) => void;
  /** Колбэк при клике на маленький "+" в центре активной ячейки (открыть попап редактирования). */
  onCellEditClick?: (cellId: string) => void;
  /** Колбэк при клике на импост. */
  onImpostClick?: (impostId: string) => void;
  /**
   * ID активной горизонтальной полосы (которая подсвечивается голубым).
   * Полоса = вся высота между двумя соседними горизонтальными импостами
   * (или между импостом и краем рамы).
   */
  activeRowYRange?: { yBottom: number; yTop: number } | null;
}

// ═══════════════════════════════════════════════════════════════════

export function FrameShape({
  frame, offsetX, offsetY,
  activeCellId, onCellClick, onCellEditClick, onImpostClick,
  activeRowYRange,
}: FrameShapeProps) {
  return (
    <g>
      {/* 1. Белый профиль рамы — внешний контур */}
      <rect
        x={offsetX}
        y={offsetY}
        width={frame.width}
        height={frame.height}
        fill={COLOR_FRAME_FILL}
        stroke={COLOR_FRAME}
        strokeWidth={3}
      />

      {/* 2. Подсветка активной горизонтальной полосы (голубой фон) */}
      {activeRowYRange && (() => {
        // y хранится от низа рамы → переводим в SVG-Y
        const svgYTop = offsetY + (frame.height - activeRowYRange.yTop);
        const svgYBottom = offsetY + (frame.height - activeRowYRange.yBottom);
        return (
          <rect
            x={offsetX + FRAME_THICKNESS}
            y={svgYTop}
            width={frame.width - FRAME_THICKNESS * 2}
            height={svgYBottom - svgYTop}
            fill={COLOR_ROW_HIGHLIGHT}
            opacity={0.5}
            pointerEvents="none"
          />
        );
      })()}

      {/* 3. Внутренний край рамы (показывает толщину профиля) */}
      <rect
        x={offsetX + FRAME_THICKNESS}
        y={offsetY + FRAME_THICKNESS}
        width={frame.width - FRAME_THICKNESS * 2}
        height={frame.height - FRAME_THICKNESS * 2}
        fill="none"
        stroke={COLOR_FRAME}
        strokeWidth={1.5}
      />

      {/* 4. Ячейки (стекло + значок открывания) */}
      {frame.cells.map((cell) => (
        <CellPiece
          key={cell.id}
          cell={cell}
          offsetX={offsetX}
          offsetY={offsetY}
          frameW={frame.width}
          frameH={frame.height}
          isActive={cell.id === activeCellId}
          onClick={onCellClick ? () => onCellClick(cell.id) : undefined}
          onEditClick={onCellEditClick ? () => onCellEditClick(cell.id) : undefined}
        />
      ))}

      {/* 5. Импосты поверх ячеек */}
      {frame.imposts.map((imp) => (
        <ImpostPiece
          key={imp.id}
          impost={imp}
          offsetX={offsetX}
          offsetY={offsetY}
          frameW={frame.width}
          frameH={frame.height}
          allImposts={frame.imposts}
          onClick={onImpostClick ? () => onImpostClick(imp.id) : undefined}
        />
      ))}
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Ячейка
// ═══════════════════════════════════════════════════════════════════

interface CellPieceProps {
  cell: Cell;
  offsetX: number;
  offsetY: number;
  frameW: number;
  frameH: number;
  isActive: boolean;
  onClick?: () => void;
  /** Колбэк при клике на маленький "+" в центре активной ячейки. */
  onEditClick?: () => void;
}

function CellPiece({
  cell, offsetX, offsetY, frameW, frameH, isActive, onClick, onEditClick,
}: CellPieceProps) {
  // Координаты в SVG (Y от верха).
  // Cell.y хранится от НИЗА рамы — переводим:
  const cellSvgX = offsetX + cell.x;
  const cellSvgY = offsetY + (frameH - cell.y - cell.height);
  const cellW = cell.width;
  const cellH = cell.height;

  // Допуск для сравнений (защита от float-погрешности при пересчёте позиций)
  const TOL = 0.5;
  const isAtLeft   = cell.x <= TOL;
  const isAtRight  = Math.abs(cell.x + cell.width - frameW) <= TOL;
  const isAtBottom = cell.y <= TOL;
  const isAtTop    = Math.abs(cell.y + cell.height - frameH) <= TOL;

  const insetLeft   = isAtLeft   ? FRAME_THICKNESS : IMPOST_THICKNESS / 2;
  const insetRight  = isAtRight  ? FRAME_THICKNESS : IMPOST_THICKNESS / 2;
  const insetBottom = isAtBottom ? FRAME_THICKNESS : IMPOST_THICKNESS / 2;
  const insetTop    = isAtTop    ? FRAME_THICKNESS : IMPOST_THICKNESS / 2;

  // Координаты "внутренней" области ячейки (без рамы/импостов)
  const innerX = cellSvgX + insetLeft;
  const innerY = cellSvgY + insetTop;
  const innerW = Math.max(0, cellW - insetLeft - insetRight);
  const innerH = Math.max(0, cellH - insetTop - insetBottom);

  const hasSash = cell.sash !== 'fixed';
  const sashX = innerX + (hasSash ? SASH_INSET : 0);
  const sashY = innerY + (hasSash ? SASH_INSET : 0);
  const sashW = Math.max(0, innerW - (hasSash ? SASH_INSET * 2 : 0));
  const sashH = Math.max(0, innerH - (hasSash ? SASH_INSET * 2 : 0));

  const glassX = sashX + GLASS_INSET;
  const glassY = sashY + GLASS_INSET;
  const glassW = Math.max(0, sashW - GLASS_INSET * 2);
  const glassH = Math.max(0, sashH - GLASS_INSET * 2);

  const hasMosquito = cell.mosquito != null;

  return (
    <g
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Голубое стекло — на ВСЮ внутреннюю область безусловно */}
      {innerW > 0 && innerH > 0 && (
        <rect
          x={innerX} y={innerY}
          width={innerW} height={innerH}
          fill={COLOR_GLASS}
          fillOpacity={0.6}
          stroke="none"
        />
      )}

      {/* Створка */}
      {hasSash && sashW > 0 && sashH > 0 && (
        <rect
          x={sashX} y={sashY} width={sashW} height={sashH}
          fill="none"
          stroke={COLOR_FRAME}
          strokeWidth={1.5}
        />
      )}

      {/* Стекло с обводкой штапика */}
      {glassW > 0 && glassH > 0 && (
        <rect
          x={glassX} y={glassY} width={glassW} height={glassH}
          fill="none"
          stroke={COLOR_GLASS_STROKE}
          strokeWidth={1}
        />
      )}

      {/* Москитная сетка — серые квадратики ~50×50мм по всей ВНУТРЕННЕЙ области */}
      {hasMosquito && innerW > 50 && innerH > 50 && (
        <MosquitoMesh
          x={innerX} y={innerY}
          width={innerW} height={innerH}
        />
      )}

      {/* Значок открывания */}
      {glassW > 0 && glassH > 0 && (
        <SashIcon
          type={cell.sash}
          x={glassX}
          y={glassY}
          width={glassW}
          height={glassH}
        />
      )}

      {/* Подсветка активной ячейки */}
      {isActive && innerW > 0 && innerH > 0 && (
        <rect
          x={innerX + 1} y={innerY + 1}
          width={innerW - 2} height={innerH - 2}
          fill="none"
          stroke="#f97316"
          strokeWidth={4}
          strokeDasharray="8 4"
          pointerEvents="none"
        />
      )}

      {/* Маленький "+" в центре активной ячейки → открывает попап редактирования */}
      {isActive && onEditClick && innerW > 80 && innerH > 80 && (
        <CellEditPlus
          cx={innerX + innerW / 2}
          cy={innerY + innerH / 2}
          onClick={onEditClick}
        />
      )}
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MosquitoMesh — серая сетка квадратиками для визуализации москитки.
// Шаг ~50мм, цвет средний серый, заметный но не доминирующий.
// ═══════════════════════════════════════════════════════════════════

function MosquitoMesh({ x, y, width, height }: {
  x: number; y: number; width: number; height: number;
}) {
  const STEP = 50; // мм
  const STROKE = '#475569';
  const OPACITY = 0.32;
  const STROKE_WIDTH = 1.5;

  const verticals: React.ReactElement[] = [];
  for (let vx = STEP; vx < width; vx += STEP) {
    verticals.push(
      <line key={`v-${vx}`}
        x1={x + vx} y1={y}
        x2={x + vx} y2={y + height}
        stroke={STROKE} strokeWidth={STROKE_WIDTH} opacity={OPACITY}
      />
    );
  }
  const horizontals: React.ReactElement[] = [];
  for (let vy = STEP; vy < height; vy += STEP) {
    horizontals.push(
      <line key={`h-${vy}`}
        x1={x} y1={y + vy}
        x2={x + width} y2={y + vy}
        stroke={STROKE} strokeWidth={STROKE_WIDTH} opacity={OPACITY}
      />
    );
  }

  return (
    <g pointerEvents="none">
      {verticals}
      {horizontals}
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CellEditPlus — маленький "+" в центре активной ячейки.
// Цвет — голубой темнее, чем подложка стекла. Тап → открыть попап
// редактирования ячейки (тип открывания / сетка / фурнитура).
// ═══════════════════════════════════════════════════════════════════

function CellEditPlus({ cx, cy, onClick }: {
  cx: number; cy: number; onClick: () => void;
}) {
  const R = 55;     // радиус круга в мм (заметный, но не доминирующий)
  const TICK = 28;
  return (
    <g
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ cursor: 'pointer' }}
    >
      <circle
        cx={cx} cy={cy} r={R}
        fill="#3b82f6"
        stroke="#1e40af"
        strokeWidth={3}
        opacity={0.92}
      />
      <line
        x1={cx - TICK} y1={cy} x2={cx + TICK} y2={cy}
        stroke="#ffffff" strokeWidth={7} strokeLinecap="round"
      />
      <line
        x1={cx} y1={cy - TICK} x2={cx} y2={cy + TICK}
        stroke="#ffffff" strokeWidth={7} strokeLinecap="round"
      />
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Импост: вертикальный или горизонтальный.
//
// ВАЖНО: горизонтальные импосты рисуются СКВОЗНЫМИ (через всю ширину).
// Вертикальные импосты ОБРЕЗАЮТСЯ горизонтальными — рисуются только
// между двумя ближайшими горизонтальными (или между гор. импостом и краем).
// Это даёт эффект "горизонтальный делит раму на полосы, в каждой полосе
// свои вертикальные".
// ═══════════════════════════════════════════════════════════════════

interface ImpostPieceProps {
  impost: Impost;
  offsetX: number;
  offsetY: number;
  frameW: number;
  frameH: number;
  /** Все импосты рамы — нужны вертикальному, чтобы знать где обрезаться. */
  allImposts: Impost[];
  onClick?: () => void;
}

function ImpostPiece({
  impost, offsetX, offsetY, frameW, frameH, allImposts, onClick,
}: ImpostPieceProps) {
  const half = IMPOST_THICKNESS / 2;

  if (impost.orientation === 'horizontal') {
    // Горизонтальный импост — СКВОЗНОЙ по всей ширине
    // (от внутреннего края левой стороны рамы до правой)
    const svgY = offsetY + (frameH - impost.position) - half;
    return (
      <g
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        <rect
          x={offsetX + FRAME_THICKNESS}
          y={svgY}
          width={frameW - FRAME_THICKNESS * 2}
          height={IMPOST_THICKNESS}
          fill={COLOR_FRAME_FILL}
          stroke={COLOR_FRAME}
          strokeWidth={1.5}
        />
      </g>
    );
  }

  // Вертикальный импост — обрезается ближайшими горизонтальными.
  // Найдём горизонтальные импосты и определим в какой "полосе" находится
  // вертикальный (по принципу — он привязан к одной полосе).
  // Для простоты пока считаем что вертикальный импост занимает всю
  // высоту своей полосы — то есть от низа полосы до верха.
  // Полосу вертикального импоста определяем по его belongsToRow.
  // Если belongsToRow не задано — рисуется на полную высоту (старая логика).

  const horizontals = allImposts
    .filter((i) => i.orientation === 'horizontal')
    .map((i) => i.position)
    .sort((a, b) => a - b);

  // Все границы полос по высоте (от низа): 0, гориз1, гориз2, ..., frameH
  const rowBoundaries = [0, ...horizontals, frameH];

  // Определяем полосу вертикального импоста.
  // Если у импоста есть belongsToRow — используем; иначе — определяем
  // по середине рамы (старое поведение для обратной совместимости).
  const rowIdx = impost.belongsToRow ?? findDefaultRowIdx(rowBoundaries);

  // Границы текущей полосы (от низа)
  const rowBottomFromBottom = rowBoundaries[rowIdx] ?? 0;
  const rowTopFromBottom = rowBoundaries[rowIdx + 1] ?? frameH;

  // Перевод в SVG (Y от верха)
  const svgYTop = offsetY + (frameH - rowTopFromBottom);
  const svgYBottom = offsetY + (frameH - rowBottomFromBottom);

  // Если полоса крайняя — отступаем от рамы на её толщину;
  // если полоса между двумя горизонталями — отступаем на половину импоста
  const insetTop = rowIdx === rowBoundaries.length - 2 ? FRAME_THICKNESS : IMPOST_THICKNESS / 2;
  const insetBottom = rowIdx === 0 ? FRAME_THICKNESS : IMPOST_THICKNESS / 2;

  return (
    <g
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <rect
        x={offsetX + impost.position - half}
        y={svgYTop + insetTop}
        width={IMPOST_THICKNESS}
        height={(svgYBottom - svgYTop) - insetTop - insetBottom}
        fill={COLOR_FRAME_FILL}
        stroke={COLOR_FRAME}
        strokeWidth={1.5}
      />
    </g>
  );
}

/** Полоса по умолчанию — единственная (когда нет горизонтальных импостов). */
function findDefaultRowIdx(_rowBoundaries: number[]): number {
  // Если только [0, frameH] — единственная полоса idx=0
  // Иначе — берём 0 (нижняя)
  return 0;
}
