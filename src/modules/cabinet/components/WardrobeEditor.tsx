import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Wardrobe3D from "./Wardrobe3D";
import { getTextureInfo } from "./TexturePicker";
import { useIsMobile } from "@shared/hooks/useIsMobile";
import BottomSheet from "@shared/components/BottomSheet";
import { SC, MOBILE_EL_LABELS } from "../constants";
import { renderElement, type RenderCtx } from "./elements";
import { renderFrame, renderZoneHighlights } from "./frame";
import { renderDims, renderCorpusDims, renderSelectedDims, renderDoorHitZones, renderPanelHitZones, renderDoorQuickToolbar } from "./dims";
import { MobileToolsSheet, MobilePropsSheet, MobileSummarySheet } from "./MobileSheets";
import { Header } from "./Header";
import {
  MobileCanvasWrapper,
  MobileDragIndicator,
  MobileZoomIndicator,
  MobileBottomToolbar,
} from "./MobileLayout";
import { DesktopLeftPanel, DesktopRightPanel, DesktopOpenLeftButton, DesktopOpenRightButton } from "./DesktopPanels";
import { computeZones, findZone } from "../logic/zones";
import { calcHW, calcParts } from "../logic/calculations";
import { adjust as pureAdjust } from "../logic/adjust";
import { findDoorBounds as pureFindDoorBounds, computeDoorSnapTargets } from "../logic/doorBounds";
import { computeDoorResize, computePanelResize } from "../logic/doorResize";
import { moveElement } from "../logic/elementDrag";
import { computeTopLevelCols, computeDims, applyHorizDimChange, applyVertDimChange } from "../logic/dims";
import { placeInZone as purePlaceInZone, computeDoorDimensions } from "../logic/placement";
import { useDragHandlers } from "../hooks/useDragHandlers";
import { useMobileTouch } from "../hooks/useMobileTouch";
import { createCabinet, updateCabinet, type CabinetCorpus } from "../api/cabinetApi";
/* ═══════════════════════════════
   MAIN EDITOR
   ═══════════════════════════════ */
interface WardrobeEditorProps {
  // Если задан — открывает существующий шкаф, иначе пустой "draft"
  cabinetId?: string | null;
  // Начальные данные (для нового шкафа из CRM/клиента)
  initial?: {
    name?: string;
    corpus?: { width: number; height: number; depth: number; thickness: number };
    elements?: any[];
    corpus_texture_id?: string | null;
    facade_texture_id?: string | null;
    client_id?: string | null;
  };
  // Колбэк после первого сохранения (создание) — родитель может обновить URL
  onCreated?: (id: string) => void;
}

export default function WardrobeEditor({ cabinetId, initial, onCreated }: WardrobeEditorProps = {}) {
  const navigate = useNavigate();
  const [corpus, setCorpus] = useState(initial?.corpus ?? { width: 1200, height: 2100, depth: 600, thickness: 16 });
  const [elements, setElements] = useState<any[]>(initial?.elements ?? []);
  const [cabinetName, setCabinetName] = useState<string>(initial?.name ?? "Без названия");
  const [currentCabinetId, setCurrentCabinetId] = useState<string | null>(cabinetId ?? null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [clientId, setClientId] = useState<string | null>(initial?.client_id ?? null);
  const [selId, setSelId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [panel, setPanel] = useState("hardware");
  const [showDoors, setShowDoors] = useState(true);
  const [showCorpus, setShowCorpus] = useState(false); // false = пустая рамка (свободное проектирование)
  const [corpusTextureId, setCorpusTextureId] = useState(initial?.corpus_texture_id ?? "egger-h1137");
  const [facadeTextureId, setFacadeTextureId] = useState(initial?.facade_texture_id ?? "egger-w1100");
  const [customTextures, setCustomTextures] = useState([]);
  const [customBrands, setCustomBrands] = useState([]);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [dimDirOverrides, setDimDirOverrides] = useState({});
  // 3D — главный режим редактирования. Клик на элемент выделяет его
  // БЕЗ переключения на 2D — правка идёт через панель свойств поверх 3D.
  // 2D остаётся опциональным режимом через кнопку в шапке.
  const [show3d, setShow3d] = useState(true);
  /* Unified placement: click tool → highlight zones → click zone → place element
     For doors: special mode where user picks 4 boundaries */
  const [placeMode, setPlaceMode] = useState(null); // null | "shelf" | "stud" | "drawers" | "rod" | "door" | "panel"
  /**
   * Пре-настройки для новой двери/панели. Показываются в плавающем меню
   * при активном placeMode === 'door' / 'panel', чтобы первая же дверь встала
   * с нужными параметрами без необходимости переключать тип потом.
   */
  const [doorPrefs, setDoorPrefs] = useState<{
    hingeType: "overlay" | "insert";
    hingeSide: "left" | "right" | "auto";
  }>({ hingeType: "overlay", hingeSide: "auto" });
  const [panelPrefs, setPanelPrefs] = useState<{
    panelType: "overlay" | "insert";
  }>({ panelType: "insert" });

  // Mobile state — ВСЕ объявления вместе, чтобы минификатор не ломал порядок
  // Breakpoint 1024 (а не 768) — на iPad портрет (768px) и лэндскейп (1024px)
  // боковая панель свойств (320px) забирает почти половину canvas. Лучше переключать
  // в мобильный layout (FAB снизу + bottom-sheet) когда экран меньше десктопа.
  const isMobile = useIsMobile(1024);
  const [mobileDragMode, setMobileDragMode] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<null | 'tools' | 'props' | 'summary'>(null);
  const [userZoom, setUserZoom] = useState<number>(1);
  const lastTapElRef = useRef<{ id: string | null; time: number }>({ id: null, time: 0 });

  // Peek mode: hover/long-tap на дверь/панель делает её полупрозрачной (видно что внутри).
  const [peekId, setPeekId] = useState<string | null>(null);
  const peekTimerRef = useRef<number | null>(null);
  const onPeekIn = useCallback((id: string) => {
    // На десктопе — сразу по hover. На мобильном — по long-tap через 400мс в onPointerDown.
    if (!isMobile) setPeekId(id);
  }, [isMobile]);
  const onPeekOut = useCallback((id: string) => {
    // Снимаем peek только если он относился именно к этому элементу
    setPeekId(curr => curr === id ? null : curr);
    if (peekTimerRef.current) {
      clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
  }, []);

  const orderRef = useRef(1);
  const svgRef = useRef(null);

  const t = corpus.thickness;
  // When showCorpus=false, the frame is just a boundary — full area is usable
  const iW = showCorpus ? corpus.width - 2 * t : corpus.width;
  const iH = showCorpus ? corpus.height - 2 * t : corpus.height;
  const frameT = showCorpus ? t : 0; // offset for elements inside frame
  const selEl = elements.find(e => e.id === selId) || null;
  const corpusTexInfo = getTextureInfo(corpusTextureId, customTextures);
  const facadeTexInfo = getTextureInfo(facadeTextureId, customTextures);

  /* Обёртка adjust: прокидываем iW/iH/t в pure-функцию из logic/adjust. */
  const adjust = useCallback((els: any[]) => pureAdjust(els, iW, iH, t), [iW, iH, t]);

  const zones = useMemo(() => computeZones(elements, iW, iH, t), [elements, iW, iH, t]);

  /* ═══ UNIFIED ADD ═══ */
  const addEl = useCallback((type) => {
    setPlaceMode(prev => prev === type ? null : type);
    
  }, []);

  /* Find 4 nearest boundaries around a click point — обёртка над pure-функцией */
  const findDoorBounds = useCallback(
    (clickX: number, clickY: number) => pureFindDoorBounds(elements, clickX, clickY, iW, iH, t),
    [elements, iW, iH, t],
  );

  /* Place element into clicked zone */
  const placeInZone = useCallback((_zone, clickX, clickY) => {
    if (!placeMode) return;
    const result = purePlaceInZone({
      placeMode: placeMode as any,
      clickX, clickY,
      iW, iH, t,
      elements,
      order: orderRef.current++,
      findDoorBounds,
      // Пре-настройки — применяются только для соответствующего режима
      doorHingeType: doorPrefs.hingeType,
      doorHingeSide: doorPrefs.hingeSide,
      panelType: panelPrefs.panelType,
    });
    if (!result) {
      setPlaceMode(null);
      return;
    }
    setElements(prev => {
      const withNew = [...prev, result.element];
      return adjust(withNew);
    });
    if (!result.keepPlaceMode) {
      setPlaceMode(null);
      setSelId(result.element.id);
    }
  }, [placeMode, elements, adjust, iW, iH, t, findDoorBounds, doorPrefs, panelPrefs]);

  const delSel = useCallback(() => { if (!selId) return; setElements(prev => adjust(prev.filter(e => e.id !== selId))); setSelId(null); }, [selId, adjust]);

  // Дублирование элемента со сдвигом. Сдвиг зависит от типа:
  // - Вертикальные (stud, door, panel) → X +300мм
  // - Горизонтальные (shelf, rod, drawers) → Y +250мм
  // После создания вызываем adjust чтобы не вылезти за границы / не пересечься.
  const duplicateEl = useCallback((id) => {
    const src = elements.find(e => e.id === id);
    if (!src) return;
    const newId = `e${Date.now()}`;
    const copy = { ...src, id: newId, _order: Math.max(...elements.map(e => e._order || 0), 0) + 1 };
    // Сдвиг
    if (src.type === "stud" || src.type === "door" || src.type === "panel") {
      copy.x = Math.max(0, Math.min(iW - (src.type === "stud" ? t : (src.w || 400)), (src.x || 0) + 300));
    } else if (src.type === "shelf" || src.type === "rod" || src.type === "drawers") {
      copy.y = Math.max(0, Math.min(iH - t, (src.y || 0) + 250));
    }
    setElements(prev => adjust([...prev, copy]));
    setSelId(newId);
  }, [elements, adjust, iW, iH, t]);

  const updateEl = useCallback((id, upd) => {
    setElements(prev => {
      let next = prev.map(e => {
        if (e.id !== id) return e;
        const m = { ...e, ...upd };
        if (m.type === "drawers" && upd.count !== undefined) {
          // Высота блока остаётся прежней (определяется проемом),
          // drawerHeights распределяются РАВНОМЕРНО на новое количество.
          const cnt = upd.count;
          const totalH = m.h || (m.drawerHeights || []).reduce((a, b) => a + b, 0) || 450;
          const per = Math.floor(totalH / cnt);
          const nh = Array(cnt).fill(per);
          // Корректировка остатка: разницу добавляем в последний ящик
          const remainder = totalH - per * cnt;
          if (cnt > 0) nh[cnt - 1] += remainder;
          m.drawerHeights = nh;
          m.h = totalH; // НЕ меняем h при смене кол-ва
        }
        if (m.type === "drawers" && upd.drawerHeights) m.h = upd.drawerHeights.reduce((a, b) => a + b, 0);
        return m;
      });
      return adjust(next);
    });
  }, [adjust]);

  /* Быстрые колбэки для всплывающего тулбара двери (смена типа и стороны петель). */
  const changeDoorType = useCallback((newType: "overlay" | "insert") => {
    if (!selEl || selEl.type !== "door" || selEl.doorLeft === undefined) return;
    const cx = (selEl.x || 0) + (selEl.w || 400) / 2;
    const cy = (selEl.y || 0) + (selEl.h || 600) / 2;
    const fresh = pureFindDoorBounds(elements, cx, cy, iW, iH, t);
    // Синхронизируем doorLeft/Right со свежими границами: если стойка/стена рядом
    // (в пределах 5мм от сохранённого значения) — используем актуальную координату.
    // Это лечит легаси-данные, где doorLeft/Right мог быть записан с ошибкой ±t/2.
    const syncL = Math.abs(selEl.doorLeft - (fresh.left.x ?? 0)) < 20
      ? (fresh.left.x ?? 0) : selEl.doorLeft;
    const syncR = Math.abs(selEl.doorRight - (fresh.right.x ?? iW)) < 20
      ? (fresh.right.x ?? iW) : selEl.doorRight;
    const leftIsWall = Math.abs(selEl.doorLeft - (fresh.left.x ?? 0)) < 20
      ? fresh.left.isWall : false;
    const rightIsWall = Math.abs(selEl.doorRight - (fresh.right.x ?? iW)) < 20
      ? fresh.right.isWall : false;
    const dims = computeDoorDimensions(
      syncL, syncR,
      fresh.top.y, fresh.bottom.y,
      leftIsWall, rightIsWall,
      fresh.top.isWall, fresh.bottom.isWall,
      newType, iW, iH, t,
    );
    updateEl(selEl.id, {
      hingeType: newType, ...dims,
      doorLeft: syncL, doorRight: syncR,
      doorTop: fresh.top.y, doorBottom: fresh.bottom.y,
      doorLeftIsWall: leftIsWall, doorRightIsWall: rightIsWall,
      doorTopIsWall: fresh.top.isWall, doorBottomIsWall: fresh.bottom.isWall,
    });
  }, [selEl, elements, iW, iH, t, updateEl]);

  const changeDoorHingeSide = useCallback((side: "left" | "right") => {
    if (!selEl || selEl.type !== "door") return;
    updateEl(selEl.id, { hingeSide: side });
  }, [selEl, updateEl]);

  const toSvg = useCallback((e) => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    // Поддержка как mouse/pointer event, так и touch event
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const s = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: s.x / SC - frameT, y: s.y / SC - frameT };
  }, [frameT]);

  /* SVG click — place element in zone, or deselect */
  const onSvgClick = useCallback((e) => {
    if (placeMode) {
      const c = toSvg(e);
      // Ignore clicks outside frame or in invalid zones (behind edge studs/shelves)
      if (c.x < 0 || c.x > iW || c.y < 0 || c.y > iH) return;
      const allStuds = elements.filter(el => el.type === "stud");
      const allShelves = elements.filter(el => el.type === "shelf");
      // Edge stud at x=0: click in x<t+2 range is behind it → ignore
      if (allStuds.some(st => st.x < 2) && c.x < t + 2) return;
      // Edge stud at x=iW-t: click in x>iW-t-2 is behind it → ignore
      if (allStuds.some(st => st.x > iW - t - 2) && c.x > iW - t - 2) return;
      // Edge shelf at y=0
      if (allShelves.some(sh => sh.y < 2) && c.y < t + 2) return;
      // Edge shelf at y=iH
      if (allShelves.some(sh => sh.y > iH - 2) && c.y > iH - t - 2) return;
      const z = findZone(zones, c.x, c.y);
      if (z) placeInZone(z, c.x, c.y);
      return;
    }
    const tgt = e.target;
    if (tgt && (tgt.closest && tgt.closest('[data-element="1"]'))) return;
    setSelId(null);
  }, [placeMode, toSvg, zones, placeInZone, elements, iW, iH, t]);

  const onDown = useCallback((e, el) => {
    if (placeMode) return;
    e.stopPropagation();
    const c = toSvg(e);
    const isTouch = e.pointerType === 'touch' || (e.type && e.type.startsWith('touch'));
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    const dragPayload = {
      id: el.id, ox: c.x - (el.x || 0), oy: c.y - (el.y || 0),
      type: el.type, startX: clientX, startY: clientY, moved: false,
    };

    if (isTouch) {
      setSelId(el.id);
      const now = Date.now();
      const isDoubleTap = lastTapElRef.current.id === el.id && (now - lastTapElRef.current.time) < 500;
      lastTapElRef.current = { id: el.id, time: now };

      // Long-press на дверь/панель (400мс) → включить peek-режим (полупрозрачность)
      if (el.type === "door" || el.type === "panel") {
        if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
        peekTimerRef.current = window.setTimeout(() => {
          setPeekId(el.id);
          try { if (navigator.vibrate) navigator.vibrate(20); } catch {}
        }, 400);
      }

      if (isDoubleTap) {
        // Двойной тап → активируем drag-режим и сразу начинаем перемещение
        setMobileDragMode(el.id);
        setDrag(dragPayload);
        try { if (navigator.vibrate) navigator.vibrate([15, 30, 15]); } catch {}
      } else if (mobileDragMode === el.id) {
        // Элемент уже в drag-режиме — продолжаем перемещение при новом тапе
        setDrag(dragPayload);
      } else {
        // Одинарный тап → только выделение, drag не запускаем
        try { if (navigator.vibrate) navigator.vibrate(5); } catch {}
        // Выключаем drag-режим если был на другом элементе
        if (mobileDragMode && mobileDragMode !== el.id) setMobileDragMode(null);
      }
    } else {
      // На десктопе (мышь): мгновенный drag (как было)
      setSelId(el.id);
      setDrag(dragPayload);
    }
  }, [toSvg, placeMode, mobileDragMode]);

  // Double-click element: placeholder for future inline editing action, prevents deselect
  const onElClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  /* Door resize: drag handle on edge to expand/shrink to nearest boundary */
  const onDoorEdgeDrag = useCallback((e, doorEl, edge) => {
    if (placeMode) return;
    e.stopPropagation();
    setSelId(doorEl.id);
    const c = toSvg(e);
    setDrag({ id: doorEl.id, type: "door-resize", edge, startX: c.x, startY: c.y });
  }, [toSvg, placeMode]);

  /* Panel resize — та же логика что и для двери */
  const onPanelEdgeDrag = useCallback((e, panelEl, edge) => {
    if (placeMode) return;
    e.stopPropagation();
    setSelId(panelEl.id);
    const c = toSvg(e);
    setDrag({ id: panelEl.id, type: "panel-resize", edge, startX: c.x, startY: c.y });
  }, [toSvg, placeMode]);

  /* Build sorted boundary lists for door resize snapping */
  const doorSnapTargets = useMemo(
    () => computeDoorSnapTargets(elements, iW, iH, t),
    [elements, iW, iH, t],
  );

  // Применение фактического перемещения — вызывается из RAF через useDragHandlers
  const applyDragMove = useCallback((clientX: number, clientY: number) => {
    if (!drag) return;
    // Threshold: only start actual dragging after 4px movement — otherwise treat as pure selection click
    if (drag.type !== "door-resize" && drag.type !== "panel-resize" && drag.startX !== undefined && !drag.moved) {
      const dx = Math.abs(clientX - drag.startX), dy = Math.abs(clientY - drag.startY);
      if (dx < 4 && dy < 4) return;
      drag.moved = true;
    }
    // Синтезируем event-like объект для toSvg — оно берёт clientX/Y
    const fakeEvent = { clientX, clientY };
    const c = toSvg(fakeEvent);

    /* Door resize logic */
    if (drag.type === "door-resize") {
      setElements(prev => {
        const el = prev.find(e => e.id === drag.id);
        if (!el || el.type !== "door") return prev;

        const { vTargets, hTargets } = doorSnapTargets;
        const otherDoors = prev.filter(e =>
          e.type === "door" && e.id !== el.id && e.doorLeft !== undefined,
        );
        const next = computeDoorResize(
          el, c.x, c.y, drag.edge,
          vTargets, hTargets, otherDoors,
          iW, iH, t,
        );

        return prev.map(e => e.id !== drag.id ? e : {
          ...e, ...next,
          manualW: undefined, manualH: undefined, // clear manual overrides
        });
      });
      return;
    }

    /* Panel resize logic — та же snap/clamp как у двери */
    if (drag.type === "panel-resize") {
      setElements(prev => {
        const el = prev.find(e => e.id === drag.id);
        if (!el || el.type !== "panel") return prev;

        const { vTargets, hTargets } = doorSnapTargets;
        const otherPanels = prev.filter(e =>
          e.type === "panel" && e.id !== el.id && e.panelLeft !== undefined,
        );
        const next = computePanelResize(
          el, c.x, c.y, drag.edge,
          vTargets, hTargets, otherPanels,
          iW, iH, t,
        );

        return prev.map(e => e.id !== drag.id ? e : {
          ...e, ...next,
          manualW: undefined, manualH: undefined,
        });
      });
      return;
    }

    /* Normal element drag */
    setElements(prev => {
      let next = prev.map(el => moveElement(el, drag, c.x, c.y, iW, iH, t));
      next = adjust(next);
      // Убираем временное поле _dragX которое использовалось для drawers/rod
      next = next.map(el => { const { _dragX, ...rest } = el; return rest; });
      return next;
    });
  }, [drag, toSvg, iW, iH, t, adjust, doorSnapTargets]);

  const { onMove, onUp: rawOnUp } = useDragHandlers(drag, applyDragMove, setDrag);

  // Обёртка onUp: очищает peek-timer (если пользователь отпустил до 400мс — peek не включается)
  const onUp = useCallback((e: any) => {
    if (peekTimerRef.current) {
      clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
    // На мобильном: peek гасится когда палец отпущен (короткий показ)
    if (isMobile) {
      // Задержка чтобы пользователь успел увидеть что под дверью, даже если quickly released
      setTimeout(() => setPeekId(null), 1500);
    }
    rawOnUp(e);
  }, [rawOnUp, isMobile]);

  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === "delete" || k === "backspace") delSel();
      if (k === "s" || k === "ы") addEl("shelf");
      if (k === "p" || k === "з") addEl("stud");
      if (k === "d" || k === "в") addEl("drawers");
      if (k === "r" || k === "к") addEl("rod");
      if (k === "f" || k === "а") addEl("door");
      if (k === "escape") { setSelId(null); setPlaceMode(null);  }
      if (k === "h" || k === "р") setShowDoors(p => !p);
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [delSel, addEl]);

  // Re-adjust elements when frame size changes (iW/iH/t)
  useEffect(() => {
    setElements(prev => prev.length ? adjust(prev) : prev);
  }, [iW, iH, t, adjust]);

  const hw = useMemo(() => calcHW(corpus, elements, showCorpus), [corpus, elements, showCorpus]);
  const pts = useMemo(() => calcParts(corpus, elements, showCorpus), [corpus, elements, showCorpus]);
  const area = useMemo(() => pts.filter(p => !p.m).reduce((s, p) => s + p.q * p.l * p.w / 1e6, 0).toFixed(3), [pts]);

  const topLevelCols = useMemo(
    () => computeTopLevelCols(elements, iW, t),
    [elements, iW, t],
  );

  const dims = useMemo(
    () => computeDims(elements, topLevelCols, iH, iW),
    [elements, topLevelCols, iH, iW],
  );

  const getDimDir = (i) => dimDirOverrides[i] || (dims[i]?.t === "w" ? "left" : "top");
  const toggleDimDir = useCallback((i) => { setDimDirOverrides(p => ({ ...p, [i]: getDimDir(i) === "left" || getDimDir(i) === "top" ? (dims[i].t === "w" ? "right" : "bottom") : (dims[i].t === "w" ? "left" : "top") })); }, [dims, dimDirOverrides]);

  const changeHorizDim = useCallback((d, v, dir) => {
    const cmd = applyHorizDimChange(d, v, dir, topLevelCols, elements, iW, t);
    if (!cmd) return;
    if (cmd.type === "updateStud") updateEl(cmd.id, { x: cmd.x });
    else if (cmd.type === "updateCorpusWidth") setCorpus(c => ({ ...c, width: cmd.width }));
  }, [topLevelCols, elements, t, iW, updateEl]);

  const changeVertDim = useCallback((d, v, dir) => {
    const cmd = applyVertDimChange(d, v, dir, topLevelCols, elements, iH);
    if (cmd) updateEl(cmd.id, { y: cmd.y });
  }, [topLevelCols, elements, iH, updateEl]);

  const svgW = corpus.width * SC + 140, svgH = corpus.height * SC + 60;

  // Контекст для render-функций SVG-элементов. Пересчитывается при изменении любой
  // из зависимостей — благодаря useMemo минимизирует ненужные ре-рендеры.
  const renderCtx = useMemo<RenderCtx>(() => ({
    iW, iH, t, frameT,
    selId, placeMode,
    isMobile, showDoors,
    corpusHex: corpusTexInfo.hex || "#8b7355",
    facadeHex: facadeTexInfo.hex || "#f2efe8",
    facadeName: facadeTexInfo.name || "",
    peekId, onPeekIn, onPeekOut,
    onDown,
  }), [iW, iH, t, frameT, selId, placeMode, isMobile, showDoors, corpusTexInfo, facadeTexInfo, peekId, onPeekIn, onPeekOut, onDown]);

  // Блокируем скролл страницы и pull-to-refresh когда идёт drag или активен режим перемещения
  useEffect(() => {
    if (!isMobile) return;
    const isLocked = !!drag || !!mobileDragMode;
    if (isLocked) {
      const prevHtml = document.documentElement.style.overscrollBehavior;
      const prevBody = document.body.style.overscrollBehavior;
      document.documentElement.style.overscrollBehavior = "none";
      document.body.style.overscrollBehavior = "none";
      document.documentElement.style.touchAction = "none";
      return () => {
        document.documentElement.style.overscrollBehavior = prevHtml;
        document.body.style.overscrollBehavior = prevBody;
        document.documentElement.style.touchAction = "";
      };
    }
  }, [isMobile, drag, mobileDragMode]);

  // Отслеживаем ширину viewport для fit'а канваса под экран (пересчитывается при resize/rotate)
  const [viewportW, setViewportW] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 360,
  );
  useEffect(() => {
    if (!isMobile) return;
    const upd = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', upd);
    window.addEventListener('orientationchange', upd);
    return () => {
      window.removeEventListener('resize', upd);
      window.removeEventListener('orientationchange', upd);
    };
  }, [isMobile]);

  // Для мобильного: масштабируем canvas через CSS transform, чтобы влез в экран
  // baseFit — автоматический фит под ширину экрана, userZoom — пинч-зум от пользователя
  const mobileCanvasFit = useMemo(() => {
    if (!isMobile) return 1;
    const availW = viewportW - 16;
    return svgW > availW ? availW / svgW : 1;
  }, [isMobile, svgW, viewportW]);
  const mobileCanvasScale = mobileCanvasFit * userZoom;

  // ── Мобильные touch-жесты: pinch-zoom + pan + double-tap для сброса ─────────────
  const {
    pinchRef,
    panRef,
    panX,
    panY,
    onCanvasTouchStart,
    onCanvasTouchMove,
    onCanvasTouchEnd,
    onCanvasDoubleTap,
  } = useMobileTouch(userZoom, setUserZoom, setDrag);

  // ═══ Ручное сохранение ═══
  // Auto-save выключен — он сохранял промежуточные состояния (например пока
  // adjust() ещё не отработал), что приводило к битым данным после reload.
  // Теперь пользователь явно жмёт «Сохранить». Кнопка подсвечивается когда
  // есть несохранённые изменения. При попытке закрыть/обновить страницу с
  // несохранёнными изменениями — браузер спросит подтверждение.
  //
  // hasUnsavedChanges — флаг что состояние отличается от того что в БД.
  // Сбрасывается после успешного сохранения, ставится в true при изменении
  // corpus/elements/name/textures.
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Save prompt modal — показывается при попытке перейти в список шкафов
  // с несохранёнными изменениями. pendingNavigation хранит callback который
  // выполнится после выбора пользователя (либо после сохранения, либо сразу).
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const skipFirstSaveRef = useRef(true);
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [corpus, elements, cabinetName, corpusTextureId, facadeTextureId, clientId]);

  // Beforeunload — блокирует случайное закрытие/обновление страницы с несохранёнными
  // изменениями. Браузер покажет нативный confirm-диалог.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";  // Chrome требует returnValue
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  // Функция ручного сохранения — вызывается из шапки.
  const handleSave = useCallback(async () => {
    setSaveState("saving");
    try {
      if (currentCabinetId) {
        await updateCabinet(currentCabinetId, {
          name: cabinetName,
          corpus,
          elements,
          corpus_texture_id: corpusTextureId,
          facade_texture_id: facadeTextureId,
          client_id: clientId,
        });
      } else {
        const row = await createCabinet({
          name: cabinetName,
          corpus,
          elements,
          corpus_texture_id: corpusTextureId,
          facade_texture_id: facadeTextureId,
          client_id: clientId,
        });
        setCurrentCabinetId(row.id);
        if (onCreated) onCreated(row.id);
      }
      setSaveState("saved");
      setHasUnsavedChanges(false);
      setTimeout(() => setSaveState(s => s === "saved" ? "idle" : s), 1500);
    } catch (err) {
      console.error("Cabinet save failed:", err);
      setSaveState("error");
    }
  }, [currentCabinetId, cabinetName, corpus, elements, corpusTextureId, facadeTextureId, clientId, onCreated]);

  // Cmd/Ctrl+S — горячая клавиша сохранения.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (hasUnsavedChanges) handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasUnsavedChanges, handleSave]);

  // requestNavigation — общий хелпер для безопасного перехода. Если есть
  // несохранённые изменения — показываем save-prompt модал с тремя кнопками:
  // «Сохранить и перейти», «Не сохранять» и «Отмена». Если изменений нет —
  // переходим сразу.
  const requestNavigation = useCallback((next: () => void) => {
    if (!hasUnsavedChanges) {
      next();
      return;
    }
    pendingNavigationRef.current = next;
    setSavePromptOpen(true);
  }, [hasUnsavedChanges]);

  const handleSavePromptSave = useCallback(async () => {
    await handleSave();
    setSavePromptOpen(false);
    const next = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (next) next();
  }, [handleSave]);

  const handleSavePromptDiscard = useCallback(() => {
    setSavePromptOpen(false);
    setHasUnsavedChanges(false);  // помечаем как «потеряно», чтобы beforeunload не срабатывал
    const next = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (next) next();
  }, []);

  const handleSavePromptCancel = useCallback(() => {
    setSavePromptOpen(false);
    pendingNavigationRef.current = null;
  }, []);

  const canvas = (
<svg ref={svgRef} width={svgW} height={svgH} viewBox={`-70 -16 ${corpus.width * SC + 140} ${corpus.height * SC + 60}`} style={{ cursor: placeMode ? "crosshair" : "default", filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5))" }} onClick={onSvgClick}>
  <defs>
    <pattern id="g" width={100 * SC} height={100 * SC} patternUnits="userSpaceOnUse"><path d={`M ${100 * SC} 0 L 0 0 0 ${100 * SC}`} fill="none" stroke="#161720" strokeWidth={0.5} /></pattern>
  </defs>
  {/* ═══ FRAME / CORPUS ═══ */}
  {renderFrame({
    width: corpus.width,
    height: corpus.height,
    t,
    showCorpus,
    corpusHex: corpusTexInfo.hex || "#8b7355",
  })}

  {/* Zone highlights */}
  {renderZoneHighlights({ zones, placeMode, frameT, elements })}

  {/* Сортированный рендер: сначала стойки/полки/ящики/штанги, в конце двери и панели.
      Это нужно чтобы торцы полок/стоек прятались под передними элементами (дверь/панель). */}
  {[...elements].sort((a, b) => {
    const order = (t: string) => (t === "door" || t === "panel") ? 1 : 0;
    return order(a.type) - order(b.type);
  }).map(el => renderElement(el, renderCtx))}

  {/* DIMS */}
  {renderDims({ dims, frameT, iH, getDimDir, changeHorizDim, changeVertDim })}
  {renderCorpusDims({ width: corpus.width, height: corpus.height, setCorpus })}

  {/* ═══ SELECTED ELEMENT EDITABLE DIMS OVERLAY ═══
      Когда выделена стойка/полка — рисуем редактируемые размеры до соседей. */}
  {renderSelectedDims({ elements, selId, frameT, iW, iH, t, updateEl })}

  {/* ═══ DOOR RESIZE HIT-ZONES OVERLAY ═══
      Рендерится в самом конце SVG чтобы быть ПОВЕРХ всех DIMS и прочих элементов. */}
  {renderDoorHitZones({ elements, selId, showDoors, frameT, iH, isMobile, onDoorEdgeDrag, updateEl })}
  {renderPanelHitZones({ elements, selId, frameT, iH, isMobile, onPanelEdgeDrag, updateEl })}

  {/* ═══ DOOR QUICK TOOLBAR ═══
      Всплывающий тулбар над выделенной дверью: переключение Накл/Вклад + петли. */}
  {renderDoorQuickToolbar({
    elements, selId, frameT, iW, iH, t, showDoors, isMobile,
    onTypeChange: (hingeType) => {
      const d = elements.find(e => e.id === selId && e.type === "door");
      if (!d || d.doorLeft === undefined) {
        if (d) updateEl(d.id, { hingeType });
        return;
      }
      // Свежие bounds для актуальных Y-границ и isWall флагов
      const cx = (d.x || 0) + (d.w || 400) / 2;
      const cy = (d.y || 0) + (d.h || 600) / 2;
      const fresh = pureFindDoorBounds(elements, cx, cy, iW, iH, t);
      const leftIsWall = Math.abs(d.doorLeft - (fresh.left.x ?? 0)) < 5
        ? fresh.left.isWall : false;
      const rightIsWall = Math.abs(d.doorRight - (fresh.right.x ?? iW)) < 5
        ? fresh.right.isWall : false;
      const dims = computeDoorDimensions(
        d.doorLeft, d.doorRight,
        fresh.top.y, fresh.bottom.y,
        leftIsWall, rightIsWall,
        fresh.top.isWall, fresh.bottom.isWall,
        hingeType, iW, iH, t,
      );
      updateEl(d.id, {
        hingeType, ...dims,
        doorTop: fresh.top.y, doorBottom: fresh.bottom.y,
        doorLeftIsWall: leftIsWall, doorRightIsWall: rightIsWall,
        doorTopIsWall: fresh.top.isWall, doorBottomIsWall: fresh.bottom.isWall,
      });
    },
    onHingeSideChange: (side) => {
      if (selId) updateEl(selId, { hingeSide: side });
    },
  })}
</svg>
  );

  return (
    <div
      style={{ minHeight: "100vh", width: "100%", color: "#e5e7eb", userSelect: "none", background: "#0b0c10", fontFamily: "'IBM Plex Mono',monospace", boxSizing: "border-box" }}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onTouchMove={onMove}
      onTouchEnd={onUp}
      onTouchCancel={onUp}
    >
      {/* Save prompt modal — показывается при попытке перейти к списку шкафов
          с несохранёнными изменениями. Три варианта: сохранить, не сохранять, отмена. */}
      {savePromptOpen && (
        <div
          onClick={handleSavePromptCancel}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#14151c",
              border: "1px solid #333",
              borderRadius: 8,
              padding: 24,
              maxWidth: 400,
              width: "90%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#d1d5db" }}>
              Сохранить изменения?
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 20, lineHeight: 1.5 }}>
              В проекте есть несохранённые изменения. Что сделать перед переходом?
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                onClick={handleSavePromptCancel}
                style={{
                  padding: "8px 14px", borderRadius: 6,
                  background: "transparent", color: "#888",
                  border: "1px solid #444", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 12,
                }}
              >Отмена</button>
              <button
                onClick={handleSavePromptDiscard}
                style={{
                  padding: "8px 14px", borderRadius: 6,
                  background: "transparent", color: "#ef4444",
                  border: "1px solid rgba(239,68,68,0.4)", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 12,
                }}
              >Не сохранять</button>
              <button
                onClick={handleSavePromptSave}
                disabled={saveState === "saving"}
                style={{
                  padding: "8px 14px", borderRadius: 6,
                  background: "#d97706", color: "#000",
                  border: "none", cursor: saveState === "saving" ? "default" : "pointer",
                  fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                  opacity: saveState === "saving" ? 0.6 : 1,
                }}
              >{saveState === "saving" ? "Сохраняю…" : "Сохранить"}</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <Header
        corpus={corpus}
        showCorpus={showCorpus}
        t={t}
        mobileDragMode={mobileDragMode}
        setMobileDragMode={setMobileDragMode}
        isMobile={isMobile}
        placeMode={placeMode}
        setPlaceMode={setPlaceMode}
        showDoors={showDoors}
        setShowDoors={setShowDoors}
        show3d={show3d}
        setShow3d={(v) => {
          if (v && placeMode) setPlaceMode(null);
          setShow3d(v);
        }}
        cabinetName={cabinetName}
        setCabinetName={setCabinetName}
        saveState={saveState}
      />

      {/* ═══ PRE-PLACEMENT PREFS ═══
          Плавающее меню свойств для НОВОЙ двери/панели — появляется при активации
          соответствующего placeMode. Позволяет выбрать тип (overlay/insert) и сторону
          петель ДО клика в проёме, чтобы первая же дверь/панель встала с правильными
          параметрами. */}
      {placeMode === "door" && (
        <div style={{
          position: "fixed", top: isMobile ? 60 : 68, left: "50%", transform: "translateX(-50%)",
          zIndex: 200, background: "rgba(18,18,28,0.96)", border: "1px solid rgba(217,119,6,0.4)",
          borderRadius: 8, padding: "10px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", gap: 10, fontSize: 12,
          fontFamily: "'IBM Plex Mono',monospace",
        }}>
          <span style={{ color: "#d97706", fontWeight: 700, marginRight: 4 }}>ДВЕРЬ:</span>

          {/* Тип двери */}
          <span style={{ color: "#9ca3af", fontSize: 10, textTransform: "uppercase" }}>Тип</span>
          <div style={{ display: "flex", gap: 2 }}>
            {(["overlay", "insert"] as const).map(ht => (
              <button key={ht} onClick={() => setDoorPrefs(p => ({ ...p, hingeType: ht }))} style={{
                padding: "5px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                border: "1px solid " + (doorPrefs.hingeType === ht ? "#d97706" : "rgba(100,100,110,0.3)"),
                background: doorPrefs.hingeType === ht ? "rgba(217,119,6,0.18)" : "rgba(30,30,40,0.5)",
                color: doorPrefs.hingeType === ht ? "#d97706" : "#9ca3af", fontWeight: 600,
              }}>{ht === "overlay" ? "Накл." : "Вклад."}</button>
            ))}
          </div>

          {/* Петли */}
          <span style={{ color: "#9ca3af", fontSize: 10, textTransform: "uppercase", marginLeft: 4 }}>Петли</span>
          <div style={{ display: "flex", gap: 2 }}>
            {(["left", "auto", "right"] as const).map(hs => (
              <button key={hs} onClick={() => setDoorPrefs(p => ({ ...p, hingeSide: hs }))} style={{
                padding: "5px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                border: "1px solid " + (doorPrefs.hingeSide === hs ? "#d97706" : "rgba(100,100,110,0.3)"),
                background: doorPrefs.hingeSide === hs ? "rgba(217,119,6,0.18)" : "rgba(30,30,40,0.5)",
                color: doorPrefs.hingeSide === hs ? "#d97706" : "#9ca3af", fontWeight: 600,
              }}>{hs === "left" ? "◀ Лев" : hs === "right" ? "Прав ▶" : "Авто"}</button>
            ))}
          </div>

          {/* Отмена */}
          <button onClick={() => setPlaceMode(null)} style={{
            marginLeft: 6, padding: "5px 8px", borderRadius: 4, fontSize: 11, cursor: "pointer",
            border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)",
            color: "#ef4444", fontWeight: 600,
          }}>× Отмена</button>
        </div>
      )}

      {placeMode === "panel" && (
        <div style={{
          position: "fixed", top: isMobile ? 60 : 68, left: "50%", transform: "translateX(-50%)",
          zIndex: 200, background: "rgba(18,18,28,0.96)", border: "1px solid rgba(96,165,250,0.4)",
          borderRadius: 8, padding: "10px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", gap: 10, fontSize: 12,
          fontFamily: "'IBM Plex Mono',monospace",
        }}>
          <span style={{ color: "#60a5fa", fontWeight: 700, marginRight: 4 }}>ПАНЕЛЬ:</span>
          <span style={{ color: "#9ca3af", fontSize: 10, textTransform: "uppercase" }}>Тип</span>
          <div style={{ display: "flex", gap: 2 }}>
            {(["overlay", "insert"] as const).map(pt => (
              <button key={pt} onClick={() => setPanelPrefs({ panelType: pt })} style={{
                padding: "5px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                border: "1px solid " + (panelPrefs.panelType === pt ? "#60a5fa" : "rgba(100,100,110,0.3)"),
                background: panelPrefs.panelType === pt ? "rgba(96,165,250,0.18)" : "rgba(30,30,40,0.5)",
                color: panelPrefs.panelType === pt ? "#60a5fa" : "#9ca3af", fontWeight: 600,
              }}>{pt === "overlay" ? "Накл." : "Вклад."}</button>
            ))}
          </div>
          <button onClick={() => setPlaceMode(null)} style={{
            marginLeft: 6, padding: "5px 8px", borderRadius: 4, fontSize: 11, cursor: "pointer",
            border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)",
            color: "#ef4444", fontWeight: 600,
          }}>× Отмена</button>
        </div>
      )}

      {/* ═══ MOBILE LAYOUT ═══ */}
      {isMobile && (
        <>
          <MobileCanvasWrapper
            canvas={canvas}
            svgW={svgW}
            svgH={svgH}
            mobileCanvasScale={mobileCanvasScale}
            userZoom={userZoom}
            panX={panX}
            panY={panY}
            pinchRef={pinchRef}
            panRef={panRef}
            drag={drag}
            mobileDragMode={mobileDragMode}
            onCanvasTouchStart={onCanvasTouchStart}
            onCanvasTouchMove={onCanvasTouchMove}
            onCanvasTouchEnd={onCanvasTouchEnd}
            onCanvasDoubleTap={onCanvasDoubleTap}
          />
          <MobileDragIndicator
            active={!!mobileDragMode}
            onExit={() => setMobileDragMode(null)}
          />
          <MobileZoomIndicator
            userZoom={userZoom}
            onReset={() => setUserZoom(1)}
          />
          <MobileBottomToolbar
            mobileSheet={mobileSheet}
            setMobileSheet={setMobileSheet}
            selEl={selEl}
            setShow3d={setShow3d}
          />
        </>
      )}

      {/* ═══ DESKTOP LAYOUT ═══ */}
      {!isMobile && (
      <div style={{ display: "flex", maxWidth: 1600, margin: "0 auto" }}>
        <DesktopLeftPanel
          leftOpen={leftOpen}
          setLeftOpen={setLeftOpen}
          corpus={corpus}
          setCorpus={setCorpus}
          showCorpus={showCorpus}
          setShowCorpus={setShowCorpus}
          placeMode={placeMode}
          addEl={addEl}
          corpusTextureId={corpusTextureId}
          facadeTextureId={facadeTextureId}
          setCorpusTextureId={setCorpusTextureId}
          setFacadeTextureId={setFacadeTextureId}
          customTextures={customTextures}
          setCustomTextures={setCustomTextures}
          customBrands={customBrands}
          setCustomBrands={setCustomBrands}
          selEl={selEl}
          elements={elements}
          updateEl={updateEl}
          delSel={delSel}
          iW={iW}
          iH={iH}
          t={t}
        />
        {!leftOpen && <DesktopOpenLeftButton onOpen={() => setLeftOpen(true)} />}

        {/* SVG */}
        <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", minHeight: "calc(100vh - 46px)" }}>
          {canvas}
        </div>

        {!rightOpen && <DesktopOpenRightButton onOpen={() => setRightOpen(true)} />}

        <DesktopRightPanel
          rightOpen={rightOpen}
          setRightOpen={setRightOpen}
          panel={panel}
          setPanel={setPanel}
          hw={hw}
          pts={pts}
          area={area}
          elements={elements}
        />
      </div>
      )}

      {/* ═══ MOBILE BOTTOM SHEETS ═══ */}
      {isMobile && (
        <>
          <BottomSheet
            isOpen={mobileSheet === 'tools'}
            onClose={() => setMobileSheet(null)}
            title="Инструменты и размеры"
          >
            <MobileToolsSheet
              corpus={corpus}
              setCorpus={setCorpus}
              showCorpus={showCorpus}
              setShowCorpus={setShowCorpus}
              placeMode={placeMode}
              addEl={addEl}
              setMobileSheet={setMobileSheet}
              corpusTextureId={corpusTextureId}
              facadeTextureId={facadeTextureId}
              setCorpusTextureId={setCorpusTextureId}
              setFacadeTextureId={setFacadeTextureId}
              customTextures={customTextures}
              setCustomTextures={setCustomTextures}
              customBrands={customBrands}
              setCustomBrands={setCustomBrands}
            />
          </BottomSheet>

          <BottomSheet
            isOpen={mobileSheet === 'props'}
            onClose={() => setMobileSheet(null)}
            title={selEl ? `Свойства: ${MOBILE_EL_LABELS[selEl.type] || selEl.type}` : 'Свойства'}
          >
            <MobilePropsSheet
              selEl={selEl}
              elements={elements}
              updateEl={updateEl}
              delSel={delSel}
              iW={iW}
              iH={iH}
              t={t}
              corpusDepth={corpus.depth}
              mobileDragMode={mobileDragMode}
              setMobileDragMode={setMobileDragMode}
              setMobileSheet={setMobileSheet}
            />
          </BottomSheet>

          <BottomSheet
            isOpen={mobileSheet === 'summary'}
            onClose={() => setMobileSheet(null)}
            title="Итого и детали"
          >
            <MobileSummarySheet
              panel={panel}
              setPanel={setPanel}
              hw={hw}
              pts={pts}
              area={area}
              elements={elements}
            />
          </BottomSheet>
        </>
      )}

      {show3d && <Wardrobe3D
        corpus={corpus}
        setCorpus={setCorpus}
        elements={elements}
        corpusTexture={corpusTexInfo}
        facadeTexture={facadeTexInfo}
        showDoors={showDoors}
        showCorpus={showCorpus}
        onClose={() => setShow3d(false)}
        selId={selId}
        onElementClick={(id) => {
          setSelId(id);
        }}
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={handleSave}
        saveState={saveState}
        onShowList={() => {
          requestNavigation(() => navigate("/cabinet/list"));
        }}
        // Правая панель свойств для выделенного элемента рендерится ВНУТРИ Wardrobe3D
        // (поверх 3D, на десктопе — sidebar 320px справа, на мобильном — bottom sheet).
        selEl={selEl}
        updateEl={updateEl}
        delSel={delSel}
        onDuplicate={duplicateEl}
        iW={iW}
        iH={iH}
        t={t}
        isMobile={isMobile}
        // Кнопка «+ Стойка/Полка/...» в 3D-toolbar — активирует placeMode НЕ выходя из 3D.
        // Дальше пользователь кликает в зону прямо в 3D — элемент ставится через
        // raycast → screenToCabinetMm → placeInZone (Сессия 2).
        onAddElement={(type) => {
          setPlaceMode(type as any);
        }}
        // Click-to-place в 3D
        placeMode={placeMode}
        setPlaceMode={setPlaceMode}
        findDoorBounds={findDoorBounds}
        placeInZone={placeInZone}
      />}
    </div>
  );
}
