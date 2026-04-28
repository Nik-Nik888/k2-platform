import type { Corner } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// CornerJoint — отрисовка стыка двух сегментов на развёртке.
//
// Согласно нашему UX (Вариант А): сегменты разворачиваются в одну
// прямую линию, а на стыке рисуются две вертикальные линии чуть выше
// и ниже рамы — это визуальный признак угла. Над стыком — подпись угла
// и тип соединителя.
//
// Тап на CornerJoint открывает CornerEditPopup.
// ═══════════════════════════════════════════════════════════════════

interface CornerJointProps {
  corner: Corner;
  /** X-координата центра стыка в SVG (мм). */
  x: number;
  /** Высота сегмента (для рисования вертикальных линий). */
  segmentHeight: number;
  /** Y нижнего края сегмента в SVG. */
  bottomY: number;
  /** Колбэк при клике (открыть попап редактирования). */
  onClick?: () => void;
}

const COLOR_JOINT = '#475569';
const COLOR_LABEL_BG = '#fef3c7';
const COLOR_LABEL_BORDER = '#f59e0b';
const COLOR_LABEL_TEXT = '#92400e';

const STICK_OUT = 250;       // насколько линии выходят за раму вверх и вниз, мм
const JOINT_WIDTH = 60;      // расстояние между двумя вертикальными линиями, мм

function angleLabel(corner: Corner): string {
  switch (corner.type) {
    case 'h_90':        return '90°';
    case 'h_135':       return '135°';
    case 'h_universal': return `${corner.customAngle ?? '?'}°`;
    case 'flat':        return '180°';
  }
}

function angleColor(corner: Corner): { bg: string; border: string; text: string } {
  if (corner.type === 'flat') {
    return { bg: '#f1f5f9', border: '#cbd5e1', text: '#475569' };
  }
  return { bg: COLOR_LABEL_BG, border: COLOR_LABEL_BORDER, text: COLOR_LABEL_TEXT };
}

export function CornerJoint({
  corner, x, segmentHeight, bottomY, onClick,
}: CornerJointProps) {
  const topY = bottomY - segmentHeight;
  const xLeft = x - JOINT_WIDTH / 2;
  const xRight = x + JOINT_WIDTH / 2;

  const labelColors = angleColor(corner);
  const label = angleLabel(corner);
  const labelW = 220;
  const labelH = 90;
  const labelY = topY - STICK_OUT - labelH / 2 - 30;

  return (
    <g
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      data-interactive
    >
      {/* Левая вертикальная линия — выходит сверху и снизу */}
      <line
        x1={xLeft} y1={topY - STICK_OUT}
        x2={xLeft} y2={bottomY + STICK_OUT}
        stroke={COLOR_JOINT}
        strokeWidth={6}
      />

      {/* Правая вертикальная линия */}
      <line
        x1={xRight} y1={topY - STICK_OUT}
        x2={xRight} y2={bottomY + STICK_OUT}
        stroke={COLOR_JOINT}
        strokeWidth={6}
      />

      {/* Соединительная штриховка между линиями (показывает угол) */}
      <line
        x1={xLeft} y1={topY - STICK_OUT + 30}
        x2={xRight} y2={topY - STICK_OUT + 30}
        stroke={COLOR_JOINT} strokeWidth={2} strokeDasharray="6 4"
      />
      <line
        x1={xLeft} y1={bottomY + STICK_OUT - 30}
        x2={xRight} y2={bottomY + STICK_OUT - 30}
        stroke={COLOR_JOINT} strokeWidth={2} strokeDasharray="6 4"
      />

      {/* Подпись угла сверху */}
      <g>
        <rect
          x={x - labelW / 2} y={labelY - labelH / 2}
          width={labelW} height={labelH}
          rx={12} ry={12}
          fill={labelColors.bg}
          stroke={labelColors.border}
          strokeWidth={2}
        />
        <text
          x={x} y={labelY}
          fontSize={70}
          fontFamily="Inter, system-ui, sans-serif"
          fill={labelColors.text}
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight={700}
          pointerEvents="none"
        >
          {label}
        </text>
      </g>
    </g>
  );
}
