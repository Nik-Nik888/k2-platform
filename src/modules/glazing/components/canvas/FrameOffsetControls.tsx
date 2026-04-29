import type { Frame } from '../../types';
import { DimensionLabel } from './DimensionLabel';

// ═══════════════════════════════════════════════════════════════════
// FrameOffsetControls — управление смещением рамы внутри сегмента.
//
// Когда рама активна, у верхнего и нижнего края рамы (внутри стекла)
// показываются бледные стрелочки и небольшие поля ввода.
//
//   • Сверху: стрелочка ↓ + поле = «опустить верх рамы вниз на N мм»
//   • Снизу: стрелочка ↑ + поле = «поднять низ рамы вверх на N мм»
//
// Размещены у самых краёв чтобы не перекрывать центральные кнопки
// (синий «+» в центре ячейки для добавления импоста).
//
// При вводе значения рама укорачивается и одновременно смещается,
// чтобы противоположный край остался на месте.
// ═══════════════════════════════════════════════════════════════════

interface FrameOffsetControlsProps {
  frame: Frame;
  frameX: number;
  segHeight: number;
  bottomY: number;
  isActive: boolean;
  onChangeBottomOffset: (mm: number) => void;
  onChangeTopOffset: (mm: number) => void;
}

const ARROW_COLOR = '#94a3b8';        // бледно-серый
const ARROW_SIZE = 50;                // размер стрелки
const EDGE_INSET = 100;               // отступ от края рамы внутрь

export function FrameOffsetControls({
  frame, frameX, segHeight, bottomY,
  isActive, onChangeBottomOffset, onChangeTopOffset,
}: FrameOffsetControlsProps) {
  if (!isActive) return null;

  const bottomOffset = frame.bottomOffset ?? 0;
  const topOffset = frame.topOffset ?? 0;
  const cx = frameX + frame.width / 2;
  const frameTopY = bottomY - bottomOffset - frame.height;
  const frameBottomY = bottomY - bottomOffset;

  return (
    <g pointerEvents="auto" data-interactive>
      {/* ВЕРХНИЙ — у верхнего края рамы (внутри стекла).
          maxValue: можно укоротить раму до 300мм минимум,
          но не больше чем доступно в сегменте. */}
      <OffsetControl
        cx={cx}
        cy={frameTopY + EDGE_INSET}
        value={topOffset}
        arrow="down"
        onChange={onChangeTopOffset}
        maxValue={Math.max(0, Math.min(
          frame.height - 300 + topOffset,    // не меньше 300мм высоты рамы
          segHeight - 300 - bottomOffset      // и в пределах сегмента
        ))}
      />

      {/* НИЖНИЙ — у нижнего края рамы (внутри стекла) */}
      <OffsetControl
        cx={cx}
        cy={frameBottomY - EDGE_INSET}
        value={bottomOffset}
        arrow="up"
        onChange={onChangeBottomOffset}
        maxValue={Math.max(0, Math.min(
          frame.height - 300 + bottomOffset,
          segHeight - 300 - topOffset
        ))}
      />
    </g>
  );
}

function OffsetControl({ cx, cy, value, arrow, onChange, maxValue }: {
  cx: number; cy: number;
  value: number;
  arrow: 'up' | 'down';
  onChange: (mm: number) => void;
  maxValue: number;
}) {
  // Стрелка слева от поля, поле справа. Между ними небольшой отступ.
  const arrowCx = cx - 70;
  const labelCx = cx + 30;

  return (
    <g>
      {/* Стрелка-индикатор (некликабельная, бледная) */}
      <ArrowGlyph cx={arrowCx} cy={cy} dir={arrow} />

      {/* Поле ввода — DimensionLabel в muted-режиме когда 0 */}
      <DimensionLabel
        x={labelCx} y={cy}
        value={value}
        onChange={(v) => onChange(Math.max(0, Math.min(v, maxValue)))}
        min={0}
        max={Math.max(50, maxValue)}
        muted={value === 0}
      />
    </g>
  );
}

function ArrowGlyph({ cx, cy, dir }: {
  cx: number; cy: number; dir: 'up' | 'down';
}) {
  const halfH = ARROW_SIZE / 2;
  const halfW = 14;
  if (dir === 'down') {
    return (
      <g pointerEvents="none">
        <line
          x1={cx} y1={cy - halfH}
          x2={cx} y2={cy + halfH * 0.4}
          stroke={ARROW_COLOR} strokeWidth={3} strokeLinecap="round"
        />
        <polyline
          points={`${cx - halfW},${cy + halfH * 0.2} ${cx},${cy + halfH} ${cx + halfW},${cy + halfH * 0.2}`}
          fill="none" stroke={ARROW_COLOR} strokeWidth={3}
          strokeLinecap="round" strokeLinejoin="round"
        />
      </g>
    );
  }
  return (
    <g pointerEvents="none">
      <polyline
        points={`${cx - halfW},${cy - halfH * 0.2} ${cx},${cy - halfH} ${cx + halfW},${cy - halfH * 0.2}`}
        fill="none" stroke={ARROW_COLOR} strokeWidth={3}
        strokeLinecap="round" strokeLinejoin="round"
      />
      <line
        x1={cx} y1={cy - halfH * 0.4}
        x2={cx} y2={cy + halfH}
        stroke={ARROW_COLOR} strokeWidth={3} strokeLinecap="round"
      />
    </g>
  );
}
