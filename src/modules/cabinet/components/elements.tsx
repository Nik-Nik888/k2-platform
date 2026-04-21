/**
 * Render-функции SVG-элементов шкафа.
 * Каждая возвращает JSX готовый к вставке в <svg>.
 *
 * Общие параметры группы:
 * - ctx — контекст с размерами рамки, текстурами, флагами isMobile/showDoors
 * - onDown — общий обработчик начала drag
 */
import React from "react";
import { SC } from "../constants";

export interface RenderCtx {
  /** Внутренняя ширина рамки (mm). */
  iW: number;
  /** Внутренняя высота рамки (mm). */
  iH: number;
  /** Толщина ЛДСП (mm). */
  t: number;
  /** Смещение внутри рамки (0 когда корпус отключён, t когда включён). */
  frameT: number;
  /** id выделенного элемента (или null). */
  selId: string | null;
  /** Активен ли placeMode — во время постановки взаимодействие с элементами блокируется. */
  placeMode: string | null;
  /** Мобильное устройство (уплотняет ручки и hit-зоны). */
  isMobile: boolean;
  /** Показывать ли двери. */
  showDoors: boolean;
  /** Hex-цвет корпуса (для fill полок/стоек). */
  corpusHex: string;
  /** Hex-цвет фасадов и их название (для drawers/door). */
  facadeHex: string;
  facadeName: string;
  /** Обработчик начала drag. */
  onDown: (e: any, el: any) => void;
}

/** Вычислить базовые свойства элемента: координаты на SVG, выделен ли, и т.д. */
function getElBase(el: any, ctx: RenderCtx) {
  const sel = el.id === ctx.selId;
  const sx = ((el.x || 0) + ctx.frameT) * SC;
  const sy = ((el.y || 0) + ctx.frameT) * SC;
  const noPointer = !!ctx.placeMode;
  return { sel, sx, sy, noPointer };
}

/** ЛДСП-полка: прямоугольник с кромкой. Y-позиция с умным смещением у краёв. */
export function renderShelf(el: any, ctx: RenderCtx): React.ReactNode {
  const { sel, sx, sy, noPointer } = getElBase(el, ctx);
  const shW = (el.w || ctx.iW) * SC;
  const shH = ctx.t * SC;
  const shX = sx;
  // Smart Y: у верхней кромки (y≈0) — под линией, у нижней (y≈iH) — над, в середине — по центру
  const elY = el.y || 0;
  let shY: number;
  if (elY < 5) shY = sy;
  else if (elY > ctx.iH - 5) shY = sy - shH;
  else shY = sy - shH / 2;
  const jointGap = 0.3;
  // Частичная глубина: dashed линия + label «d:N»
  const hasCustomDepth = typeof el.depth === "number" && el.depth > 0;
  return (
    <g
      key={el.id}
      data-element="1"
      onMouseDown={noPointer ? undefined : e => ctx.onDown(e, el)}
      onTouchStart={noPointer ? undefined : e => ctx.onDown(e, el)}
      style={{ cursor: noPointer ? "default" : "ns-resize", pointerEvents: noPointer ? "none" : "auto" }}
    >
      {/* Расширенная hit-зона 16px для удобства клика на тонкую полку */}
      <rect x={shX} y={shY - 8 + shH / 2} width={shW} height={16} fill="transparent" />
      {/* ЛДСП панель */}
      <rect
        x={shX + jointGap}
        y={shY}
        width={shW - 2 * jointGap}
        height={shH}
        fill={sel ? "#3b82f6" : ctx.corpusHex}
        stroke={sel ? "#60a5fa" : "#6b5a45"}
        strokeWidth={sel ? 1.2 : 0.5}
        strokeDasharray={hasCustomDepth ? "3 1.5" : undefined}
      />
      {/* Передняя кромка */}
      <line
        x1={shX + jointGap}
        y1={shY}
        x2={shX + shW - jointGap}
        y2={shY}
        stroke={sel ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.08)"}
        strokeWidth={0.4}
      />
      {/* Стыки слева и справа */}
      <line x1={shX + 0.5} y1={shY} x2={shX + 0.5} y2={shY + shH} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />
      <line x1={shX + shW - 0.5} y1={shY} x2={shX + shW - 0.5} y2={shY + shH} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />
      {/* Метка глубины — только если задана вручную */}
      {hasCustomDepth && (
        <text
          x={shX + shW - 4}
          y={shY + shH + 6}
          textAnchor="end" fontSize={6}
          fill="#d97706"
          fontFamily="'IBM Plex Mono',monospace"
          style={{ pointerEvents: "none" }}
        >d:{el.depth}</text>
      )}
    </g>
  );
}

/** ЛДСП-стойка: вертикальная панель между ограничивающими полками. */
export function renderStud(el: any, ctx: RenderCtx): React.ReactNode {
  const { sel } = getElBase(el, ctx);
  const studLeft = ((el.x || 0) + ctx.frameT) * SC;
  const studW = ctx.t * SC;
  const pTopPx = ((el.pTop || 0) + ctx.frameT) * SC;
  const pBotPx = ((el.pBot || ctx.iH) + ctx.frameT) * SC;
  const pH = pBotPx - pTopPx;
  const jointGap = 0.3;
  const hasCustomDepth = typeof el.depth === "number" && el.depth > 0;
  return (
    <g
      key={el.id}
      data-element="1"
      onMouseDown={e => ctx.onDown(e, el)}
      onTouchStart={e => ctx.onDown(e, el)}
      style={{ cursor: "ew-resize" }}
    >
      {/* Расширенная hit-зона 16px */}
      <rect x={studLeft - 8 + studW / 2} y={pTopPx} width={16} height={pH} fill="transparent" />
      {/* ЛДСП панель */}
      <rect
        x={studLeft}
        y={pTopPx + jointGap}
        width={studW}
        height={pH - 2 * jointGap}
        fill={sel ? "#3b82f6" : ctx.corpusHex}
        stroke={sel ? "#60a5fa" : "#5a4d3f"}
        strokeWidth={sel ? 1.2 : 0.5}
        strokeDasharray={hasCustomDepth ? "3 1.5" : undefined}
      />
      {/* Передняя кромка */}
      <line
        x1={studLeft}
        y1={pTopPx + jointGap}
        x2={studLeft}
        y2={pBotPx - jointGap}
        stroke={sel ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.08)"}
        strokeWidth={0.4}
      />
      {/* Стыки с полками */}
      <line x1={studLeft - 2} y1={pTopPx + jointGap} x2={studLeft + studW + 2} y2={pTopPx + jointGap} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />
      <line x1={studLeft - 2} y1={pBotPx - jointGap} x2={studLeft + studW + 2} y2={pBotPx - jointGap} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />
      {/* Конфирматы сверху/снизу */}
      <circle cx={studLeft + studW / 2} cy={pTopPx + jointGap + 3} r={0.8} fill="rgba(0,0,0,0.2)" />
      <circle cx={studLeft + studW / 2} cy={pBotPx - jointGap - 3} r={0.8} fill="rgba(0,0,0,0.2)" />
      {/* Метка глубины — если задана вручную */}
      {hasCustomDepth && (
        <text
          x={studLeft + studW + 4}
          y={pTopPx + pH / 2}
          textAnchor="start" fontSize={6}
          fill="#d97706"
          fontFamily="'IBM Plex Mono',monospace"
          style={{ pointerEvents: "none" }}
        >d:{el.depth}</text>
      )}
    </g>
  );
}

/** Блок ящиков: стек фасадов с зазором 2мм между ними. */
export function renderDrawers(el: any, ctx: RenderCtx): React.ReactNode {
  const { sel, sx, sy } = getElBase(el, ctx);
  const cnt = el.count || 3;
  const heights = el.drawerHeights || Array(cnt).fill(Math.floor((el.h || 450) / cnt));
  const guideColor = (el.guideType || "roller") === "tandem" ? "#f59e0b"
    : (el.guideType || "roller") === "ball" ? "#60a5fa" : "#22c55e";
  const elW = (el.w || 100) * SC;
  const facadeGap = 2 * SC;
  let accY = 0;
  return (
    <g
      key={el.id}
      data-element="1"
      onMouseDown={e => ctx.onDown(e, el)}
      onTouchStart={e => ctx.onDown(e, el)}
      style={{ cursor: "move" }}
    >
      {Array.from({ length: cnt }, (_, i) => {
        const dH = (heights[i] || 150) * SC;
        const dy = sy + accY * SC;
        accY += heights[i] || 150;
        const facH = dH - facadeGap;
        return (
          <g key={i}>
            {/* Внутренний контур ящика */}
            <rect
              x={sx + 4} y={dy + facadeGap / 2 + 2}
              width={elW - 8} height={facH - 4}
              fill="none"
              stroke={sel ? `${guideColor}33` : "rgba(70,60,45,0.15)"}
              strokeWidth={0.4}
              strokeDasharray="2 1"
            />
            {/* ЛДСП фасад */}
            <rect
              x={sx + 1} y={dy + facadeGap / 2}
              width={elW - 2} height={facH}
              fill={sel ? `${guideColor}18` : ctx.facadeHex}
              fillOpacity={0.85}
              stroke={sel ? guideColor : "#8a7a6a"}
              strokeWidth={sel ? 1.2 : 0.5}
            />
            {/* Верхняя кромка фасада */}
            <line
              x1={sx + 1} y1={dy + facadeGap / 2 + 0.3}
              x2={sx + elW - 1} y2={dy + facadeGap / 2 + 0.3}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={0.3}
            />
            {/* Ручка */}
            <rect
              x={sx + elW / 2 - 10} y={dy + facadeGap / 2 + facH / 2 - 1}
              width={20} height={2.5}
              fill={sel ? guideColor : "#777"}
              rx={1}
            />
            {/* Подпись высоты */}
            <text
              x={sx + elW - 8} y={dy + facadeGap / 2 + facH / 2 + 3}
              textAnchor="end" fontSize={6}
              fill={sel ? guideColor : "#444"}
              fontFamily="'IBM Plex Mono',monospace"
            >
              {heights[i] || 150}
            </text>
          </g>
        );
      })}
      {/* Метка глубины — если задана вручную */}
      {typeof el.depth === "number" && el.depth > 0 && (
        <text
          x={sx + elW / 2}
          y={sy - 2}
          textAnchor="middle" fontSize={6}
          fill="#d97706"
          fontFamily="'IBM Plex Mono',monospace"
          style={{ pointerEvents: "none" }}
        >d:{el.depth}</text>
      )}
    </g>
  );
}

/** Штанга — простая линия с кружками на концах. */
export function renderRod(el: any, ctx: RenderCtx): React.ReactNode {
  const { sel, sx, sy } = getElBase(el, ctx);
  const rodW = (el.w || 100) * SC;
  return (
    <g
      key={el.id}
      data-element="1"
      onMouseDown={e => ctx.onDown(e, el)}
      onTouchStart={e => ctx.onDown(e, el)}
      style={{ cursor: "move" }}
    >
      <line x1={sx} y1={sy} x2={sx + rodW} y2={sy} stroke={sel ? "#a855f7" : "#777"} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={sx} cy={sy} r={3} fill={sel ? "#a855f7" : "#555"} />
      <circle cx={sx + rodW} cy={sy} r={3} fill={sel ? "#a855f7" : "#555"} />
    </g>
  );
}

/** Дверь — фасад с ручкой, петлями и оранжевыми ручками resize (при выделении). */
export function renderDoor(el: any, ctx: RenderCtx): React.ReactNode {
  const { sel, sx, sy } = getElBase(el, ctx);
  const dw = (el.w || 100) * SC;
  const dh = (el.h || ctx.iH) * SC;
  const isL = el.hingeSide === "left";
  const hn = (el.h || 600) > 1800 ? 4 : (el.h || 600) > 1200 ? 3 : 2;
  const hps = Array.from({ length: hn }, (_, i) => i === 0 ? 0.08 : i === hn - 1 ? 0.92 : i / (hn - 1));
  const fHex = ctx.facadeHex;
  const isDark = parseInt(fHex.replace('#', ''), 16) < 0x666666;
  // На мобильном ручки для resize шире + сам handle "длиннее"
  const HANDLE = ctx.isMobile ? 14 : 6;
  const LEN = ctx.isMobile ? 48 : 24;
  return (
    <g
      key={el.id}
      data-element="1"
      onMouseDown={e => ctx.onDown(e, el)}
      onTouchStart={e => ctx.onDown(e, el)}
      style={{ cursor: "pointer" }}
    >
      <rect
        x={sx} y={sy} width={dw} height={dh}
        fill={fHex} fillOpacity={0.85}
        stroke={sel ? "#fbbf24" : isDark ? "#5a4a3a" : "#bbb"}
        strokeWidth={sel ? 1.5 : 0.7}
        rx={1}
      />
      <circle cx={isL ? sx + dw - 8 : sx + 8} cy={sy + dh / 2} r={2.5} fill={isDark ? "#aaa" : "#555"} />
      {hps.map((p, hi) => (
        <rect key={hi}
          x={isL ? sx - 1 : sx + dw - 3}
          y={sy + dh * p - 4}
          width={4} height={8} rx={1}
          fill={isDark ? "#888" : "#555"}
        />
      ))}
      <text
        x={sx + dw / 2} y={sy + dh / 2 + 3}
        textAnchor="middle" fontSize={7}
        fill={isDark ? "#ccc" : "#555"}
        fontFamily="'IBM Plex Mono',monospace" opacity={0.6}
      >
        {ctx.facadeName}
      </text>
      {sel && (
        <>
          {/* Оранжевые ручки resize (pointerEvents: none — hit-zones рисуются отдельно в overlay). */}
          <rect x={sx + dw / 2 - LEN / 2} y={sy - HANDLE / 2} width={LEN} height={HANDLE} rx={2} fill="#d97706" opacity={0.9} style={{ pointerEvents: "none" }} />
          <rect x={sx + dw / 2 - LEN / 2} y={sy + dh - HANDLE / 2} width={LEN} height={HANDLE} rx={2} fill="#d97706" opacity={0.9} style={{ pointerEvents: "none" }} />
          <rect x={sx - HANDLE / 2} y={sy + dh / 2 - LEN / 2} width={HANDLE} height={LEN} rx={2} fill="#d97706" opacity={0.9} style={{ pointerEvents: "none" }} />
          <rect x={sx + dw - HANDLE / 2} y={sy + dh / 2 - LEN / 2} width={HANDLE} height={LEN} rx={2} fill="#d97706" opacity={0.9} style={{ pointerEvents: "none" }} />
          {/* Пунктирные линии размеров — под и слева от двери (SvgInput в overlay в конце SVG). */}
          <line x1={sx + 1} y1={sy + dh + 6} x2={sx + dw - 1} y2={sy + dh + 6} stroke="rgba(217,119,6,0.4)" strokeWidth={0.5} style={{ pointerEvents: "none" }} />
          <line x1={sx} y1={sy + dh + 3} x2={sx} y2={sy + dh + 9} stroke="rgba(217,119,6,0.4)" strokeWidth={0.4} style={{ pointerEvents: "none" }} />
          <line x1={sx + dw} y1={sy + dh + 3} x2={sx + dw} y2={sy + dh + 9} stroke="rgba(217,119,6,0.4)" strokeWidth={0.4} style={{ pointerEvents: "none" }} />
          <line x1={sx - 6} y1={sy + 1} x2={sx - 6} y2={sy + dh - 1} stroke="rgba(96,165,250,0.4)" strokeWidth={0.5} style={{ pointerEvents: "none" }} />
          <line x1={sx - 9} y1={sy} x2={sx - 3} y2={sy} stroke="rgba(96,165,250,0.4)" strokeWidth={0.4} style={{ pointerEvents: "none" }} />
          <line x1={sx - 9} y1={sy + dh} x2={sx - 3} y2={sy + dh} stroke="rgba(96,165,250,0.4)" strokeWidth={0.4} style={{ pointerEvents: "none" }} />
        </>
      )}
    </g>
  );
}

/** Диспетчер: вернуть JSX элемента нужного типа. */
export function renderElement(el: any, ctx: RenderCtx): React.ReactNode {
  switch (el.type) {
    case "shelf": return renderShelf(el, ctx);
    case "stud": return renderStud(el, ctx);
    case "drawers": return renderDrawers(el, ctx);
    case "rod": return renderRod(el, ctx);
    case "door": return ctx.showDoors ? renderDoor(el, ctx) : null;
    default: return null;
  }
}
