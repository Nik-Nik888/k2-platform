/**
 * Компонент редактирования глубины элемента (полки/стойки/ящика/штанги).
 *
 * Отображение:
 * - Чекбокс "На всю глубину (Nмм)" — если включён, depth/depthOffset сбрасываются в undefined
 * - Два NumInput: "Глубина" и "Отступ от задней"
 * - Визуальный индикатор показывающий какая часть глубины занята элементом
 *
 * Валидация: depth + depthOffset ≤ corpus.depth.
 */
import { NumInput } from "./NumInput";

export interface DepthControlProps {
  /** Полная глубина корпуса в мм. */
  corpusDepth: number;
  /** Текущая глубина элемента (undefined = на всю глубину корпуса). */
  depth: number | undefined;
  /** Отступ от задней стенки в мм (undefined = 0). */
  depthOffset: number | undefined;
  /** Callback при изменении. Передаёт { depth, depthOffset } — оба undefined если "на всю". */
  onChange: (next: { depth: number | undefined; depthOffset: number | undefined }) => void;
}

export function DepthControl({ corpusDepth, depth, depthOffset, onChange }: DepthControlProps) {
  const isFull = depth === undefined;
  const actualDepth = depth ?? corpusDepth;
  const actualOffset = depthOffset ?? 0;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>
        Глубина
      </div>

      {/* Toggle: "Вся глубина" vs "Своя глубина" — две кнопки рядом.
          Активная подсвечена оранжевым, неактивная — серая. Клик по неактивной переключает. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
        <button
          onClick={() => {
            if (!isFull) onChange({ depth: undefined, depthOffset: undefined });
          }}
          style={{
            padding: "10px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            cursor: isFull ? "default" : "pointer",
            border: "1px solid",
            background: isFull ? "rgba(217,119,6,0.15)" : "rgba(40,40,50,0.5)",
            color: isFull ? "#d97706" : "#888",
            borderColor: isFull ? "rgba(217,119,6,0.4)" : "#333",
          }}
        >
          {isFull ? "✓ " : ""}Вся глубина
          <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>
            {corpusDepth}мм
          </div>
        </button>
        <button
          onClick={() => {
            if (isFull) onChange({ depth: corpusDepth, depthOffset: 0 });
          }}
          style={{
            padding: "10px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            cursor: isFull ? "pointer" : "default",
            border: "1px solid",
            background: !isFull ? "rgba(217,119,6,0.15)" : "rgba(40,40,50,0.5)",
            color: !isFull ? "#d97706" : "#888",
            borderColor: !isFull ? "rgba(217,119,6,0.4)" : "#333",
          }}
        >
          {!isFull ? "✓ " : ""}Своя глубина
          <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>
            {!isFull ? `${actualDepth}мм` : "указать"}
          </div>
        </button>
      </div>

      {/* Inputs — только когда ручной режим */}
      {!isFull && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{
                fontSize: 10, color: "#888", marginBottom: 3,
                minHeight: 26, // 2 строки × 13px — фиксированная высота для выравнивания
                display: "flex", alignItems: "flex-end",
              }}>Глубина</div>
              <NumInput
                value={actualDepth}
                onChange={v => {
                  const clamped = Math.max(50, Math.min(corpusDepth - actualOffset, v));
                  onChange({ depth: clamped, depthOffset: actualOffset });
                }}
                min={50} max={corpusDepth} color="#d97706" width="100%"
              />
            </div>
            <div>
              <div style={{
                fontSize: 10, color: "#888", marginBottom: 3,
                minHeight: 26,
                display: "flex", alignItems: "flex-end",
              }}>Отступ от задней</div>
              <NumInput
                value={actualOffset}
                onChange={v => {
                  // Если offset+depth превысит corpusDepth — уменьшаем depth до допустимого
                  const clampedOffset = Math.max(0, Math.min(corpusDepth - 50, v));
                  const maxDepth = corpusDepth - clampedOffset;
                  const newDepth = Math.min(actualDepth, maxDepth);
                  onChange({ depth: newDepth, depthOffset: clampedOffset });
                }}
                min={0} max={corpusDepth - 50} color="#d97706" width="100%"
              />
            </div>
          </div>

          {/* Визуальный индикатор — полоса с занятой областью */}
          <DepthIndicator
            total={corpusDepth}
            depth={actualDepth}
            offset={actualOffset}
          />
          <div style={{ fontSize: 10, color: "#666", marginTop: 4, display: "flex", justifyContent: "space-between" }}>
            <span>← задняя стенка</span>
            <span>передняя →</span>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// DepthIndicator — SVG-полоса показывающая занятую область глубины
// ───────────────────────────────────────────────────────────────

interface DepthIndicatorProps {
  total: number;
  depth: number;
  offset: number;
}

function DepthIndicator({ total, depth, offset }: DepthIndicatorProps) {
  const barW = 100;  // процентная ширина в SVG
  const barH = 16;
  const offsetPct = (offset / total) * barW;
  const depthPct = (depth / total) * barW;

  return (
    <svg
      viewBox={`0 0 ${barW} ${barH}`}
      style={{ width: "100%", height: barH, display: "block" }}
      preserveAspectRatio="none"
    >
      {/* Фон всей глубины */}
      <rect x={0} y={0} width={barW} height={barH} fill="rgba(50,50,60,0.3)" rx={2} />
      {/* Занятая область элементом */}
      <rect
        x={offsetPct} y={0}
        width={depthPct} height={barH}
        fill="rgba(217,119,6,0.5)"
        stroke="#d97706" strokeWidth={0.5}
        rx={1}
      />
      {/* Риски делений каждые 100мм */}
      {Array.from({ length: Math.floor(total / 100) }, (_, i) => {
        const x = ((i + 1) * 100 / total) * barW;
        return (
          <line
            key={i} x1={x} y1={barH - 2} x2={x} y2={barH}
            stroke="rgba(255,255,255,0.2)" strokeWidth={0.3}
          />
        );
      })}
    </svg>
  );
}
