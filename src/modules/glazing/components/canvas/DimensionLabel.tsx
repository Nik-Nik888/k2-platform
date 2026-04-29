import { useState, useRef, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════
// DimensionLabel — овальная подпись с числом (как в PVC Studio).
// При клике превращается в input для редактирования.
//
// Координаты — в тех же единицах, что и SVG-канвас (мм).
// Inline-редактирование сделано через <foreignObject>, потому что
// SVG не поддерживает text-input нативно.
// ═══════════════════════════════════════════════════════════════════

interface DimensionLabelProps {
  /** Координата центра в SVG (мм). */
  x: number;
  y: number;
  /** Текущее значение (число). */
  value: number;
  /** Колбэк при сохранении нового значения. */
  onChange?: (value: number) => void;
  /** Жирная (для общего размера) или тонкая. */
  bold?: boolean;
  /** Минимум/максимум для валидации ввода. */
  min?: number;
  max?: number;
  /** Если редактирование запрещено — просто отображаем число. */
  readOnly?: boolean;
  /**
   * Бледный стиль (текст и рамка серым, фон полупрозрачный).
   * Используется когда значение «нулевое» — placeholder-стиль,
   * чтобы пользователь видел что поле пустое и кликабельное.
   */
  muted?: boolean;
}

const COLOR_BG_DEFAULT = '#ffffff';
const COLOR_BG_EDITING = '#fef3c7';   // янтарный фон при редактировании
const COLOR_BG_HOVER = '#eff6ff';
const COLOR_BORDER = '#94a3b8';
const COLOR_BORDER_EDITING = '#f59e0b';
const COLOR_TEXT = '#475569';

export function DimensionLabel({
  x, y, value, onChange, bold, min = 100, max = 6000, readOnly, muted,
}: DimensionLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Размер овала зависит от длины числа и режима (bold = крупнее)
  const text = String(value);
  const fontSize = bold ? 60 : 50;
  const padding = 50;
  const w = Math.max(text.length * fontSize * 0.55 + padding, 120);
  const h = fontSize + 25;

  const canEdit = !readOnly && !!onChange;

  // ── Обработчики ────────────────────────────────────────────────
  function startEdit(e: React.MouseEvent) {
    if (!canEdit) return;
    e.stopPropagation();
    setDraft(String(value));
    setEditing(true);
  }

  function commit() {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n >= min && n <= max && n !== value) {
      onChange?.(n);
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(String(value));
    setEditing(false);
  }

  // Авто-фокус и выделение текста при входе в режим редактирования
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // ── Рендер режима отображения ─────────────────────────────────
  if (!editing) {
    const bg = hover && canEdit ? COLOR_BG_HOVER : COLOR_BG_DEFAULT;
    const textColor = muted ? '#94a3b8' : COLOR_TEXT;
    const borderColor = muted ? '#cbd5e1' : COLOR_BORDER;
    const fillOpacity = muted ? 0.7 : 1;
    return (
      <g
        onMouseEnter={() => canEdit && setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={startEdit}
        style={{ cursor: canEdit ? 'pointer' : 'default' }}
      >
        <rect
          x={x - w / 2} y={y - h / 2}
          width={w} height={h}
          rx={h / 2} ry={h / 2}
          fill={bg}
          fillOpacity={fillOpacity}
          stroke={borderColor}
          strokeWidth={1.5}
        />
        <text
          x={x} y={y}
          fontSize={fontSize}
          fontFamily="Inter, system-ui, sans-serif"
          fill={textColor}
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight={bold ? 700 : 500}
          pointerEvents="none"
        >
          {text}
        </text>
      </g>
    );
  }

  // ── Рендер режима редактирования (foreignObject для HTML input) ─
  // Размеры input в SVG-координатах (мм) — браузер сам отмасштабирует
  return (
    <g>
      <rect
        x={x - w / 2} y={y - h / 2}
        width={w} height={h}
        rx={h / 2} ry={h / 2}
        fill={COLOR_BG_EDITING}
        stroke={COLOR_BORDER_EDITING}
        strokeWidth={3}
      />
      <foreignObject
        x={x - w / 2 + 10}
        y={y - h / 2 + 5}
        width={w - 20}
        height={h - 10}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') cancel();
          }}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent',
            fontSize: `${fontSize}px`,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: bold ? 700 : 500,
            color: COLOR_TEXT,
            textAlign: 'center',
            outline: 'none',
            padding: 0,
          }}
        />
      </foreignObject>
    </g>
  );
}
