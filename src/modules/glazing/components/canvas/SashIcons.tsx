import type { SashType } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// SashIcons — SVG-знаки на ячейках, показывающие тип открывания.
//
// В реальных оконных программах (PVC Studio, WHS, Logikal) принят
// единый язык: треугольник вершиной к петле, стрелка для раздвижных,
// диагональные штриховые линии для откидной части. Мы повторяем эти
// конвенции — это привычно для оконщиков и замерщиков.
//
// Все знаки рисуются в единичных координатах рамки [0..1]×[0..1].
// Компонент <SashIcon> сам масштабирует их под ячейку.
// ═══════════════════════════════════════════════════════════════════

interface SashIconProps {
  type: SashType;
  /** Левый край ячейки в координатах SVG-канваса. */
  x: number;
  y: number;
  /** Размеры ячейки в координатах SVG-канваса. */
  width: number;
  height: number;
  /** Толщина линий значка. По умолчанию 1.2. */
  strokeWidth?: number;
  /** Цвет значка. По умолчанию чёрный. */
  color?: string;
}

/**
 * Корневой компонент: рисует значок типа открывания внутри ячейки.
 * Сам выбирает нужную фигуру по type.
 */
export function SashIcon({
  type, x, y, width, height,
  strokeWidth = 1.2, color = '#1f2937',
}: SashIconProps) {
  if (type === 'fixed') return null; // глухая — без значка

  // Небольшой отступ внутрь ячейки, чтобы значок не примыкал вплотную к раме
  const pad = Math.min(width, height) * 0.05;
  const x1 = x + pad;
  const y1 = y + pad;
  const x2 = x + width - pad;
  const y2 = y + height - pad;
  const w = x2 - x1;
  const h = y2 - y1;

  switch (type) {
    case 'turn_left':
      return <TurnLeft x={x1} y={y1} w={w} h={h} sw={strokeWidth} c={color} />;
    case 'turn_right':
      return <TurnRight x={x1} y={y1} w={w} h={h} sw={strokeWidth} c={color} />;
    case 'tilt':
      return <Tilt x={x1} y={y1} w={w} h={h} sw={strokeWidth} c={color} />;
    case 'tilt_turn_left':
      return <TiltTurnLeft x={x1} y={y1} w={w} h={h} sw={strokeWidth} c={color} />;
    case 'tilt_turn_right':
      return <TiltTurnRight x={x1} y={y1} w={w} h={h} sw={strokeWidth} c={color} />;
    case 'sliding_left':
      return <SlidingLeft x={x1} y={y1} w={w} h={h} sw={strokeWidth} c={color} />;
    case 'sliding_right':
      return <SlidingRight x={x1} y={y1} w={w} h={h} sw={strokeWidth} c={color} />;
  }
}

// ─── Внутренние пропсы для подкомпонентов ────────────────────────
interface P { x: number; y: number; w: number; h: number; sw: number; c: string }

// ─── Поворотная влево (петли слева) ──────────────────────────────
// Треугольник вершиной к левой петле (диагонали из углов справа в середину слева)
function TurnLeft({ x, y, w, h, sw, c }: P) {
  return (
    <g pointerEvents="none">
      <polyline
        points={`${x + w},${y} ${x},${y + h / 2} ${x + w},${y + h}`}
        fill="none" stroke={c} strokeWidth={sw}
      />
    </g>
  );
}

// ─── Поворотная вправо (петли справа) ────────────────────────────
function TurnRight({ x, y, w, h, sw, c }: P) {
  return (
    <g pointerEvents="none">
      <polyline
        points={`${x},${y} ${x + w},${y + h / 2} ${x},${y + h}`}
        fill="none" stroke={c} strokeWidth={sw}
      />
    </g>
  );
}

// ─── Откидная (фрамуга) ──────────────────────────────────────────
// Треугольник вершиной ВВЕРХУ — петли снизу, верх откидывается наружу.
// Это стандартное обозначение для фрамуги.
function Tilt({ x, y, w, h, sw, c }: P) {
  return (
    <g pointerEvents="none">
      <polyline
        points={`${x},${y + h} ${x + w / 2},${y} ${x + w},${y + h}`}
        fill="none" stroke={c} strokeWidth={sw}
      />
    </g>
  );
}

// ─── Поворотно-откидная (петли слева) ────────────────────────────
// Два сплошных треугольника:
//   1) Поворотный: вершина к левой петле (середина левого края)
//   2) Откидной: вершина ВВЕРХУ по центру (петли снизу — верх откидывается)
function TiltTurnLeft({ x, y, w, h, sw, c }: P) {
  return (
    <g pointerEvents="none">
      {/* Поворотный треугольник: правые углы → центр левого края */}
      <polyline
        points={`${x + w},${y} ${x},${y + h / 2} ${x + w},${y + h}`}
        fill="none" stroke={c} strokeWidth={sw}
      />
      {/* Откидной треугольник: нижние углы → центр верхнего края */}
      <polyline
        points={`${x},${y + h} ${x + w / 2},${y} ${x + w},${y + h}`}
        fill="none" stroke={c} strokeWidth={sw}
      />
    </g>
  );
}

// ─── Поворотно-откидная (петли справа) ───────────────────────────
function TiltTurnRight({ x, y, w, h, sw, c }: P) {
  return (
    <g pointerEvents="none">
      {/* Поворотный треугольник: левые углы → центр правого края */}
      <polyline
        points={`${x},${y} ${x + w},${y + h / 2} ${x},${y + h}`}
        fill="none" stroke={c} strokeWidth={sw}
      />
      {/* Откидной треугольник: нижние углы → центр верхнего края */}
      <polyline
        points={`${x},${y + h} ${x + w / 2},${y} ${x + w},${y + h}`}
        fill="none" stroke={c} strokeWidth={sw}
      />
    </g>
  );
}

// ─── Раздвижная влево ────────────────────────────────────────────
// Стрелка влево по центру ячейки
function SlidingLeft({ x, y, w, h, sw, c }: P) {
  const cy = y + h / 2;
  const arrowSize = Math.min(w * 0.15, h * 0.2);
  return (
    <g pointerEvents="none">
      <line x1={x + w * 0.1} y1={cy} x2={x + w * 0.9} y2={cy}
            stroke={c} strokeWidth={sw} />
      <polyline
        points={`${x + w * 0.1 + arrowSize},${cy - arrowSize} ${x + w * 0.1},${cy} ${x + w * 0.1 + arrowSize},${cy + arrowSize}`}
        fill="none" stroke={c} strokeWidth={sw}
      />
    </g>
  );
}

// ─── Раздвижная вправо ───────────────────────────────────────────
function SlidingRight({ x, y, w, h, sw, c }: P) {
  const cy = y + h / 2;
  const arrowSize = Math.min(w * 0.15, h * 0.2);
  return (
    <g pointerEvents="none">
      <line x1={x + w * 0.1} y1={cy} x2={x + w * 0.9} y2={cy}
            stroke={c} strokeWidth={sw} />
      <polyline
        points={`${x + w * 0.9 - arrowSize},${cy - arrowSize} ${x + w * 0.9},${cy} ${x + w * 0.9 - arrowSize},${cy + arrowSize}`}
        fill="none" stroke={c} strokeWidth={sw}
      />
    </g>
  );
}
