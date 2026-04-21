import { useCallback, useRef, useState } from "react";

/**
 * Хук для мобильных touch-жестов на 2D-канвасе:
 * - pinch-zoom двумя пальцами (меняет userZoom)
 * - pan одним пальцем по пустой области канваса (когда zoom > 1)
 * - двойной тап — сброс зума к 1 и pan к 0
 *
 * При начале pinch автоматически отменяет активный drag.
 *
 * Pan активен только когда canvas увеличен (zoom > 1). В обычном режиме
 * одинарный палец не перехватывается хуком — обрабатывается элементами
 * или даёт прокрутку страницы.
 */
export function useMobileTouch(
  userZoom: number,
  setUserZoom: (v: number) => void,
  setDrag: (d: any) => void,
) {
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  // pan состояние — используется как transform: translate(panX, panY)
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const onCanvasTouchStart = useCallback((e: any) => {
    const touches = e.touches;
    if (!touches) return;

    if (touches.length === 2) {
      // Два пальца — pinch zoom
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      pinchRef.current = {
        startDist: Math.sqrt(dx * dx + dy * dy),
        startZoom: userZoom,
      };
      panRef.current = null;
      // Отменяем drag если был активен
      setDrag(null);
    } else if (touches.length === 1 && userZoom > 1) {
      // Один палец + canvas увеличен — начинаем pan
      // (если zoom = 1, то не перехватываем — пусть работает скролл страницы)
      // Проверяем что тап не на элементе (чтобы не ломать drag элементов)
      const tgt = e.target as HTMLElement | null;
      const onElement = tgt && tgt.closest && tgt.closest('[data-element="1"]');
      if (!onElement) {
        panRef.current = {
          startX: touches[0].clientX,
          startY: touches[0].clientY,
          baseX: panX,
          baseY: panY,
        };
      }
    }
  }, [userZoom, setDrag, panX, panY]);

  const onCanvasTouchMove = useCallback((e: any) => {
    const touches = e.touches;
    if (!touches) return;

    if (touches.length === 2 && pinchRef.current) {
      // Pinch — пересчёт зума
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / pinchRef.current.startDist;
      const newZoom = Math.max(0.5, Math.min(3, pinchRef.current.startZoom * ratio));
      setUserZoom(newZoom);
    } else if (touches.length === 1 && panRef.current) {
      // Pan — смещение вида
      const dx = touches[0].clientX - panRef.current.startX;
      const dy = touches[0].clientY - panRef.current.startY;
      setPanX(panRef.current.baseX + dx);
      setPanY(panRef.current.baseY + dy);
    }
  }, [setUserZoom]);

  const onCanvasTouchEnd = useCallback((e: any) => {
    const touches = e.touches;
    if (!touches || touches.length < 2) {
      pinchRef.current = null;
    }
    if (!touches || touches.length < 1) {
      panRef.current = null;
    }
  }, []);

  /** Двойной тап по канвасу — сброс зума к 1 и pan к (0,0). */
  const onCanvasDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      setUserZoom(1);
      setPanX(0);
      setPanY(0);
      try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
    }
    lastTapRef.current = now;
  }, [setUserZoom]);

  return {
    pinchRef,
    panRef,
    panX,
    panY,
    onCanvasTouchStart,
    onCanvasTouchMove,
    onCanvasTouchEnd,
    onCanvasDoubleTap,
  };
}
