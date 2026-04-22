/**
 * Три mobile bottom-sheet'а: Инструменты, Свойства выделенного элемента, Итого.
 * Каждый — React-компонент с явными пропсами.
 */
import React from "react";
import { NumInput } from "./inputs/NumInput";
import { DepthControl } from "./inputs/DepthControl";
import { TexturePicker } from "./TexturePicker";
import { TOOLS, GUIDES, HINGES } from "../constants";
import { computePanelDimensions, computeDoorDimensions } from "../logic/placement";
import { findDoorBounds } from "../logic/doorBounds";

// ───────────────────────────────────────────────────────────────
// MobileToolsSheet — размеры корпуса, выбор инструмента, TexturePicker
// ───────────────────────────────────────────────────────────────

export interface MobileToolsSheetProps {
  corpus: { width: number; height: number; depth: number; thickness: number };
  setCorpus: (updater: (c: any) => any) => void;
  showCorpus: boolean;
  setShowCorpus: (fn: (p: boolean) => boolean) => void;
  placeMode: string | null;
  addEl: (type: string) => void;
  setMobileSheet: (v: null | 'tools' | 'props' | 'summary') => void;
  corpusTextureId: string;
  facadeTextureId: string;
  setCorpusTextureId: (id: string) => void;
  setFacadeTextureId: (id: string) => void;
  customTextures: any[];
  setCustomTextures: (fn: (prev: any[]) => any[]) => void;
  customBrands: string[];
  setCustomBrands: (fn: (prev: string[]) => string[]) => void;
}

export function MobileToolsSheet(props: MobileToolsSheetProps) {
  const {
    corpus, setCorpus, showCorpus, setShowCorpus,
    placeMode, addEl, setMobileSheet,
    corpusTextureId, facadeTextureId, setCorpusTextureId, setFacadeTextureId,
    customTextures, setCustomTextures, customBrands, setCustomBrands,
  } = props;

  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 8 }}>Размеры корпуса</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          {[{ k: "width", l: "Ширина", mn: 300, mx: 3000 }, { k: "height", l: "Высота", mn: 300, mx: 2700 }, { k: "depth", l: "Глубина", mn: 250, mx: 700 }].map(p => (
            <div key={p.k}>
              <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>{p.l}</div>
              <NumInput value={corpus[p.k as keyof typeof corpus] as number} onChange={v => setCorpus(c => ({ ...c, [p.k]: v }))} min={p.mn} max={p.mx} width="100%" />
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Толщина ЛДСП, мм</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[16, 18, 22].map(th => (
              <button key={th} onClick={() => setCorpus(c => ({ ...c, thickness: th }))} style={{
                flex: 1, padding: "10px 0", borderRadius: 6, fontSize: 13, fontWeight: 700,
                cursor: "pointer", border: "none",
                background: corpus.thickness === th ? "#d97706" : "rgba(30,30,40,0.5)",
                color: corpus.thickness === th ? "#000" : "#9ca3af",
              }}>{th}</button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowCorpus(p => !p)} style={{
          width: "100%", padding: "10px 0", borderRadius: 6, fontSize: 12, fontWeight: 700,
          cursor: "pointer", border: "1px solid",
          background: showCorpus ? "rgba(217,119,6,0.12)" : "rgba(100,100,100,0.08)",
          color: showCorpus ? "#d97706" : "#888",
          borderColor: showCorpus ? "rgba(217,119,6,0.3)" : "#333",
        }}>{showCorpus ? "☑ Корпус ЛДСП" : "☐ Пустая рамка"}</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 8 }}>Добавить элемент</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {TOOLS.map(it => (
            <button key={it.type} onClick={() => { addEl(it.type); setMobileSheet(null); }} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "14px 12px", borderRadius: 8,
              cursor: "pointer",
              background: placeMode === it.type ? "rgba(34,197,94,0.15)" : "rgba(30,30,40,0.4)",
              border: placeMode === it.type ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(60,60,70,0.3)",
              color: placeMode === it.type ? "#22c55e" : "#d1d5db",
              fontSize: 13,
              fontWeight: 600,
              minHeight: 52,
            }}>
              <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{it.icon}</span>
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 8 }}>Материалы</div>
        <TexturePicker
          corpusTextureId={corpusTextureId}
          facadeTextureId={facadeTextureId}
          onCorpusChange={setCorpusTextureId}
          onFacadeChange={setFacadeTextureId}
          customTextures={customTextures}
          onAddCustom={(tex) => setCustomTextures(prev => [...prev, tex])}
          customBrands={customBrands}
          onAddBrand={(name) => setCustomBrands(prev => [...prev, name])}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// MobilePropsSheet — свойства выделенного элемента
// ───────────────────────────────────────────────────────────────

export interface MobilePropsSheetProps {
  selEl: any | null;
  elements: any[];
  updateEl: (id: string, upd: any) => void;
  delSel: () => void;
  iW: number;
  iH: number;
  t: number;
  /** Глубина корпуса в мм — для DepthControl. */
  corpusDepth: number;
  mobileDragMode: string | null;
  setMobileDragMode: (v: string | null) => void;
  setMobileSheet: (v: null | 'tools' | 'props' | 'summary') => void;
}

export function MobilePropsSheet(props: MobilePropsSheetProps) {
  const {
    selEl, elements, updateEl, delSel,
    iW, iH, t, corpusDepth,
    mobileDragMode, setMobileDragMode, setMobileSheet,
  } = props;

  if (!selEl) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "#666", fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>👆</div>
        Тапни элемент на схеме, чтобы редактировать его свойства.
      </div>
    );
  }

  return (
    <div style={{ fontSize: 13 }}>
      {selEl.type === "drawers" && (() => {
        const cnt = selEl.count || 3;
        const heights = selEl.drawerHeights || Array(cnt).fill(150);
        return (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Количество ящиков</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => updateEl(selEl.id, { count: n })} style={{
                    flex: 1, padding: "12px 0", borderRadius: 6, fontSize: 14, fontWeight: 700,
                    cursor: "pointer", border: "none",
                    background: cnt === n ? "#22c55e" : "rgba(30,30,40,0.5)",
                    color: cnt === n ? "#000" : "#888",
                  }}>{n}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Высоты ящиков, мм</div>
              {Array.from({ length: cnt }, (_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#888", width: 24 }}>{i + 1}.</span>
                  <NumInput value={heights[i] || 150} onChange={v => { const nh = [...heights]; nh[i] = Math.max(60, Math.min(600, v)); updateEl(selEl.id, { drawerHeights: nh }); }} min={60} max={600} color="#22c55e" width="100%" />
                </div>
              ))}
              <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>Σ {heights.slice(0, cnt).reduce((a: number, b: number) => a + b, 0)}мм</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Направляющие</div>
              {GUIDES.map(gt => (
                <button key={gt.id} onClick={() => updateEl(selEl.id, { guideType: gt.id })} style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "12px 14px", borderRadius: 6, fontSize: 13, marginBottom: 6,
                  cursor: "pointer", border: "1px solid transparent",
                  background: (selEl.guideType || "roller") === gt.id ? "rgba(34,197,94,0.12)" : "rgba(30,30,40,0.4)",
                  color: (selEl.guideType || "roller") === gt.id ? "#22c55e" : "#9ca3af",
                  borderColor: (selEl.guideType || "roller") === gt.id ? "rgba(34,197,94,0.3)" : "transparent",
                }}><b>{gt.label}</b> <span style={{ color: "#666", marginLeft: 8 }}>~{gt.p}₽</span></button>
              ))}
            </div>
          </>
        );
      })()}

      {selEl.type === "door" && (
        <>
          {/* Размеры двери: Ширина общая, Высота отдельно ↑ и ↓ */}
          {selEl.doorLeft !== undefined && (() => {
            const doorW = Math.round(selEl.doorW || selEl.w);
            const doorH = Math.round(selEl.doorH || selEl.h);
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Размеры, мм</div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Ширина</div>
                  <NumInput value={doorW} onChange={v => {
                    const oldX = selEl.x || 0;
                    const oldW = doorW;
                    let newX = oldX;
                    if (selEl.doorRightIsWall && !selEl.doorLeftIsWall) newX = oldX + oldW - v;
                    else if (!selEl.doorLeftIsWall && !selEl.doorRightIsWall) newX = oldX - (v - oldW) / 2;
                    updateEl(selEl.id, { w: v, doorW: v, x: newX, manualW: v });
                  }} min={20} max={iW} color="#d97706" width="100%" />
                </div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Высота</div>
                <div style={{ fontSize: 9, color: "#666", marginBottom: 6 }}>Текущая: {doorH}мм. Измени нужное поле — граница сдвинется:</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>↑ Расти вверх</div>
                    <NumInput value={doorH} onChange={v => {
                      const newTop = Math.max(0, (selEl.doorBottom ?? iH) - v);
                      updateEl(selEl.id, {
                        doorTop: newTop,
                        doorTopIsWall: newTop < 1,
                        manualH: undefined,
                      });
                      try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
                    }} min={50} max={iH} color="#5a8fd4" width="100%" />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Расти вниз ↓</div>
                    <NumInput value={doorH} onChange={v => {
                      const newBot = Math.min(iH, (selEl.doorTop ?? 0) + v);
                      updateEl(selEl.id, {
                        doorBottom: newBot,
                        doorBottomIsWall: newBot > iH - 1,
                        manualH: undefined,
                      });
                      try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
                    }} min={50} max={iH} color="#5a8fd4" width="100%" />
                  </div>
                </div>
              </div>
            );
          })()}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Тип петли</div>
            {HINGES.map(ht => (
              <button key={ht.id} onClick={() => {
                // При смене типа (overlay ↔ insert) пересчитываем размеры двери.
                // Находим актуальные границы проёма через findDoorBounds по центру двери
                // — это даёт свежую картину с учётом изменившихся полок/стоек.
                const cx = (selEl.x || 0) + (selEl.w || 400) / 2;
                const cy = (selEl.y || 0) + (selEl.h || 600) / 2;
                const bounds = findDoorBounds(elements, cx, cy, iW, iH, t);
                const dims = computeDoorDimensions(
                  bounds.left.x ?? 0, bounds.right.x ?? iW,
                  bounds.top.y ?? 0, bounds.bottom.y ?? iH,
                  bounds.left.isWall, bounds.right.isWall,
                  bounds.top.isWall, bounds.bottom.isWall,
                  ht.id as "overlay" | "insert",
                  iW, iH, t,
                );
                // Обновляем также поля границ (doorLeft/Right/Top/Bottom) — они могли
                // быть устаревшими после добавления полок/стоек.
                updateEl(selEl.id, {
                  hingeType: ht.id,
                  ...dims,
                  doorLeft: bounds.left.x ?? 0, doorRight: bounds.right.x ?? iW,
                  doorTop: bounds.top.y ?? 0, doorBottom: bounds.bottom.y ?? iH,
                  doorLeftIsWall: bounds.left.isWall, doorRightIsWall: bounds.right.isWall,
                  doorTopIsWall: bounds.top.isWall, doorBottomIsWall: bounds.bottom.isWall,
                });
              }} style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "12px 14px", borderRadius: 6, fontSize: 13, marginBottom: 6,
                cursor: "pointer", border: "1px solid transparent",
                background: (selEl.hingeType || "overlay") === ht.id ? "rgba(217,119,6,0.12)" : "rgba(30,30,40,0.4)",
                color: (selEl.hingeType || "overlay") === ht.id ? "#d97706" : "#9ca3af",
              }}>{ht.label}</button>
            ))}
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Сторона петель</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["left", "right"].map(s => (
                <button key={s} onClick={() => updateEl(selEl.id, { hingeSide: s })} style={{
                  flex: 1, padding: "12px 0", borderRadius: 6, fontSize: 13, fontWeight: 700,
                  cursor: "pointer", border: "none",
                  background: selEl.hingeSide === s ? "#d97706" : "rgba(30,30,40,0.5)",
                  color: selEl.hingeSide === s ? "#000" : "#888",
                }}>{s === "left" ? "← Лево" : "Право →"}</button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 10, lineHeight: 1.5 }}>
            {(selEl.hingeType || "overlay") === "overlay" ? "Накладная: +14мм корпус / +7мм стойка" : "Вкладная: зазор 2мм"}
            {selEl.doorLeft !== undefined && <><br />Границы: {Math.round(selEl.doorLeft)}–{Math.round(selEl.doorRight)} × {Math.round(selEl.doorTop)}–{Math.round(selEl.doorBottom)}</>}
          </div>
        </>
      )}

      {selEl.type === "panel" && (
        <>
          {/* Размеры панели: ширина + высота (как дверь, но без петель) */}
          {selEl.panelLeft !== undefined && (() => {
            const panelW = Math.round(selEl.panelW || selEl.w);
            const panelH = Math.round(selEl.panelH || selEl.h);
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Размеры, мм</div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Ширина</div>
                  <NumInput value={panelW} onChange={v => {
                    const oldX = selEl.x || 0;
                    const oldW = panelW;
                    let newX = oldX;
                    if (selEl.panelRightIsWall && !selEl.panelLeftIsWall) newX = oldX + oldW - v;
                    else if (!selEl.panelLeftIsWall && !selEl.panelRightIsWall) newX = oldX - (v - oldW) / 2;
                    updateEl(selEl.id, { w: v, panelW: v, x: newX, manualW: v });
                  }} min={20} max={iW} color="#d97706" width="100%" />
                </div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Высота</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>↑ Расти вверх</div>
                    <NumInput value={panelH} onChange={v => {
                      const newTop = Math.max(0, (selEl.panelBottom ?? iH) - v);
                      updateEl(selEl.id, {
                        panelTop: newTop,
                        panelTopIsWall: newTop < 1,
                        manualH: undefined,
                      });
                    }} min={20} max={iH} color="#5a8fd4" width="100%" />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Расти вниз ↓</div>
                    <NumInput value={panelH} onChange={v => {
                      const newBot = Math.min(iH, (selEl.panelTop ?? 0) + v);
                      updateEl(selEl.id, {
                        panelBottom: newBot,
                        panelBottomIsWall: newBot > iH - 1,
                        manualH: undefined,
                      });
                    }} min={20} max={iH} color="#5a8fd4" width="100%" />
                  </div>
                </div>
              </div>
            );
          })()}
          {/* Тип панели — накладная/вкладная */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Тип установки</div>
            {HINGES.map(pt => (
              <button key={pt.id} onClick={() => {
                // При переключении типа берём свежие границы проёма через findDoorBounds.
                const cx = (selEl.x || 0) + (selEl.w || 400) / 2;
                const cy = (selEl.y || 0) + (selEl.h || 100) / 2;
                const bounds = findDoorBounds(elements, cx, cy, iW, iH, t);
                const dims = computePanelDimensions(
                  bounds.left.x ?? 0, bounds.right.x ?? iW,
                  bounds.top.y ?? 0, bounds.bottom.y ?? iH,
                  bounds.left.isWall, bounds.right.isWall,
                  bounds.top.isWall, bounds.bottom.isWall,
                  pt.id as "overlay" | "insert",
                  iW, iH, t,
                );
                updateEl(selEl.id, {
                  panelType: pt.id,
                  ...dims,
                  panelLeft: bounds.left.x ?? 0, panelRight: bounds.right.x ?? iW,
                  panelTop: bounds.top.y ?? 0, panelBottom: bounds.bottom.y ?? iH,
                  panelLeftIsWall: bounds.left.isWall, panelRightIsWall: bounds.right.isWall,
                  panelTopIsWall: bounds.top.isWall, panelBottomIsWall: bounds.bottom.isWall,
                });
              }} style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "12px 14px", borderRadius: 6, fontSize: 13, marginBottom: 6,
                cursor: "pointer", border: "1px solid transparent",
                background: (selEl.panelType || "overlay") === pt.id ? "rgba(217,119,6,0.12)" : "rgba(30,30,40,0.4)",
                color: (selEl.panelType || "overlay") === pt.id ? "#d97706" : "#9ca3af",
              }}>{pt.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 10, lineHeight: 1.5 }}>
            {(selEl.panelType || "overlay") === "overlay"
              ? "Накладная: закрывает торцы (+14мм корпус / +7мм стойка)"
              : "Вкладная: утоплена в проём, зазор 2мм"}
          </div>
        </>
      )}

      {selEl.type === "stud" && (() => {
        // Соседние stud/стенки слева и справа
        const others = elements.filter(e => e.type === "stud" && e.id !== selEl.id).sort((a, b) => a.x - b.x);
        let leftNeighborRight = 0;
        let rightNeighborLeft = iW;
        for (const s of others) {
          if (s.x + t <= selEl.x && s.x + t > leftNeighborRight) leftNeighborRight = s.x + t;
          if (s.x >= selEl.x + t && s.x < rightNeighborLeft) rightNeighborLeft = s.x;
        }
        const distLeft = Math.round(selEl.x - leftNeighborRight);
        const distRight = Math.round(rightNeighborLeft - (selEl.x + t));
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Позиция относительно соседей, мм</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>← Слева</div>
                <NumInput value={distLeft} onChange={v => {
                  const nx = Math.max(0, Math.min(iW - t, leftNeighborRight + v));
                  updateEl(selEl.id, { x: nx });
                }} min={0} max={iW} color="#60a5fa" width="100%" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Справа →</div>
                <NumInput value={distRight} onChange={v => {
                  const nx = Math.max(0, Math.min(iW - t, rightNeighborLeft - v - t));
                  updateEl(selEl.id, { x: nx });
                }} min={0} max={iW} color="#60a5fa" width="100%" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Верх</div>
                <NumInput value={Math.round(selEl.pTop || 0)} onChange={v => updateEl(selEl.id, { pTop: v, manualPTop: v })} min={0} max={iH} color="#60a5fa" width="100%" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Низ</div>
                <NumInput value={Math.round(selEl.pBot || iH)} onChange={v => updateEl(selEl.id, { pBot: v, manualPBot: v })} min={0} max={iH} color="#60a5fa" width="100%" />
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>Высота: {Math.round((selEl.pBot || iH) - (selEl.pTop || 0))}мм</div>
            <button
              onClick={() => {
                const cx = Math.round((leftNeighborRight + rightNeighborLeft - t) / 2);
                updateEl(selEl.id, { x: Math.max(0, Math.min(iW - t, cx)) });
                try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
              }}
              style={{
                marginTop: 10, width: "100%", padding: "12px 0", borderRadius: 8,
                background: "rgba(96,165,250,0.12)", color: "#60a5fa",
                fontSize: 13, fontWeight: 700,
                border: "1px solid rgba(96,165,250,0.3)",
                cursor: "pointer",
              }}
            >⟷ По центру между соседними</button>
          </div>
        );
      })()}

      {selEl.type === "shelf" && (() => {
        // Соседние полки с перекрытием по X
        const myLeft = selEl.x || 0;
        const myRight = myLeft + (selEl.w || iW);
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
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Позиция относительно соседей, мм</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>↑ Сверху</div>
                <NumInput value={distTop} onChange={v => {
                  const ny = Math.max(0, Math.min(iH, topNeighborY + v));
                  updateEl(selEl.id, { y: ny });
                }} min={0} max={iH} color="#d97706" width="100%" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Снизу ↓</div>
                <NumInput value={distBot} onChange={v => {
                  const ny = Math.max(0, Math.min(iH, botNeighborY - v));
                  updateEl(selEl.id, { y: ny });
                }} min={0} max={iH} color="#d97706" width="100%" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>X (от левой)</div>
                <NumInput value={Math.round(selEl.x || 0)} onChange={v => updateEl(selEl.id, { x: v, manualX: v })} min={0} max={iW} color="#d97706" width="100%" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Ширина</div>
                <NumInput value={Math.round(selEl.w || iW)} onChange={v => updateEl(selEl.id, { w: v, manualW: v })} min={20} max={iW} color="#d97706" width="100%" />
              </div>
            </div>
            <button
              onClick={() => {
                const cy = Math.round((topNeighborY + botNeighborY) / 2);
                updateEl(selEl.id, { y: Math.max(0, Math.min(iH, cy)) });
                try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
              }}
              style={{
                marginTop: 10, width: "100%", padding: "12px 0", borderRadius: 8,
                background: "rgba(217,119,6,0.12)", color: "#d97706",
                fontSize: 13, fontWeight: 700,
                border: "1px solid rgba(217,119,6,0.3)",
                cursor: "pointer",
              }}
            >⟷ По центру между соседними</button>
          </div>
        );
      })()}

      {/* Глубина — для всех типов кроме двери (дверь всегда на фронте корпуса).
          Для panel используем упрощённый UI "Положение по глубине". */}
      {selEl.type !== "door" && (
        <DepthControl
          corpusDepth={corpusDepth}
          depth={selEl.depth}
          depthOffset={selEl.depthOffset}
          onChange={({ depth, depthOffset }) => updateEl(selEl.id, { depth, depthOffset })}
          mode={selEl.type === "panel" ? "positionOnly" : "full"}
        />
      )}

      {/* Кнопка включения режима перемещения (дублирует indicator в header) */}
      <button
        onClick={() => {
          if (mobileDragMode === selEl.id) {
            setMobileDragMode(null);
          } else {
            setMobileDragMode(selEl.id);
            try { if (navigator.vibrate) navigator.vibrate([15, 30, 15]); } catch {}
          }
          setMobileSheet(null);
        }}
        style={{
          width: "100%", padding: "14px 0", borderRadius: 8, marginTop: 4, marginBottom: 8,
          background: mobileDragMode === selEl.id ? "rgba(168,85,247,0.18)" : "rgba(59,130,246,0.12)",
          color: mobileDragMode === selEl.id ? "#a855f7" : "#60a5fa",
          fontSize: 13, fontWeight: 700,
          border: mobileDragMode === selEl.id ? "1px solid rgba(168,85,247,0.4)" : "1px solid rgba(59,130,246,0.25)",
          cursor: "pointer",
        }}
      >
        {mobileDragMode === selEl.id ? "✋ Выключить перемещение" : "✋ Включить перемещение"}
      </button>

      <button
        onClick={() => { delSel(); setMobileDragMode(null); setMobileSheet(null); }}
        style={{
          width: "100%", padding: "14px 0", borderRadius: 8, marginTop: 0,
          background: "rgba(220,38,38,0.12)", color: "#ef4444",
          fontSize: 13, fontWeight: 700,
          border: "1px solid rgba(220,38,38,0.25)",
          cursor: "pointer",
        }}
      >✕ Удалить элемент</button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// MobileSummarySheet — табы крепёж / детали / итого
// ───────────────────────────────────────────────────────────────

export interface MobileSummarySheetProps {
  panel: string;
  setPanel: (p: string) => void;
  hw: any[];
  pts: any[];
  area: string;
  elements: any[];
}

export function MobileSummarySheet(props: MobileSummarySheetProps) {
  const { panel, setPanel, hw, pts, area, elements } = props;
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(50,50,60,0.4)", marginBottom: 12 }}>
        {[{ id: "hardware", l: "Крепёж" }, { id: "parts", l: "Детали" }, { id: "summary", l: "Итого" }].map(tb => (
          <button
            key={tb.id}
            onClick={() => setPanel(tb.id)}
            style={{
              flex: 1, padding: "12px 0", fontSize: 11, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.05em",
              cursor: "pointer", border: "none",
              background: "transparent",
              color: panel === tb.id ? "#d97706" : "#666",
              borderBottom: panel === tb.id ? "2px solid #d97706" : "2px solid transparent",
            }}
          >{tb.l}</button>
        ))}
      </div>

      {panel === "hardware" && (
        <div>
          {hw.length === 0 ? (
            <div style={{ color: "#666", fontStyle: "italic", textAlign: "center", padding: 20 }}>Нет крепежа</div>
          ) : hw.map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(50,50,60,0.15)" }}>
              <span style={{ fontSize: 16 }}>{h.i}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#d1d5db" }}>{h.n}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{h.r}</div>
              </div>
              <span style={{ fontSize: 15, color: "#d97706", fontWeight: 900 }}>{h.q}</span>
            </div>
          ))}
        </div>
      )}

      {panel === "parts" && (
        <div>
          {pts.length === 0 ? (
            <div style={{ color: "#666", fontStyle: "italic", textAlign: "center", padding: 20 }}>Нет деталей</div>
          ) : pts.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(50,50,60,0.15)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#d1d5db" }}>{p.n}</div>
                <div style={{ fontSize: 11, color: "#666", fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}>{p.l}×{p.w}</div>
              </div>
              <span style={{ fontSize: 13, color: "#9ca3af" }}>{p.q}</span>
            </div>
          ))}
        </div>
      )}

      {panel === "summary" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div style={{ background: "rgba(30,30,40,0.4)", borderRadius: 8, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#d97706" }}>{area}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>м² ЛДСП</div>
            </div>
            <div style={{ background: "rgba(30,30,40,0.4)", borderRadius: 8, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#d1d5db" }}>{elements.length}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>элементов</div>
            </div>
          </div>
          <button style={{
            width: "100%", padding: "14px 0", borderRadius: 8,
            background: "#d97706", color: "#000",
            fontSize: 13, fontWeight: 700,
            border: "none", cursor: "pointer",
          }}>📄 Экспорт CSV</button>
        </div>
      )}
    </div>
  );
}
