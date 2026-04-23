/**
 * Верхняя панель редактора с названием, размерами корпуса, индикаторами
 * активных режимов и кнопками «Двери» / «3D».
 */
import React from "react";

export interface HeaderProps {
  /** Размеры корпуса для подзаголовка. */
  corpus: { width: number; height: number; depth: number };
  /** Показывать ли «ЛДСП 16мм» (если showCorpus=true) или «рамка». */
  showCorpus: boolean;
  /** Толщина ЛДСП (мм) — для подписи. */
  t: number;
  /** Активен ли режим перемещения элементов (мобильный). */
  mobileDragMode: string | null;
  setMobileDragMode: (v: string | null) => void;
  isMobile: boolean;
  /** Активный режим постановки элемента (подсвечивается). */
  placeMode: string | null;
  setPlaceMode: (v: string | null) => void;
  /** Показ дверей (переключатель «глазика»). */
  showDoors: boolean;
  setShowDoors: (fn: (p: boolean) => boolean) => void;
  /** Открытие 3D-просмотра. */
  setShow3d: (v: boolean) => void;
  /** Галочка «автоматически возвращаться в 3D после постановки элемента». */
  autoReturnTo3d: boolean;
  setAutoReturnTo3d: (fn: (p: boolean) => boolean) => void;
}

const PLACE_MODE_LABELS: Record<string, string> = {
  shelf: "━ Полка",
  stud: "┃ Стойка",
  drawers: "☰ Ящики",
  rod: "⎯ Штанга",
  door: "🚪 Дверь",
};

export function Header(props: HeaderProps) {
  const {
    corpus, showCorpus, t,
    mobileDragMode, setMobileDragMode, isMobile,
    placeMode, setPlaceMode,
    showDoors, setShowDoors,
    setShow3d,
    autoReturnTo3d, setAutoReturnTo3d,
  } = props;

  return (
    <div style={{
      borderBottom: "1px solid rgba(50,50,60,0.4)",
      padding: "8px 16px",
      background: "rgba(11,12,16,0.97)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: "#d97706",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#000", fontWeight: 900, fontSize: 11,
        }}>К2</div>
        <div>
          <h1 style={{
            fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "#d1d5db", margin: 0,
          }}>Редактор мебели</h1>
          <p style={{ fontSize: 11, color: "#555", margin: 0 }}>
            {corpus.width}×{corpus.height}×{corpus.depth} · {showCorpus ? `${t}мм ЛДСП` : "рамка"}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Drag mode indicator (mobile) */}
        {mobileDragMode && isMobile && (
          <div style={{
            padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: "rgba(168,85,247,0.15)", color: "#a855f7",
            border: "1px solid rgba(168,85,247,0.3)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            ✋ Перемещение
            <button
              onClick={() => setMobileDragMode(null)}
              style={{
                background: "none", border: "none", color: "#ef4444",
                cursor: "pointer", fontSize: 12, fontWeight: 700,
                padding: 0, lineHeight: 1,
              }}
            >✕</button>
          </div>
        )}

        {/* Place mode indicator */}
        {placeMode && (
          <div style={{
            padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: "rgba(34,197,94,0.15)", color: "#22c55e",
            border: "1px solid rgba(34,197,94,0.3)",
          }}>
            {PLACE_MODE_LABELS[placeMode]} · {(placeMode === "shelf" || placeMode === "stud") ? "можно ставить ещё" : "кликни в проём"}
            <button
              onClick={() => setPlaceMode(null)}
              style={{
                marginLeft: 6, background: "none", border: "none",
                color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 700,
              }}
            >✕</button>
          </div>
        )}

        {/* Doors toggle */}
        <button
          onClick={() => setShowDoors(p => !p)}
          style={{
            padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            cursor: "pointer", border: "1px solid",
            background: showDoors ? "rgba(217,119,6,0.12)" : "rgba(100,100,100,0.12)",
            color: showDoors ? "#d97706" : "#888",
            borderColor: showDoors ? "rgba(217,119,6,0.3)" : "#444",
          }}
        >🚪 Двери {showDoors ? "👁" : "👁‍🗨"}</button>

        {/* Автовозврат в 3D — галочка */}
        <button
          onClick={() => setAutoReturnTo3d(p => !p)}
          title="Автоматически вернуться в 3D-просмотр после постановки элемента"
          style={{
            padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            cursor: "pointer", border: "1px solid",
            background: autoReturnTo3d ? "rgba(34,197,94,0.12)" : "rgba(60,60,60,0.12)",
            color: autoReturnTo3d ? "#22c55e" : "#666",
            borderColor: autoReturnTo3d ? "rgba(34,197,94,0.3)" : "#333",
            display: isMobile ? "none" : "inline-flex", alignItems: "center", gap: 4,
          }}
        >{autoReturnTo3d ? "☑" : "☐"} авто-3D</button>

        {/* К 3D просмотру */}
        <button
          onClick={() => setShow3d(true)}
          style={{
            padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            cursor: "pointer", border: "1px solid rgba(96,165,250,0.3)",
            background: "rgba(96,165,250,0.12)", color: "#60a5fa",
          }}
        >🧊 К 3D</button>
      </div>
    </div>
  );
}
