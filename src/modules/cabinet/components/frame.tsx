/**
 * SVG-компоненты рамки шкафа (корпус) и подсветки зон при placeMode.
 */
import React from "react";
import { SC } from "../constants";
import type { Zone } from "../logic/zones";

export interface FrameCtx {
  /** Ширина корпуса (мм). */
  width: number;
  /** Высота корпуса (мм). */
  height: number;
  /** Толщина ЛДСП (мм). */
  t: number;
  /** Показывать ли реальный корпус (с толщиной ЛДСП) или пустую рамку. */
  showCorpus: boolean;
  /** Hex-цвет ЛДСП корпуса. */
  corpusHex: string;
}

/** Рамка шкафа: либо полный корпус из ЛДСП (4 панели), либо пустая рамка-контур. */
export function renderFrame(ctx: FrameCtx): React.ReactNode {
  const { width, height, t, showCorpus, corpusHex } = ctx;
  const cStroke = "#4a3f35";
  const tPx = t * SC;
  const wPx = width * SC;
  const hPx = height * SC;
  const gap = 0.3;

  if (!showCorpus) {
    // Пустая рамка — пунктирный контур с уголками, вся площадь доступна
    return (
      <>
        <rect x={0} y={0} width={wPx} height={hPx} fill="url(#g)" />
        <rect
          x={0} y={0} width={wPx} height={hPx}
          fill="none" stroke="#4a3f35" strokeWidth={1} strokeDasharray="6 3"
        />
        {/* Уголки по 4-м углам */}
        {([[0, 0], [wPx, 0], [0, hPx], [wPx, hPx]] as [number, number][]).map(([cx, cy], i) => (
          <g key={`c${i}`}>
            <line x1={cx - (cx > 0 ? 8 : -8)} y1={cy} x2={cx} y2={cy} stroke="#d97706" strokeWidth={0.8} />
            <line x1={cx} y1={cy - (cy > 0 ? 8 : -8)} x2={cx} y2={cy} stroke="#d97706" strokeWidth={0.8} />
          </g>
        ))}
      </>
    );
  }

  return (
    <>
      {/* Внутренний фон (сетка через pattern id=g) */}
      <rect x={tPx} y={tPx} width={wPx - 2 * tPx} height={hPx - 2 * tPx} fill="url(#g)" />
      {/* ДВП задняя панель — тонкий пунктирный контур */}
      <rect
        x={tPx + 1} y={tPx + 1}
        width={wPx - 2 * tPx - 2} height={hPx - 2 * tPx - 2}
        fill="none" stroke="rgba(58,53,48,0.25)" strokeWidth={0.5} strokeDasharray="3 2"
      />
      {/* Левая боковина — full height */}
      <rect x={0} y={0} width={tPx} height={hPx} fill={corpusHex} stroke={cStroke} strokeWidth={0.6} />
      {/* Правая боковина — full height */}
      <rect x={wPx - tPx} y={0} width={tPx} height={hPx} fill={corpusHex} stroke={cStroke} strokeWidth={0.6} />
      {/* Крыша — между боковинами */}
      <rect x={tPx + gap} y={0} width={wPx - 2 * tPx - 2 * gap} height={tPx} fill={corpusHex} stroke={cStroke} strokeWidth={0.6} />
      {/* Дно — между боковинами */}
      <rect x={tPx + gap} y={hPx - tPx} width={wPx - 2 * tPx - 2 * gap} height={tPx} fill={corpusHex} stroke={cStroke} strokeWidth={0.6} />
      {/* Линии стыков крыши/дна с боковинами */}
      <line x1={tPx} y1={tPx} x2={tPx + 6} y2={tPx} stroke="rgba(0,0,0,0.3)" strokeWidth={0.4} />
      <line x1={wPx - tPx} y1={tPx} x2={wPx - tPx - 6} y2={tPx} stroke="rgba(0,0,0,0.3)" strokeWidth={0.4} />
      <line x1={tPx} y1={hPx - tPx} x2={tPx + 6} y2={hPx - tPx} stroke="rgba(0,0,0,0.3)" strokeWidth={0.4} />
      <line x1={wPx - tPx} y1={hPx - tPx} x2={wPx - tPx - 6} y2={hPx - tPx} stroke="rgba(0,0,0,0.3)" strokeWidth={0.4} />
      {/* Кромка (белые полоски на рёбрах) */}
      <line x1={0.3} y1={0} x2={0.3} y2={hPx} stroke="rgba(255,255,255,0.08)" strokeWidth={0.3} />
      <line x1={wPx - 0.3} y1={0} x2={wPx - 0.3} y2={hPx} stroke="rgba(255,255,255,0.08)" strokeWidth={0.3} />
      <line x1={tPx + gap} y1={0.3} x2={wPx - tPx - gap} y2={0.3} stroke="rgba(255,255,255,0.08)" strokeWidth={0.3} />
      <line x1={tPx + gap} y1={hPx - 0.3} x2={wPx - tPx - gap} y2={hPx - 0.3} stroke="rgba(255,255,255,0.08)" strokeWidth={0.3} />
    </>
  );
}

export interface ZoneHighlightsCtx {
  zones: Zone[];
  placeMode: string | null;
  frameT: number;
  /** Все элементы — для определения занята ли зона. */
  elements: any[];
}

/**
 * Подсветка зон внутри шкафа:
 * - Обычный режим: тонкий пунктир оранжевого цвета
 * - При placeMode: зелёная подсветка свободных зон, красная — занятых
 */
export function renderZoneHighlights(ctx: ZoneHighlightsCtx): React.ReactNode {
  const { zones, placeMode, frameT, elements } = ctx;
  const zoneMode = !!placeMode;
  return zones.map((z, i) => {
    const isOccupied = zoneMode && (
      placeMode === "drawers" && elements.some(e => e.type === "drawers" && e.zoneId === z.id)
    );
    return (
      <rect
        key={`z${i}`}
        x={(z.sl + frameT) * SC}
        y={(z.top + frameT) * SC}
        width={z.sw * SC}
        height={(z.bot - z.top) * SC}
        fill={zoneMode
          ? (isOccupied ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)")
          : "rgba(25,23,20,0.3)"}
        stroke={zoneMode
          ? (isOccupied ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)")
          : "rgba(217,119,6,0.06)"}
        strokeWidth={zoneMode ? 1 : 0.5}
        strokeDasharray={zoneMode ? "4 2" : "2 2"}
        style={zoneMode && !isOccupied ? { cursor: "pointer" } : {}}
      />
    );
  });
}
