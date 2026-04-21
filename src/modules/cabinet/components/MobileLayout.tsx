/**
 * Мобильный лейаут редактора:
 * - обёртка канваса с touch-жестами (pinch/pan)
 * - плавающий индикатор режима перемещения
 * - плавающий индикатор зума
 * - нижний тулбар с 4 кнопками (Инстр/Свойства/Итого/3D)
 */
import React from "react";

// ───────────────────────────────────────────────────────────────
// MobileToolbarButton — кнопка для нижней навигации
// ───────────────────────────────────────────────────────────────

export interface MobileToolbarButtonProps {
  label: string;
  icon: string;
  active?: boolean;
  highlight?: boolean;
  onClick: () => void;
}

export function MobileToolbarButton({
  label, icon, active, highlight, onClick,
}: MobileToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        padding: "6px 2px",
        border: "none",
        borderRadius: 8,
        background: active ? "rgba(217,119,6,0.18)" : "transparent",
        color: active ? "#d97706" : highlight ? "#22c55e" : "#9ca3af",
        fontSize: 10,
        fontWeight: 700,
        fontFamily: "'IBM Plex Mono',monospace",
        cursor: "pointer",
        position: "relative",
        minHeight: 48,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 9, letterSpacing: "0.02em" }}>{label}</span>
      {highlight && !active && (
        <span style={{
          position: "absolute", top: 4, right: 8,
          width: 6, height: 6, borderRadius: 3, background: "#22c55e",
        }} />
      )}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────
// MobileCanvasWrapper — обёртка с touch-жестами + трансформ канваса
// ───────────────────────────────────────────────────────────────

export interface MobileCanvasWrapperProps {
  /** JSX канваса (SVG с элементами). */
  canvas: React.ReactNode;
  /** Полная ширина SVG в пикселях (до масштабирования). */
  svgW: number;
  /** Полная высота SVG в пикселях (до масштабирования). */
  svgH: number;
  /** Итоговый масштаб = mobileCanvasFit * userZoom. */
  mobileCanvasScale: number;
  /** Пользовательский зум (1 = базовый, >1 = увеличено). */
  userZoom: number;
  /** Смещение pan'а (пиксели viewport). */
  panX: number;
  panY: number;
  /** Refs для определения активности pinch/pan — влияют на touchAction и transition. */
  pinchRef: React.MutableRefObject<any>;
  panRef: React.MutableRefObject<any>;
  /** Флаги активного drag — блокируют скролл страницы. */
  drag: any;
  mobileDragMode: string | null;
  /** Обработчики touch-жестов из useMobileTouch. */
  onCanvasTouchStart: (e: any) => void;
  onCanvasTouchMove: (e: any) => void;
  onCanvasTouchEnd: (e: any) => void;
  onCanvasDoubleTap: () => void;
}

export function MobileCanvasWrapper({
  canvas, svgW, svgH, mobileCanvasScale, userZoom,
  panX, panY, pinchRef, panRef, drag, mobileDragMode,
  onCanvasTouchStart, onCanvasTouchMove, onCanvasTouchEnd, onCanvasDoubleTap,
}: MobileCanvasWrapperProps) {
  return (
    <div
      onTouchStart={(e) => { onCanvasTouchStart(e); onCanvasDoubleTap(); }}
      onTouchMove={onCanvasTouchMove}
      onTouchEnd={onCanvasTouchEnd}
      onTouchCancel={onCanvasTouchEnd}
      style={{
        padding: 8,
        paddingBottom: 80, // место для нижней тулбар-плашки
        minHeight: "calc(100vh - 46px - 64px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        width: "100%",
        boxSizing: "border-box",
        // При zoom > 1 блокируем touchAction — pan делаем сами через panX/panY.
        // При zoom = 1 разрешаем pan-y чтобы листалась страница (скроллом).
        // При drag/режиме перемещения/pinch — тоже блок.
        touchAction: (drag || mobileDragMode || pinchRef.current || panRef.current || userZoom > 1)
          ? "none"
          : "pan-y",
        overflow: "hidden",
      }}
    >
      {/* Внешняя обёртка — физически занимает size ПОСЛЕ масштабирования,
          чтобы flex justify-center корректно центрировал. */}
      <div style={{
        width: svgW * mobileCanvasScale,
        height: svgH * mobileCanvasScale,
        flexShrink: 0,
        position: "relative",
        touchAction: userZoom > 1 ? "none" : "auto",
      }}>
        <div style={{
          width: svgW,
          height: svgH,
          // Pan через translate + zoom через scale.
          // transformOrigin: top left — чтобы scale происходил из верхнего-левого
          // угла и не смещал визуально левый край.
          transform: `translate(${panX}px, ${panY}px) scale(${mobileCanvasScale})`,
          transformOrigin: "top left",
          // Плавность возврата при отпускании.
          transition: (panRef.current || pinchRef.current) ? "none" : "transform 0.1s ease-out",
          touchAction: userZoom > 1 ? "none" : "auto",
        }}>
          {canvas}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// MobileDragIndicator — плавающая плашка режима перемещения
// ───────────────────────────────────────────────────────────────

export interface MobileDragIndicatorProps {
  active: boolean;
  onExit: () => void;
}

export function MobileDragIndicator({ active, onExit }: MobileDragIndicatorProps) {
  if (!active) return null;
  return (
    <div style={{
      position: "fixed",
      top: 56,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 45,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 14px",
      borderRadius: 20,
      background: "rgba(34,197,94,0.15)",
      border: "1px solid rgba(34,197,94,0.5)",
      color: "#22c55e",
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "'IBM Plex Mono',monospace",
      backdropFilter: "blur(8px)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    }}>
      <span>🖐 Режим перемещения · тяни элемент пальцем</span>
      <button
        onClick={() => {
          onExit();
          try { if (navigator.vibrate) navigator.vibrate(5); } catch {}
        }}
        style={{
          border: "none",
          background: "rgba(34,197,94,0.2)",
          color: "#22c55e",
          width: 22,
          height: 22,
          borderRadius: 11,
          fontSize: 11,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        title="Выйти из режима"
      >✕</button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// MobileZoomIndicator — плавающая плашка с % зума и кнопкой сброса
// ───────────────────────────────────────────────────────────────

export interface MobileZoomIndicatorProps {
  userZoom: number;
  onReset: () => void;
}

export function MobileZoomIndicator({ userZoom, onReset }: MobileZoomIndicatorProps) {
  if (userZoom === 1) return null;
  return (
    <div style={{
      position: "fixed",
      bottom: 72,
      right: 12,
      zIndex: 40,
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 20,
      background: "rgba(11,12,16,0.92)",
      border: "1px solid rgba(217,119,6,0.3)",
      color: "#d97706",
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "'IBM Plex Mono',monospace",
      backdropFilter: "blur(8px)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    }}>
      <span>{Math.round(userZoom * 100)}%</span>
      <button
        onClick={onReset}
        style={{
          border: "none",
          background: "rgba(217,119,6,0.15)",
          color: "#d97706",
          width: 20,
          height: 20,
          borderRadius: 10,
          fontSize: 11,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        title="Сбросить зум"
      >✕</button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// MobileBottomToolbar — нижняя панель с 4 кнопками
// ───────────────────────────────────────────────────────────────

export interface MobileBottomToolbarProps {
  mobileSheet: null | 'tools' | 'props' | 'summary';
  setMobileSheet: (v: null | 'tools' | 'props' | 'summary') => void;
  selEl: any | null;
  setShow3d: (v: boolean) => void;
}

export function MobileBottomToolbar({
  mobileSheet, setMobileSheet, selEl, setShow3d,
}: MobileBottomToolbarProps) {
  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      background: "rgba(11,12,16,0.97)",
      borderTop: "1px solid rgba(50,50,60,0.5)",
      display: "flex",
      justifyContent: "space-around",
      padding: "8px 4px calc(8px + env(safe-area-inset-bottom))",
      backdropFilter: "blur(8px)",
    }}>
      <MobileToolbarButton
        label="Инстр."
        icon="🛠"
        active={mobileSheet === 'tools'}
        onClick={() => setMobileSheet(mobileSheet === 'tools' ? null : 'tools')}
      />
      <MobileToolbarButton
        label="Свойства"
        icon="⚙"
        active={mobileSheet === 'props'}
        highlight={!!selEl}
        onClick={() => setMobileSheet(mobileSheet === 'props' ? null : 'props')}
      />
      <MobileToolbarButton
        label="Итого"
        icon="📋"
        active={mobileSheet === 'summary'}
        onClick={() => setMobileSheet(mobileSheet === 'summary' ? null : 'summary')}
      />
      <MobileToolbarButton
        label="3D"
        icon="🧊"
        onClick={() => setShow3d(true)}
      />
    </div>
  );
}
