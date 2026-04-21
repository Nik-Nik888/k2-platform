import { useCallback, useRef } from "react";

/**
 * Хук для мобильных touch-жестов на 2D-канвасе:
 * - pinch-zoom двумя пальцами (меняет userZoom)
 * - двойной тап — сброс зума к 1
 *
 * При начале pinch автоматически отменяет активный drag.
 */
export function useMobileTouch(
  userZoom: number,
  setUserZoom: (v: number) => void,
  setDrag: (d: any) => void,
) {
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  const onCanvasTouchStart = useCallback((e: any) => {
    if (e.touches && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = {
        startDist: Math.sqrt(dx * dx + dy * dy),
        startZoom: userZoom,
      };
      // Отменяем drag если был активен — 2 пальца = zoom, не drag
      setDrag(null);
    }
  }, [userZoom, setDrag]);

  const onCanvasTouchMove = useCallback((e: any) => {
    if (e.touches && e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / pinchRef.current.startDist;
      const newZoom = Math.max(0.5, Math.min(3, pinchRef.current.startZoom * ratio));
      setUserZoom(newZoom);
    }
  }, [setUserZoom]);

  const onCanvasTouchEnd = useCallback((e: any) => {
    if (!e.touches || e.touches.length < 2) {
      pinchRef.current = null;
    }
  }, []);

  /** Двойной тап по канвасу — сброс зума к 1. */
  const onCanvasDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      setUserZoom(1);
      try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
    }
    lastTapRef.current = now;
  }, [setUserZoom]);

  return {
    pinchRef,
    onCanvasTouchStart,
    onCanvasTouchMove,
    onCanvasTouchEnd,
    onCanvasDoubleTap,
  };
}
