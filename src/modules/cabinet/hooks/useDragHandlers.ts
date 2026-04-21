import { useCallback, useRef } from "react";

/**
 * Хук для RAF-троттлинга drag-событий.
 * Возвращает onMove/onUp которые буферизуют координаты и применяют
 * их максимум раз в 16мс (60fps) через requestAnimationFrame.
 *
 * Это сильно сглаживает drag на touch-устройствах где события
 * прилетают быстрее 60fps.
 */
export function useDragHandlers(
  drag: any,
  applyDragMove: (clientX: number, clientY: number) => void,
  setDrag: (d: any) => void,
) {
  const rafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const onMove = useCallback((e: any) => {
    // Поддержка touch — координаты первого пальца
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX);
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY);
    if (clientX === undefined) return;
    if (!drag) return;

    // Буферизуем координаты в ref, применим на следующем анимационном кадре
    pendingMoveRef.current = { clientX, clientY };
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingMoveRef.current;
      if (!pending) return;
      applyDragMove(pending.clientX, pending.clientY);
    });
  }, [drag, applyDragMove]);

  const onUp = useCallback(() => {
    // Отменяем запланированный RAF
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingMoveRef.current = null;
    setDrag(null);
  }, [setDrag]);

  return { onMove, onUp };
}
