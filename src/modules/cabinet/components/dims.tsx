/**
 * SVG-компоненты размерных отметок:
 * - renderDims — обычные размеры по всем зонам (видны всегда)
 * - renderCorpusDims — размеры корпуса (ширина снизу, высота слева)
 * - renderSelectedDims — редактируемые размеры выделенной стойки/полки
 *   (показывает расстояния до соседей, изменение двигает выделенный элемент)
 * - renderDoorHitZones — расширенные hit-зоны ручек resize двери (поверх всего,
 *   чтобы не перекрывались линиями DIMS)
 */
import React from "react";
import { SC } from "../constants";
import { SvgInput } from "./inputs/SvgInput";
import type { Dim } from "../logic/dims";

// ───────────────────────────────────────────────────────────────
// DIMS — обычные размерные отметки (w и h)
// ───────────────────────────────────────────────────────────────

export interface DimsCtx {
  dims: Dim[];
  frameT: number;
  iH: number;
  getDimDir: (i: number) => string;
  changeHorizDim: (d: Dim, v: number, dir: string) => void;
  changeVertDim: (d: Dim, v: number, dir: string) => void;
}

export function renderDims(ctx: DimsCtx): React.ReactNode {
  const { dims, frameT, iH, getDimDir, changeHorizDim, changeVertDim } = ctx;
  return dims.map((d, i) => {
    const dir = getDimDir(i);
    if (d.t === "w") {
      const dx = (d.x + frameT) * SC;
      const dy = (iH + frameT) * SC + 16;
      const dw = (d.w ?? 0) * SC;
      return (
        <g key={`w${i}`}>
          <line x1={dx + 1} y1={dy} x2={dx + dw - 1} y2={dy} stroke="rgba(217,119,6,0.3)" strokeWidth={0.6} />
          <line x1={dx} y1={dy - 3} x2={dx} y2={dy + 3} stroke="rgba(217,119,6,0.3)" strokeWidth={0.4} />
          <line x1={dx + dw} y1={dy - 3} x2={dx + dw} y2={dy + 3} stroke="rgba(217,119,6,0.3)" strokeWidth={0.4} />
          <SvgInput x={dx + dw / 2} y={dy + 12} width={dw} value={Math.round(d.w ?? 0)} color="#b87a20" fontSize={9} onChange={v => changeHorizDim(d, v, dir)} />
        </g>
      );
    }
    if (d.t === "h") {
      const dx = (d.x + frameT) * SC - 22;
      const dy1 = ((d.y ?? 0) + frameT) * SC;
      const dy2 = ((d.y ?? 0) + (d.h ?? 0) + frameT) * SC;
      const mid = (dy1 + dy2) / 2;
      return (
        <g key={`h${i}`}>
          <line x1={dx} y1={dy1 + 1} x2={dx} y2={dy2 - 1} stroke="rgba(96,165,250,0.3)" strokeWidth={0.6} />
          <line x1={dx - 3} y1={dy1} x2={dx + 3} y2={dy1} stroke="rgba(96,165,250,0.3)" strokeWidth={0.4} />
          <line x1={dx - 3} y1={dy2} x2={dx + 3} y2={dy2} stroke="rgba(96,165,250,0.3)" strokeWidth={0.4} />
          <SvgInput x={dx - 3} y={mid + 3} width={40} value={Math.round(d.h ?? 0)} color="#5a8fd4" fontSize={8} onChange={v => changeVertDim(d, v, dir)} />
        </g>
      );
    }
    return null;
  });
}

// ───────────────────────────────────────────────────────────────
// CORPUS DIMS — общие размеры всего шкафа
// ───────────────────────────────────────────────────────────────

export interface CorpusDimsCtx {
  width: number;
  height: number;
  setCorpus: (updater: (c: any) => any) => void;
}

export function renderCorpusDims(ctx: CorpusDimsCtx): React.ReactNode {
  const { width, height, setCorpus } = ctx;
  return (
    <>
      <SvgInput
        x={width * SC / 2} y={height * SC + 38} width={60} fontSize={10}
        value={width} color="#777"
        onChange={v => setCorpus(c => ({ ...c, width: Math.max(300, Math.min(3000, v)) }))}
      />
      <text x={width * SC / 2 - 32} y={height * SC + 38} textAnchor="middle" fontSize={8} fill="#444">←</text>
      <text x={width * SC / 2 + 32} y={height * SC + 38} textAnchor="middle" fontSize={8} fill="#444">→</text>
      <SvgInput
        x={-48} y={height * SC / 2 + 3} width={40} fontSize={10}
        value={height} color="#777"
        onChange={v => setCorpus(c => ({ ...c, height: Math.max(400, Math.min(2700, v)) }))}
      />
    </>
  );
}

// ───────────────────────────────────────────────────────────────
// SELECTED DIMS — редактируемые размеры выделенной стойки/полки
// ───────────────────────────────────────────────────────────────

export interface SelectedDimsCtx {
  elements: any[];
  selId: string | null;
  frameT: number;
  iW: number;
  iH: number;
  t: number;
  updateEl: (id: string, upd: any) => void;
}

export function renderSelectedDims(ctx: SelectedDimsCtx): React.ReactNode {
  const { elements, selId, frameT, iW, iH, t, updateEl } = ctx;
  const selEl = elements.find(e => e.id === selId);
  if (!selEl) return null;

  if (selEl.type === "stud") {
    // Ближайшие соседи слева/справа
    const others = elements.filter(e => e.type === "stud" && e.id !== selEl.id).sort((a, b) => a.x - b.x);
    let leftNeighborRight = 0;
    let rightNeighborLeft = iW;
    for (const s of others) {
      if (s.x + t <= selEl.x && s.x + t > leftNeighborRight) leftNeighborRight = s.x + t;
      if (s.x >= selEl.x + t && s.x < rightNeighborLeft) rightNeighborLeft = s.x;
    }
    const distLeft = Math.round(selEl.x - leftNeighborRight);
    const distRight = Math.round(rightNeighborLeft - (selEl.x + t));

    const studCenterX = (selEl.x + t / 2 + frameT) * SC;
    const studTopY = ((selEl.pTop || 0) + frameT) * SC;
    const leftMidX = (leftNeighborRight + (selEl.x - leftNeighborRight) / 2 + frameT) * SC;
    const rightMidX = ((selEl.x + t) + (rightNeighborLeft - selEl.x - t) / 2 + frameT) * SC;
    const dimY = Math.max(studTopY - 18, 14);

    return (
      <>
        {/* Маркер выделенной стойки */}
        <rect x={studCenterX - 8} y={studTopY - 4} width={16} height={4} fill="#3b82f6" opacity={0.6} rx={1} style={{ pointerEvents: "none" }} />
        {/* Левый размер */}
        <line x1={(leftNeighborRight + frameT) * SC + 1} y1={dimY + 4} x2={studCenterX - 1} y2={dimY + 4} stroke="rgba(96,165,250,0.55)" strokeWidth={0.8} style={{ pointerEvents: "none" }} />
        <line x1={(leftNeighborRight + frameT) * SC} y1={dimY + 1} x2={(leftNeighborRight + frameT) * SC} y2={dimY + 7} stroke="rgba(96,165,250,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <line x1={studCenterX} y1={dimY + 1} x2={studCenterX} y2={dimY + 7} stroke="rgba(96,165,250,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <SvgInput
          x={leftMidX} y={dimY} width={50} fontSize={11}
          value={distLeft} color="#3b82f6"
          onChange={v => {
            // Увеличение отрезка слева → стойка двигается ВПРАВО
            const nx = Math.max(0, Math.min(iW - t, leftNeighborRight + v));
            updateEl(selEl.id, { x: nx });
          }}
        />
        {/* Правый размер */}
        <line x1={studCenterX + 1} y1={dimY + 4} x2={(rightNeighborLeft + frameT) * SC - 1} y2={dimY + 4} stroke="rgba(96,165,250,0.55)" strokeWidth={0.8} style={{ pointerEvents: "none" }} />
        <line x1={(rightNeighborLeft + frameT) * SC} y1={dimY + 1} x2={(rightNeighborLeft + frameT) * SC} y2={dimY + 7} stroke="rgba(96,165,250,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <SvgInput
          x={rightMidX} y={dimY} width={50} fontSize={11}
          value={distRight} color="#3b82f6"
          onChange={v => {
            // Увеличение отрезка справа → стойка двигается ВЛЕВО
            const nx = Math.max(0, Math.min(iW - t, rightNeighborLeft - v - t));
            updateEl(selEl.id, { x: nx });
          }}
        />
      </>
    );
  }

  if (selEl.type === "shelf") {
    const myLeft = selEl.x || 0;
    const myRight = myLeft + (selEl.w || iW);
    // Соседние полки с перекрытием по X
    const others = elements.filter(e => {
      if (e.type !== "shelf" || e.id === selEl.id) return false;
      const eL = e.x || 0, eR = eL + (e.w || iW);
      return eR > myLeft + 5 && eL < myRight - 5;
    }).sort((a, b) => a.y - b.y);
    let topNeighborY = 0, botNeighborY = iH;
    for (const sh of others) {
      if (sh.y <= selEl.y && sh.y > topNeighborY) topNeighborY = sh.y;
      if (sh.y >= selEl.y && sh.y < botNeighborY) botNeighborY = sh.y;
    }
    const distTop = Math.round((selEl.y || 0) - topNeighborY);
    const distBot = Math.round(botNeighborY - (selEl.y || 0));

    const shelfY = ((selEl.y || 0) + frameT) * SC;
    const shelfLeftX = (myLeft + frameT) * SC;
    const topMidY = (topNeighborY + ((selEl.y || 0) - topNeighborY) / 2 + frameT) * SC;
    const botMidY = ((selEl.y || 0) + (botNeighborY - (selEl.y || 0)) / 2 + frameT) * SC;
    const dimX = Math.max(shelfLeftX - 28, 14);

    return (
      <>
        {/* Маркер выделенной полки */}
        <rect x={shelfLeftX - 4} y={shelfY - 2} width={4} height={4} fill="#d97706" opacity={0.6} rx={1} style={{ pointerEvents: "none" }} />
        {/* Верхний размер */}
        <line x1={dimX + 4} y1={(topNeighborY + frameT) * SC + 1} x2={dimX + 4} y2={shelfY - 1} stroke="rgba(217,119,6,0.55)" strokeWidth={0.8} style={{ pointerEvents: "none" }} />
        <line x1={dimX + 1} y1={(topNeighborY + frameT) * SC} x2={dimX + 7} y2={(topNeighborY + frameT) * SC} stroke="rgba(217,119,6,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <line x1={dimX + 1} y1={shelfY} x2={dimX + 7} y2={shelfY} stroke="rgba(217,119,6,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <SvgInput
          x={dimX + 4} y={topMidY + 4} width={42} fontSize={10}
          value={distTop} color="#d97706"
          onChange={v => {
            // Увеличение отрезка сверху → полка идёт ВНИЗ
            const ny = Math.max(0, Math.min(iH, topNeighborY + v));
            updateEl(selEl.id, { y: ny });
          }}
        />
        {/* Нижний размер */}
        <line x1={dimX + 4} y1={shelfY + 1} x2={dimX + 4} y2={(botNeighborY + frameT) * SC - 1} stroke="rgba(217,119,6,0.55)" strokeWidth={0.8} style={{ pointerEvents: "none" }} />
        <line x1={dimX + 1} y1={(botNeighborY + frameT) * SC} x2={dimX + 7} y2={(botNeighborY + frameT) * SC} stroke="rgba(217,119,6,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <SvgInput
          x={dimX + 4} y={botMidY + 4} width={42} fontSize={10}
          value={distBot} color="#d97706"
          onChange={v => {
            const ny = Math.max(0, Math.min(iH, botNeighborY - v));
            updateEl(selEl.id, { y: ny });
          }}
        />
      </>
    );
  }

  return null;
}

// ───────────────────────────────────────────────────────────────
// DOOR HIT ZONES — расширенные зоны resize двери + inputs для W/H
// ───────────────────────────────────────────────────────────────

export interface DoorHitZonesCtx {
  elements: any[];
  selId: string | null;
  showDoors: boolean;
  frameT: number;
  iH: number;
  isMobile: boolean;
  onDoorEdgeDrag: (e: any, doorEl: any, edge: "top" | "bottom" | "left" | "right") => void;
  updateEl: (id: string, upd: any) => void;
}

export function renderDoorHitZones(ctx: DoorHitZonesCtx): React.ReactNode {
  const { elements, selId, showDoors, frameT, iH, isMobile, onDoorEdgeDrag, updateEl } = ctx;
  const selDoor = elements.find(e => e.id === selId && e.type === "door" && showDoors);
  if (!selDoor) return null;

  const dsx = ((selDoor.x || 0) + frameT) * SC;
  const dsy = ((selDoor.y || 0) + frameT) * SC;
  const ddw = (selDoor.w || 100) * SC;
  const ddh = (selDoor.h || iH) * SC;
  const HIT = isMobile ? 44 : 10;

  return (
    <>
      {/* TOP hit-zone */}
      <rect
        x={dsx + ddw / 2 - HIT} y={dsy - HIT / 2}
        width={HIT * 2} height={HIT}
        fill="transparent"
        style={{ cursor: "ns-resize" }}
        onMouseDown={e => onDoorEdgeDrag(e, selDoor, "top")}
        onTouchStart={e => onDoorEdgeDrag(e, selDoor, "top")}
      />
      {/* BOTTOM */}
      <rect
        x={dsx + ddw / 2 - HIT} y={dsy + ddh - HIT / 2}
        width={HIT * 2} height={HIT}
        fill="transparent"
        style={{ cursor: "ns-resize" }}
        onMouseDown={e => onDoorEdgeDrag(e, selDoor, "bottom")}
        onTouchStart={e => onDoorEdgeDrag(e, selDoor, "bottom")}
      />
      {/* LEFT */}
      <rect
        x={dsx - HIT / 2} y={dsy + ddh / 2 - HIT}
        width={HIT} height={HIT * 2}
        fill="transparent"
        style={{ cursor: "ew-resize" }}
        onMouseDown={e => onDoorEdgeDrag(e, selDoor, "left")}
        onTouchStart={e => onDoorEdgeDrag(e, selDoor, "left")}
      />
      {/* RIGHT */}
      <rect
        x={dsx + ddw - HIT / 2} y={dsy + ddh / 2 - HIT}
        width={HIT} height={HIT * 2}
        fill="transparent"
        style={{ cursor: "ew-resize" }}
        onMouseDown={e => onDoorEdgeDrag(e, selDoor, "right")}
        onTouchStart={e => onDoorEdgeDrag(e, selDoor, "right")}
      />
      {/* Width input — внутри двери, у нижнего края по центру */}
      <SvgInput
        x={dsx + ddw / 2} y={dsy + ddh - 12} width={50} fontSize={10}
        value={Math.round(selDoor.doorW || selDoor.w)}
        color="#d97706"
        onChange={v => {
          const oldX = selDoor.x || 0;
          const oldW = Math.round(selDoor.doorW || selDoor.w);
          let newX = oldX;
          if (selDoor.doorRightIsWall && !selDoor.doorLeftIsWall) {
            newX = oldX + oldW - v;
          } else if (!selDoor.doorLeftIsWall && !selDoor.doorRightIsWall) {
            newX = oldX - (v - oldW) / 2;
          }
          updateEl(selDoor.id, { w: v, doorW: v, x: newX, manualW: v });
        }}
      />
      {/* Height input — внутри двери, у левого края по центру */}
      <SvgInput
        x={dsx + 18} y={dsy + ddh / 2 + 3} width={36} fontSize={10}
        value={Math.round(selDoor.doorH || selDoor.h)}
        color="#5a8fd4"
        onChange={v => {
          const oldY = selDoor.y || 0;
          const oldH = Math.round(selDoor.doorH || selDoor.h);
          let newY = oldY;
          if (selDoor.doorBottomIsWall && !selDoor.doorTopIsWall) {
            newY = oldY + oldH - v;
          } else if (!selDoor.doorTopIsWall && !selDoor.doorBottomIsWall) {
            newY = oldY - (v - oldH) / 2;
          }
          updateEl(selDoor.id, { h: v, doorH: v, y: newY, manualH: v });
        }}
      />
    </>
  );
}

// ───────────────────────────────────────────────────────────────
// PanelHitZones — то же самое для панели (использует panel* поля)
// ───────────────────────────────────────────────────────────────

export interface PanelHitZonesCtx {
  elements: any[];
  selId: string | null;
  frameT: number;
  iH: number;
  isMobile: boolean;
  onPanelEdgeDrag: (e: any, panelEl: any, edge: "top" | "bottom" | "left" | "right") => void;
  updateEl: (id: string, upd: any) => void;
}

export function renderPanelHitZones(ctx: PanelHitZonesCtx): React.ReactNode {
  const { elements, selId, frameT, iH, isMobile, onPanelEdgeDrag, updateEl } = ctx;
  const selPanel = elements.find(e => e.id === selId && e.type === "panel");
  if (!selPanel) return null;

  const psx = ((selPanel.x || 0) + frameT) * SC;
  const psy = ((selPanel.y || 0) + frameT) * SC;
  const ppw = (selPanel.w || 100) * SC;
  const pph = (selPanel.h || iH) * SC;
  const HIT = isMobile ? 44 : 10;

  return (
    <>
      {/* TOP */}
      <rect
        x={psx + ppw / 2 - HIT} y={psy - HIT / 2}
        width={HIT * 2} height={HIT}
        fill="transparent"
        style={{ cursor: "ns-resize" }}
        onMouseDown={e => onPanelEdgeDrag(e, selPanel, "top")}
        onTouchStart={e => onPanelEdgeDrag(e, selPanel, "top")}
      />
      {/* BOTTOM */}
      <rect
        x={psx + ppw / 2 - HIT} y={psy + pph - HIT / 2}
        width={HIT * 2} height={HIT}
        fill="transparent"
        style={{ cursor: "ns-resize" }}
        onMouseDown={e => onPanelEdgeDrag(e, selPanel, "bottom")}
        onTouchStart={e => onPanelEdgeDrag(e, selPanel, "bottom")}
      />
      {/* LEFT */}
      <rect
        x={psx - HIT / 2} y={psy + pph / 2 - HIT}
        width={HIT} height={HIT * 2}
        fill="transparent"
        style={{ cursor: "ew-resize" }}
        onMouseDown={e => onPanelEdgeDrag(e, selPanel, "left")}
        onTouchStart={e => onPanelEdgeDrag(e, selPanel, "left")}
      />
      {/* RIGHT */}
      <rect
        x={psx + ppw - HIT / 2} y={psy + pph / 2 - HIT}
        width={HIT} height={HIT * 2}
        fill="transparent"
        style={{ cursor: "ew-resize" }}
        onMouseDown={e => onPanelEdgeDrag(e, selPanel, "right")}
        onTouchStart={e => onPanelEdgeDrag(e, selPanel, "right")}
      />
      {/* Width input */}
      <SvgInput
        x={psx + ppw / 2} y={psy + pph - 12} width={50} fontSize={10}
        value={Math.round(selPanel.panelW || selPanel.w)}
        color="#d97706"
        onChange={v => {
          const oldX = selPanel.x || 0;
          const oldW = Math.round(selPanel.panelW || selPanel.w);
          let newX = oldX;
          if (selPanel.panelRightIsWall && !selPanel.panelLeftIsWall) {
            newX = oldX + oldW - v;
          } else if (!selPanel.panelLeftIsWall && !selPanel.panelRightIsWall) {
            newX = oldX - (v - oldW) / 2;
          }
          updateEl(selPanel.id, { w: v, panelW: v, x: newX, manualW: v });
        }}
      />
      {/* Height input */}
      <SvgInput
        x={psx + 18} y={psy + pph / 2 + 3} width={36} fontSize={10}
        value={Math.round(selPanel.panelH || selPanel.h)}
        color="#5a8fd4"
        onChange={v => {
          const oldY = selPanel.y || 0;
          const oldH = Math.round(selPanel.panelH || selPanel.h);
          let newY = oldY;
          if (selPanel.panelBottomIsWall && !selPanel.panelTopIsWall) {
            newY = oldY + oldH - v;
          } else if (!selPanel.panelTopIsWall && !selPanel.panelBottomIsWall) {
            newY = oldY - (v - oldH) / 2;
          }
          updateEl(selPanel.id, { h: v, panelH: v, y: newY, manualH: v });
        }}
      />
    </>
  );
}
