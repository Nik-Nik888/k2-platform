/**
 * Десктоп-панели редактора:
 * - DesktopLeftPanel — размеры корпуса, инструменты, текстуры, свойства выделенного элемента
 * - DesktopRightPanel — табы Крепёж/Детали/Итого
 * - DesktopOpenLeftButton / DesktopOpenRightButton — кнопки разворачивания когда панель закрыта
 */
import React from "react";
import { NumInput } from "./inputs/NumInput";
import { DepthControl } from "./inputs/DepthControl";
import { TexturePicker } from "./TexturePicker";
import { TOOLS, GUIDES, HINGES } from "../constants";

const SEL_TYPE_LABELS: Record<string, string> = {
  stud: "Стойка", drawers: "Ящики", shelf: "Полка", rod: "Штанга", door: "Дверь",
};

// ───────────────────────────────────────────────────────────────
// LEFT PANEL
// ───────────────────────────────────────────────────────────────

export interface DesktopLeftPanelProps {
  leftOpen: boolean;
  setLeftOpen: (v: boolean) => void;
  corpus: { width: number; height: number; depth: number; thickness: number };
  setCorpus: (fn: (c: any) => any) => void;
  showCorpus: boolean;
  setShowCorpus: (fn: (p: boolean) => boolean) => void;
  placeMode: string | null;
  addEl: (type: string) => void;
  corpusTextureId: string;
  facadeTextureId: string;
  setCorpusTextureId: (id: string) => void;
  setFacadeTextureId: (id: string) => void;
  customTextures: any[];
  setCustomTextures: (fn: (prev: any[]) => any[]) => void;
  customBrands: string[];
  setCustomBrands: (fn: (prev: string[]) => string[]) => void;
  selEl: any | null;
  elements: any[];
  updateEl: (id: string, upd: any) => void;
  delSel: () => void;
  iW: number;
  iH: number;
  t: number;
}

export function DesktopLeftPanel(props: DesktopLeftPanelProps) {
  const {
    leftOpen, setLeftOpen,
    corpus, setCorpus, showCorpus, setShowCorpus,
    placeMode, addEl,
    corpusTextureId, facadeTextureId, setCorpusTextureId, setFacadeTextureId,
    customTextures, setCustomTextures, customBrands, setCustomBrands,
    selEl, elements, updateEl, delSel, iW, iH, t,
  } = props;

  return (
    <div style={{
      width: leftOpen ? 200 : 0,
      overflow: leftOpen ? "auto" : "hidden",
      transition: "width 0.2s",
      borderRight: "1px solid rgba(50,50,60,0.3)",
      flexShrink: 0,
      maxHeight: "calc(100vh - 46px)",
      position: "relative",
    }}>
      {leftOpen && (
        <div style={{ padding: 10 }}>
          <button onClick={() => setLeftOpen(false)} style={{ position: "absolute", top: 4, right: 4, background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16 }}>◀</button>

          {/* Рамка */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 6 }}>Рамка</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {[{ k: "width", l: "Ш", mn: 300, mx: 3000 }, { k: "height", l: "В", mn: 300, mx: 2700 }, { k: "depth", l: "Г", mn: 250, mx: 700 }].map(p => (
                <NumInput key={p.k} label={p.l} value={corpus[p.k as keyof typeof corpus] as number} onChange={v => setCorpus(c => ({ ...c, [p.k]: v }))} min={p.mn} max={p.mx} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
              {[16, 18, 22].map(th => (
                <button key={th} onClick={() => setCorpus(c => ({ ...c, thickness: th }))} style={{
                  flex: 1, padding: "3px 0", borderRadius: 4, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", border: "none",
                  background: corpus.thickness === th ? "#d97706" : "rgba(30,30,40,0.5)",
                  color: corpus.thickness === th ? "#000" : "#6b7280",
                }}>{th}</button>
              ))}
            </div>
            <button onClick={() => setShowCorpus(p => !p)} style={{
              width: "100%", padding: "5px 0", borderRadius: 4, fontSize: 10, fontWeight: 700,
              cursor: "pointer", border: "1px solid",
              background: showCorpus ? "rgba(217,119,6,0.12)" : "rgba(100,100,100,0.08)",
              color: showCorpus ? "#d97706" : "#666",
              borderColor: showCorpus ? "rgba(217,119,6,0.3)" : "#333",
            }}>{showCorpus ? "☑ Корпус ЛДСП" : "☐ Пустая рамка"}</button>
          </div>

          {/* Инструменты */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 6 }}>Добавить</div>
            {TOOLS.map(it => (
              <button key={it.type} onClick={() => addEl(it.type)} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                padding: "5px 8px", borderRadius: 4, marginBottom: 2,
                cursor: "pointer",
                background: placeMode === it.type ? "rgba(34,197,94,0.15)" : "rgba(30,30,40,0.3)",
                border: placeMode === it.type ? "1px solid rgba(34,197,94,0.3)" : "1px solid transparent",
                color: placeMode === it.type ? "#22c55e" : "#d1d5db",
                fontSize: 11,
              }}>
                <span style={{ fontSize: 14, width: 20, textAlign: "center", opacity: 0.5 }}>{it.icon}</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                <span style={{ color: "#444", fontSize: 10 }}>{it.key}</span>
              </button>
            ))}
          </div>

          {/* Текстуры */}
          <div style={{ marginBottom: 12 }}>
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

          {/* Свойства */}
          {selEl ? (
            <div style={{ background: "rgba(30,30,40,0.5)", border: "1px solid rgba(100,90,70,0.3)", borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 11, color: "#d97706", fontWeight: 700, marginBottom: 6 }}>
                {SEL_TYPE_LABELS[selEl.type]}
              </div>

              {selEl.type === "drawers" && (() => {
                const cnt = selEl.count || 3;
                const heights = selEl.drawerHeights || Array(cnt).fill(150);
                return (
                  <>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Кол-во</div>
                      <div style={{ display: "flex", gap: 3 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} onClick={() => updateEl(selEl.id, { count: n })} style={{
                            flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 11, fontWeight: 700,
                            cursor: "pointer", border: "none",
                            background: cnt === n ? "#22c55e" : "rgba(30,30,40,0.5)",
                            color: cnt === n ? "#000" : "#6b7280",
                          }}>{n}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Высоты</div>
                      {Array.from({ length: cnt }, (_, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: "#555", width: 16 }}>{i + 1}.</span>
                          <NumInput value={heights[i] || 150} onChange={v => {
                            const nh = [...heights];
                            nh[i] = Math.max(60, Math.min(600, v));
                            updateEl(selEl.id, { drawerHeights: nh });
                          }} min={60} max={600} color="#22c55e" width="100%" />
                        </div>
                      ))}
                      <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>
                        Σ {heights.slice(0, cnt).reduce((a: number, b: number) => a + b, 0)}мм
                      </div>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Направляющие</div>
                      {GUIDES.map(gt => (
                        <button key={gt.id} onClick={() => updateEl(selEl.id, { guideType: gt.id })} style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2,
                          cursor: "pointer", border: "1px solid transparent",
                          background: (selEl.guideType || "roller") === gt.id ? "rgba(34,197,94,0.12)" : "rgba(30,30,40,0.4)",
                          color: (selEl.guideType || "roller") === gt.id ? "#22c55e" : "#9ca3af",
                          borderColor: (selEl.guideType || "roller") === gt.id ? "rgba(34,197,94,0.3)" : "transparent",
                        }}><b>{gt.label}</b> <span style={{ color: "#555" }}>~{gt.p}₽</span></button>
                      ))}
                    </div>
                  </>
                );
              })()}

              {selEl.type === "door" && (
                <>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Тип петли</div>
                    {HINGES.map(ht => (
                      <button key={ht.id} onClick={() => updateEl(selEl.id, { hingeType: ht.id })} style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2,
                        cursor: "pointer", border: "1px solid transparent",
                        background: (selEl.hingeType || "overlay") === ht.id ? "rgba(217,119,6,0.12)" : "rgba(30,30,40,0.4)",
                        color: (selEl.hingeType || "overlay") === ht.id ? "#d97706" : "#9ca3af",
                      }}>{ht.label}</button>
                    ))}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Петли</div>
                    <div style={{ display: "flex", gap: 3 }}>
                      {["left", "right"].map(s => (
                        <button key={s} onClick={() => updateEl(selEl.id, { hingeSide: s })} style={{
                          flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 11, fontWeight: 700,
                          cursor: "pointer", border: "none",
                          background: selEl.hingeSide === s ? "#d97706" : "rgba(30,30,40,0.5)",
                          color: selEl.hingeSide === s ? "#000" : "#6b7280",
                        }}>{s === "left" ? "← Лево" : "Право →"}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: "#555", marginTop: 4 }}>
                    {(selEl.hingeType || "overlay") === "overlay" ? "Накл: +14мм корпус / +7мм стойка" : "Вкладная: зазор 2мм"}
                    {selEl.doorLeft !== undefined && (
                      <><br />Границы: {Math.round(selEl.doorLeft)}–{Math.round(selEl.doorRight)} × {Math.round(selEl.doorTop)}–{Math.round(selEl.doorBottom)}</>
                    )}
                  </div>
                </>
              )}

              {selEl.type === "panel" && (
                <>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Тип установки</div>
                    {HINGES.map(pt => (
                      <button key={pt.id} onClick={() => updateEl(selEl.id, { panelType: pt.id })} style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2,
                        cursor: "pointer", border: "1px solid transparent",
                        background: (selEl.panelType || "overlay") === pt.id ? "rgba(217,119,6,0.12)" : "rgba(30,30,40,0.4)",
                        color: (selEl.panelType || "overlay") === pt.id ? "#d97706" : "#9ca3af",
                      }}>{pt.label}</button>
                    ))}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Размеры, мм</div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                      <NumInput label="Ш" value={Math.round(selEl.panelW || selEl.w || 0)} onChange={v => {
                        const oldX = selEl.x || 0;
                        const oldW = Math.round(selEl.panelW || selEl.w || 0);
                        let newX = oldX;
                        if (selEl.panelRightIsWall && !selEl.panelLeftIsWall) newX = oldX + oldW - v;
                        else if (!selEl.panelLeftIsWall && !selEl.panelRightIsWall) newX = oldX - (v - oldW) / 2;
                        updateEl(selEl.id, { w: v, panelW: v, x: newX, manualW: v });
                      }} min={20} max={iW} color="#d97706" />
                    </div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                      <NumInput label="↑" value={Math.round(selEl.panelH || selEl.h || 0)} onChange={v => {
                        const newTop = Math.max(0, (selEl.panelBottom ?? iH) - v);
                        updateEl(selEl.id, { panelTop: newTop, panelTopIsWall: newTop < 1, manualH: undefined });
                      }} min={20} max={iH} color="#5a8fd4" />
                      <NumInput label="↓" value={Math.round(selEl.panelH || selEl.h || 0)} onChange={v => {
                        const newBot = Math.min(iH, (selEl.panelTop ?? 0) + v);
                        updateEl(selEl.id, { panelBottom: newBot, panelBottomIsWall: newBot > iH - 1, manualH: undefined });
                      }} min={20} max={iH} color="#5a8fd4" />
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: "#555", marginTop: 4 }}>
                    {(selEl.panelType || "overlay") === "overlay"
                      ? "Накладная: закрывает торцы"
                      : "Вкладная: утоплена в проём"}
                    {selEl.panelLeft !== undefined && (
                      <><br />Границы: {Math.round(selEl.panelLeft)}–{Math.round(selEl.panelRight)} × {Math.round(selEl.panelTop)}–{Math.round(selEl.panelBottom)}</>
                    )}
                  </div>
                </>
              )}

              {selEl.type === "stud" && (
                <div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    <NumInput label="X" value={Math.round(selEl.x)} onChange={v => updateEl(selEl.id, { x: Math.max(0, Math.min(iW - t, v)) })} min={0} max={iW} color="#60a5fa" />
                  </div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    <NumInput label="Верх" value={Math.round(selEl.pTop || 0)} onChange={v => updateEl(selEl.id, { pTop: v, manualPTop: v })} min={0} max={iH} color="#60a5fa" />
                    <NumInput label="Низ" value={Math.round(selEl.pBot || iH)} onChange={v => updateEl(selEl.id, { pBot: v, manualPBot: v })} min={0} max={iH} color="#60a5fa" />
                  </div>
                  <div style={{ fontSize: 9, color: "#555" }}>Высота: {Math.round((selEl.pBot || iH) - (selEl.pTop || 0))}мм</div>
                  <button
                    onClick={() => {
                      const others = elements.filter(e => e.type === "stud" && e.id !== selEl.id).sort((a, b) => a.x - b.x);
                      let leftX = 0, rightX = iW - t;
                      for (const s of others) {
                        if (s.x + t <= selEl.x && s.x + t > leftX) leftX = s.x + t;
                        if (s.x >= selEl.x + t && s.x < rightX) rightX = s.x;
                      }
                      const cx = Math.round((leftX + rightX - t) / 2);
                      updateEl(selEl.id, { x: Math.max(0, Math.min(iW - t, cx)) });
                    }}
                    style={{
                      width: "100%", padding: "6px 0", borderRadius: 4, marginTop: 6,
                      background: "rgba(96,165,250,0.12)", color: "#60a5fa",
                      fontSize: 11, fontWeight: 700,
                      border: "1px solid rgba(96,165,250,0.3)", cursor: "pointer",
                    }}
                  >⟷ По центру</button>
                </div>
              )}

              {selEl.type === "shelf" && (
                <div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    <NumInput label="Y" value={Math.round(selEl.y)} onChange={v => updateEl(selEl.id, { y: Math.max(0, Math.min(iH, v)) })} min={0} max={iH} color="#d97706" />
                  </div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    <NumInput label="X" value={Math.round(selEl.x || 0)} onChange={v => updateEl(selEl.id, { x: v, manualX: v })} min={0} max={iW} color="#d97706" />
                    <NumInput label="Ш" value={Math.round(selEl.w || iW)} onChange={v => updateEl(selEl.id, { w: v, manualW: v })} min={20} max={iW} color="#d97706" />
                  </div>
                  <div style={{ fontSize: 9, color: "#555" }}>Длина: {Math.round(selEl.w || iW)}мм</div>
                  <button
                    onClick={() => {
                      const myLeft = selEl.x || 0, myRight = myLeft + (selEl.w || iW);
                      const others = elements.filter(e => {
                        if (e.type !== "shelf" || e.id === selEl.id) return false;
                        const eL = e.x || 0, eR = eL + (e.w || iW);
                        return eR > myLeft + 5 && eL < myRight - 5;
                      }).sort((a, b) => a.y - b.y);
                      let topY = 0, botY = iH;
                      for (const sh of others) {
                        if (sh.y <= selEl.y && sh.y > topY) topY = sh.y;
                        if (sh.y >= selEl.y && sh.y < botY) botY = sh.y;
                      }
                      const cy = Math.round((topY + botY) / 2);
                      updateEl(selEl.id, { y: Math.max(0, Math.min(iH, cy)) });
                    }}
                    style={{
                      width: "100%", padding: "6px 0", borderRadius: 4, marginTop: 6,
                      background: "rgba(217,119,6,0.12)", color: "#d97706",
                      fontSize: 11, fontWeight: 700,
                      border: "1px solid rgba(217,119,6,0.3)", cursor: "pointer",
                    }}
                  >⟷ По центру</button>
                </div>
              )}

              {/* Глубина — для всех типов кроме двери */}
              {selEl.type !== "door" && (
                <DepthControl
                  corpusDepth={corpus.depth}
                  depth={selEl.depth}
                  depthOffset={selEl.depthOffset}
                  onChange={({ depth, depthOffset }) => updateEl(selEl.id, { depth, depthOffset })}
                />
              )}

              <button onClick={delSel} style={{
                width: "100%", padding: "5px 0", borderRadius: 4, marginTop: 8,
                background: "rgba(220,38,38,0.12)", color: "#ef4444",
                fontSize: 11, fontWeight: 700,
                border: "1px solid rgba(220,38,38,0.2)", cursor: "pointer",
              }}>✕ Удалить</button>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#555", fontStyle: "italic" }}>Кликни элемент</div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// RIGHT PANEL — табы Крепёж/Детали/Итого
// ───────────────────────────────────────────────────────────────

export interface DesktopRightPanelProps {
  rightOpen: boolean;
  setRightOpen: (v: boolean) => void;
  panel: string;
  setPanel: (p: string) => void;
  hw: any[];
  pts: any[];
  area: string;
  elements: any[];
}

export function DesktopRightPanel(props: DesktopRightPanelProps) {
  const { rightOpen, setRightOpen, panel, setPanel, hw, pts, area, elements } = props;
  return (
    <div style={{
      width: rightOpen ? 230 : 0,
      overflow: rightOpen ? "auto" : "hidden",
      transition: "width 0.2s",
      borderLeft: "1px solid rgba(50,50,60,0.3)",
      flexShrink: 0,
      maxHeight: "calc(100vh - 46px)",
    }}>
      {rightOpen && (
        <>
          <button onClick={() => setRightOpen(false)} style={{ position: "absolute", right: 8, top: 52, background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16, zIndex: 11 }}>▶</button>

          <div style={{ display: "flex", borderBottom: "1px solid rgba(50,50,60,0.3)", position: "sticky", top: 0, zIndex: 10, background: "#0b0c10" }}>
            {[{ id: "hardware", l: "Крепёж" }, { id: "parts", l: "Детали" }, { id: "summary", l: "Итого" }].map(tb => (
              <button key={tb.id} onClick={() => setPanel(tb.id)} style={{
                flex: 1, padding: "8px 0", fontSize: 10, fontWeight: 700,
                textTransform: "uppercase",
                cursor: "pointer", border: "none",
                background: "transparent",
                color: panel === tb.id ? "#d97706" : "#555",
                borderBottom: panel === tb.id ? "2px solid #d97706" : "2px solid transparent",
              }}>{tb.l}</button>
            ))}
          </div>

          <div style={{ padding: 8 }}>
            {panel === "hardware" && hw.map((h, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "4px 0", borderBottom: "1px solid rgba(50,50,60,0.15)" }}>
                <span style={{ fontSize: 12 }}>{h.i}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#d1d5db" }}>{h.n}</div>
                  <div style={{ fontSize: 10, color: "#555" }}>{h.r}</div>
                </div>
                <span style={{ fontSize: 12, color: "#d97706", fontWeight: 900 }}>{h.q}</span>
              </div>
            ))}

            {panel === "parts" && pts.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid rgba(50,50,60,0.15)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#d1d5db" }}>{p.n}</div>
                  <div style={{ fontSize: 10, color: "#555", fontFamily: "'IBM Plex Mono',monospace" }}>{p.l}×{p.w}</div>
                </div>
                <span style={{ fontSize: 11, color: "#6b7280" }}>{p.q}</span>
              </div>
            ))}

            {panel === "summary" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div style={{ background: "rgba(30,30,40,0.4)", borderRadius: 6, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#d97706" }}>{area}</div>
                    <div style={{ fontSize: 10, color: "#555" }}>м² ЛДСП</div>
                  </div>
                  <div style={{ background: "rgba(30,30,40,0.4)", borderRadius: 6, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#d1d5db" }}>{elements.length}</div>
                    <div style={{ fontSize: 10, color: "#555" }}>элем.</div>
                  </div>
                </div>
                <button style={{
                  width: "100%", padding: "8px 0", borderRadius: 6,
                  background: "#d97706", color: "#000",
                  fontSize: 11, fontWeight: 700,
                  border: "none", cursor: "pointer",
                }}>📄 Экспорт CSV</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// TOGGLE BUTTONS — появляются когда панель закрыта
// ───────────────────────────────────────────────────────────────

export function DesktopOpenLeftButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button onClick={onOpen} style={{
      position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)",
      zIndex: 30, width: 24, height: 60,
      borderRadius: "0 6px 6px 0",
      background: "#1a1b22", border: "1px solid #333", borderLeft: "none",
      color: "#888", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>▶</button>
  );
}

export function DesktopOpenRightButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button onClick={onOpen} style={{
      position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)",
      zIndex: 30, width: 24, height: 60,
      borderRadius: "6px 0 0 6px",
      background: "#1a1b22", border: "1px solid #333", borderRight: "none",
      color: "#888", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>◀</button>
  );
}
