/**
 * Верхняя панель редактора с названием, размерами корпуса, индикаторами
 * активных режимов и кнопками «Двери» / «3D».
 */
import React from "react";
import { useNavigate } from "react-router-dom";

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
  show3d: boolean;
  setShow3d: (v: boolean) => void;
  /** Название шкафа — редактируемое в шапке. */
  cabinetName?: string;
  setCabinetName?: (v: string) => void;
  /** Состояние авто-сохранения для индикатора. */
  saveState?: "idle" | "saving" | "saved" | "error";
}

const PLACE_MODE_LABELS: Record<string, string> = {
  shelf: "━ Полка",
  stud: "┃ Стойка",
  drawers: "☰ Ящики",
  rod: "⎯ Штанга",
  door: "🚪 Дверь",
};

export function Header(props: HeaderProps) {
  const navigate = useNavigate();
  const {
    corpus, showCorpus, t,
    mobileDragMode, setMobileDragMode, isMobile,
    placeMode, setPlaceMode,
    showDoors, setShowDoors,
    show3d, setShow3d,
    cabinetName, setCabinetName, saveState = "idle",
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
          {setCabinetName && cabinetName !== undefined ? (
            <input
              type="text"
              value={cabinetName}
              onChange={e => setCabinetName(e.target.value)}
              placeholder="Без названия"
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "#d1d5db",
                padding: 0, margin: 0,
                width: 180,
                fontFamily: "inherit",
              }}
            />
          ) : (
            <h1 style={{
              fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "#d1d5db", margin: 0,
            }}>Редактор мебели</h1>
          )}
          <p style={{ fontSize: 11, color: "#555", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span>{corpus.width}×{corpus.height}×{corpus.depth} · {showCorpus ? `${t}мм ЛДСП` : "рамка"}</span>
            {saveState === "saving" && <span style={{ color: "#888" }}>· сохраняется…</span>}
            {saveState === "saved" && <span style={{ color: "#22c55e" }}>· сохранено ✓</span>}
            {saveState === "error" && <span style={{ color: "#ef4444" }}>· ошибка сохранения</span>}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Кнопка возврата к списку шкафов */}
        <button
          onClick={() => navigate("/cabinet/list")}
          title="Все мои шкафы"
          style={{
            padding: "6px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: "rgba(96,165,250,0.12)", color: "#60a5fa",
            border: "1px solid rgba(96,165,250,0.3)",
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >📁 Шкафы</button>

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

        {/* Toggle 2D ↔ 3D (показывает куда переключит) */}
        <button
          onClick={() => setShow3d(!show3d)}
          style={{
            padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            cursor: "pointer", border: "1px solid rgba(96,165,250,0.3)",
            background: "rgba(96,165,250,0.12)", color: "#60a5fa",
          }}
          title={show3d ? "Переключиться на классический 2D-редактор" : "Вернуться в 3D-просмотр"}
        >{show3d ? "📐 2D" : "🧊 3D"}</button>
      </div>
    </div>
  );
}
