import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import Wardrobe3D from "./Wardrobe3D";
import { TexturePicker, getTextureInfo } from "./TexturePicker";
import { useIsMobile } from "@shared/hooks/useIsMobile";
import BottomSheet from "@shared/components/BottomSheet";
import { SC, TOOLS, GUIDES, HINGES, MOBILE_EL_LABELS, uid } from "../constants";
import { NumInput } from "./inputs/NumInput";
import { renderElement, type RenderCtx } from "./elements";
import { renderFrame, renderZoneHighlights } from "./frame";
import { renderDims, renderCorpusDims, renderSelectedDims, renderDoorHitZones } from "./dims";
import { computeZones, findZone } from "../logic/zones";
import { calcHW, calcParts } from "../logic/calculations";
import { adjust as pureAdjust } from "../logic/adjust";
import { findDoorBounds as pureFindDoorBounds, computeDoorSnapTargets } from "../logic/doorBounds";
import { computeDoorResize } from "../logic/doorResize";
import { moveElement } from "../logic/elementDrag";
import { computeTopLevelCols, computeDims, applyHorizDimChange, applyVertDimChange } from "../logic/dims";
import { useDragHandlers } from "../hooks/useDragHandlers";
import { useMobileTouch } from "../hooks/useMobileTouch";
/* ═══════════════════════════════
   MAIN EDITOR
   ═══════════════════════════════ */
export default function WardrobeEditor() {
  const [corpus, setCorpus] = useState({ width: 1200, height: 2100, depth: 600, thickness: 16 });
  const [elements, setElements] = useState([]);
  const [selId, setSelId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [panel, setPanel] = useState("hardware");
  const [showDoors, setShowDoors] = useState(true);
  const [showCorpus, setShowCorpus] = useState(false); // false = пустая рамка (свободное проектирование)
  const [corpusTextureId, setCorpusTextureId] = useState("egger-h1137");
  const [facadeTextureId, setFacadeTextureId] = useState("egger-w1100");
  const [customTextures, setCustomTextures] = useState([]);
  const [customBrands, setCustomBrands] = useState([]);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [dimDirOverrides, setDimDirOverrides] = useState({});
  const [show3d, setShow3d] = useState(false);
  /* Unified placement: click tool → highlight zones → click zone → place element
     For doors: special mode where user picks 4 boundaries */
  const [placeMode, setPlaceMode] = useState(null); // null | "shelf" | "stud" | "drawers" | "rod" | "door"

  // Mobile state — ВСЕ объявления вместе, чтобы минификатор не ломал порядок
  const isMobile = useIsMobile(768);
  const [mobileDragMode, setMobileDragMode] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<null | 'tools' | 'props' | 'summary'>(null);
  const [userZoom, setUserZoom] = useState<number>(1);
  const lastTapElRef = useRef<{ id: string | null; time: number }>({ id: null, time: 0 });

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
  const placeInZone = useCallback((zone, clickX, clickY) => {
    if (!placeMode) return;
    const id = uid();
    const _order = orderRef.current++;
    let el;

    if (placeMode === "shelf") {
      // Shelf spans between nearest studs/walls at its Y level
      const bounds = findDoorBounds(clickX, clickY);
      const shX = bounds.left.x + (bounds.left.isWall ? 0 : t); // offset after left stud (if any)
      const shW = bounds.right.x - shX; // span to next stud/wall
      const y = Math.max(0, Math.min(iH, Math.round(clickY)));
      el = { id, type: "shelf", x: shX, y, w: shW, anchorX: shX + shW / 2, _order };
    } else if (placeMode === "stud") {
      // Stud spans between nearest shelves/walls at its X column
      const bounds = findDoorBounds(clickX, clickY);
      const midX = (bounds.left.x + bounds.right.x) / 2;
      // For stud placement: click X determines stud center, but stud at x=0 snaps to edge
      let studX;
      if (clickX < 20) studX = 0; // snap to left edge
      else if (clickX > iW - t - 20) studX = iW - t; // snap to right edge
      else studX = Math.max(0, Math.min(iW - t, Math.round(clickX - t / 2)));
      // Stud vertical span = between nearest shelves at this X
      el = {
        id, type: "stud",
        x: studX,
        anchorY: Math.round((bounds.top.y + bounds.bottom.y) / 2),
        pTop: bounds.top.y,
        pBot: bounds.bottom.y,
        _order,
      };
    } else if (placeMode === "drawers") {
      const bounds = findDoorBounds(clickX, clickY);
      const allShelves = elements.filter(e => e.type === "shelf");
      const allStuds = elements.filter(e => e.type === "stud");
      const studAtLeft = allStuds.some(st => Math.abs(st.x - bounds.left.x) < 2);
      const studAtRight = allStuds.some(st => Math.abs(st.x - (bounds.right.x - t)) < 2 || Math.abs(st.x - bounds.right.x) < 2);
      const shelfAtTop = allShelves.some(sh => Math.abs(sh.y - bounds.top.y) < 2);
      const shelfAtBot = allShelves.some(sh => Math.abs(sh.y - bounds.bottom.y) < 2);

      let innerLeft = bounds.left.x + ((!bounds.left.isWall || studAtLeft) ? t : 0);
      let innerRight = bounds.right.x; // right stud's x IS its left edge — drawer ends there

      let topY = bounds.top.y;
      if (!bounds.top.isWall || shelfAtTop) {
        topY = bounds.top.y < 1 ? t : bounds.top.y + t / 2;
      }
      let botY = bounds.bottom.y;
      if (!bounds.bottom.isWall || shelfAtBot) {
        botY = bounds.bottom.y > iH - 1 ? iH - t : bounds.bottom.y - t / 2;
      }

      // HARD CLAMP — never overlap edge studs/shelves, never exceed frame
      const hasEdgeStudLeft = allStuds.some(st => st.x < 2);
      const hasEdgeStudRight = allStuds.some(st => st.x > iW - t - 2);
      const hasEdgeShelfTop = allShelves.some(sh => sh.y < 2);
      const hasEdgeShelfBot = allShelves.some(sh => sh.y > iH - 2);
      if (hasEdgeStudLeft) innerLeft = Math.max(innerLeft, t);
      if (hasEdgeStudRight) innerRight = Math.min(innerRight, iW - t);
      if (hasEdgeShelfTop) topY = Math.max(topY, t);
      if (hasEdgeShelfBot) botY = Math.min(botY, iH - t);
      innerLeft = Math.max(0, innerLeft);
      innerRight = Math.min(iW, innerRight);
      topY = Math.max(0, topY);
      botY = Math.min(iH, botY);

      const innerW = innerRight - innerLeft;
      const maxH = botY - topY;
      // Abort if zone is too narrow/short
      if (innerW < 100 || maxH < 100) {
        setPlaceMode(null);
        return;
      }
      const h = Math.min(450, maxH);
      const h1 = Math.floor(h / 3), h2 = Math.floor(h / 3), h3 = h - h1 - h2;
      el = { id, type: "drawers", x: innerLeft, y: botY - h, w: innerW, h, count: 3, guideType: "roller", drawerHeights: [h1, h2, h3], _order };
    } else if (placeMode === "rod") {
      const bounds = findDoorBounds(clickX, clickY);
      const allStuds = elements.filter(e => e.type === "stud");
      const studAtLeft = allStuds.some(st => Math.abs(st.x - bounds.left.x) < 2);
      const innerLeft = bounds.left.x + ((!bounds.left.isWall || studAtLeft) ? t : 0);
      const innerRight = bounds.right.x;
      const innerW = innerRight - innerLeft;
      el = { id, type: "rod", x: innerLeft + 20, y: Math.round(clickY), w: innerW - 40, _order };
    } else if (placeMode === "door") {
      /* SMART DOOR: one click — find 4 nearest boundaries */
      const bounds = findDoorBounds(clickX, clickY);
      const OC = 14, OS = 7;
      const lo = bounds.left.isWall ? OC : OS;
      const ro = bounds.right.isWall ? OC : OS;
      const to = bounds.top.isWall ? OC : OS;
      const bo = bounds.bottom.isWall ? OC : OS;

      const innerLeft = bounds.left.x + (bounds.left.isWall ? 0 : t);
      const innerW = bounds.right.x - innerLeft;
      const hingeType = "overlay";

      // Ищем уже существующие двери в этом же проёме (с совпадающими границами top/bottom)
      // — чтобы новая дверь не накладывалась, а делила проём пополам
      const sameBoundsDoors = elements.filter(e =>
        e.type === "door"
        && Math.abs((e.doorTop || 0) - bounds.top.y) < 5
        && Math.abs((e.doorBottom || iH) - bounds.bottom.y) < 5
        && (e.doorLeft || 0) >= bounds.left.x - 5
        && (e.doorRight || iW) <= bounds.right.x + 5
      );
      // Куда именно вставать: если клик в левой половине проёма — занимаем левую половину,
      // иначе правую (если есть свободное место)
      const openingMid = (bounds.left.x + bounds.right.x) / 2;
      const wantLeftHalf = clickX < openingMid;

      let effLeft = bounds.left.x;
      let effRight = bounds.right.x;
      let effLeftIsWall = bounds.left.isWall;
      let effRightIsWall = bounds.right.isWall;

      if (sameBoundsDoors.length > 0) {
        // Определяем какая половина свободна
        const hasDoorLeft = sameBoundsDoors.some(d => ((d.doorLeft || 0) + (d.doorRight || iW)) / 2 < openingMid);
        const hasDoorRight = sameBoundsDoors.some(d => ((d.doorLeft || 0) + (d.doorRight || iW)) / 2 >= openingMid);
        // Если обе половины заняты — ставим как раньше (поверх)
        if (hasDoorLeft && hasDoorRight) {
          // fallback — накладываем (это граничный случай)
        } else if (hasDoorLeft && !hasDoorRight) {
          // занята левая половина → ставим правую
          effLeft = openingMid;
          effLeftIsWall = false; // теперь это граница с другой дверью, не стена
        } else if (!hasDoorLeft && hasDoorRight) {
          // занята правая → ставим левую
          effRight = openingMid;
          effRightIsWall = false;
        } else if (wantLeftHalf) {
          effRight = openingMid;
          effRightIsWall = false;
        } else {
          effLeft = openingMid;
          effLeftIsWall = false;
        }
      }

      const effLeftOffset = effLeftIsWall ? OC : OS;
      const effRightOffset = effRightIsWall ? OC : OS;
      const effInnerLeft = effLeft + (effLeftIsWall ? 0 : t);
      const effInnerW = effRight - effInnerLeft;

      let dX, dW, dY, dH;
      if (hingeType === "overlay") {
        dX = effInnerLeft - effLeftOffset;
        dW = effInnerW + effLeftOffset + effRightOffset;
        dY = bounds.top.y - to;
        dH = (bounds.bottom.y - bounds.top.y) + to + bo;
      } else {
        const gap = 2;
        dX = effInnerLeft + gap;
        dW = effInnerW - gap * 2;
        dY = bounds.top.y + gap;
        dH = (bounds.bottom.y - bounds.top.y) - gap * 2;
      }
      // Clamp: не даём двери вылезать за рамку
      if (dX < 0) { dW += dX; dX = 0; }
      if (dX + dW > iW) dW = iW - dX;
      if (dY < 0) { dH += dY; dY = 0; }
      if (dY + dH > iH) dH = iH - dY;

      // Автоматический выбор стороны петель: если дверь левее центра своего эффективного проёма
      // — петли слева, если правее — справа (ручки оказываются ближе к центру)
      const doorCenterX = dX + dW / 2;
      const openingCenterX = (effLeft + effRight) / 2;
      const autoHingeSide = doorCenterX < openingCenterX ? "left" : "right";

      el = {
        id, type: "door", x: dX, y: dY, w: dW, h: dH, doorW: dW, doorH: dH,
        hingeSide: autoHingeSide, hingeType,
        doorLeft: effLeft, doorRight: effRight, doorTop: bounds.top.y, doorBottom: bounds.bottom.y,
        doorLeftIsWall: effLeftIsWall, doorRightIsWall: effRightIsWall,
        doorTopIsWall: bounds.top.isWall, doorBottomIsWall: bounds.bottom.isWall,
        _order,
      };
    } else return;

    setElements(prev => adjust([...prev, el]));
    // Удерживаем placeMode только для shelf и stud — их обычно ставят по несколько подряд.
    // Для rod / drawers / door сбрасываем — это одиночные элементы.
    if (placeMode !== "shelf" && placeMode !== "stud") {
      setPlaceMode(null);
      setSelId(id);
    }
  }, [placeMode, elements, adjust, iW, iH, t, findDoorBounds]);

  const delSel = useCallback(() => { if (!selId) return; setElements(prev => adjust(prev.filter(e => e.id !== selId))); setSelId(null); }, [selId, adjust]);

  const updateEl = useCallback((id, upd) => {
    setElements(prev => {
      let next = prev.map(e => {
        if (e.id !== id) return e;
        const m = { ...e, ...upd };
        if (m.type === "drawers" && upd.count !== undefined) { const cnt = upd.count, old = m.drawerHeights || [], nh = []; for (let i = 0; i < cnt; i++) nh.push(old[i] || 150); m.drawerHeights = nh; m.h = nh.reduce((a, b) => a + b, 0); }
        if (m.type === "drawers" && upd.drawerHeights) m.h = upd.drawerHeights.reduce((a, b) => a + b, 0);
        return m;
      });
      return adjust(next);
    });
  }, [adjust]);

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

  /* Build sorted boundary lists for door resize snapping */
  const doorSnapTargets = useMemo(
    () => computeDoorSnapTargets(elements, iW, iH),
    [elements, iW, iH],
  );

  // Применение фактического перемещения — вызывается из RAF через useDragHandlers
  const applyDragMove = useCallback((clientX: number, clientY: number) => {
    if (!drag) return;
    // Threshold: only start actual dragging after 4px movement — otherwise treat as pure selection click
    if (drag.type !== "door-resize" && drag.startX !== undefined && !drag.moved) {
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

    /* Normal element drag */
    setElements(prev => {
      let next = prev.map(el => moveElement(el, drag, c.x, c.y, iW, iH, t));
      next = adjust(next);
      // Убираем временное поле _dragX которое использовалось для drawers/rod
      next = next.map(el => { const { _dragX, ...rest } = el; return rest; });
      return next;
    });
  }, [drag, toSvg, iW, iH, t, adjust, doorSnapTargets]);

  const { onMove, onUp } = useDragHandlers(drag, applyDragMove, setDrag);

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
    onDown,
  }), [iW, iH, t, frameT, selId, placeMode, isMobile, showDoors, corpusTexInfo, facadeTexInfo, onDown]);

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

  {elements.map(el => renderElement(el, renderCtx))}

  {/* DIMS */}
  {renderDims({ dims, frameT, iH, getDimDir, changeHorizDim, changeVertDim })}
  {renderCorpusDims({ width: corpus.width, height: corpus.height, setCorpus })}

  {/* ═══ SELECTED ELEMENT EDITABLE DIMS OVERLAY ═══
      Когда выделена стойка/полка — рисуем редактируемые размеры до соседей. */}
  {renderSelectedDims({ elements, selId, frameT, iW, iH, t, updateEl })}

  {/* ═══ DOOR RESIZE HIT-ZONES OVERLAY ═══
      Рендерится в самом конце SVG чтобы быть ПОВЕРХ всех DIMS и прочих элементов. */}
  {renderDoorHitZones({ elements, selId, showDoors, frameT, iH, isMobile, onDoorEdgeDrag, updateEl })}
</svg>
  );

  // ══════════════════════════════════════════════════════
  // MOBILE COMPONENTS (inline) — доступ к замыканию WardrobeEditor
  // ══════════════════════════════════════════════════════

  const MobileToolbarButton = ({ label, icon, active, highlight, onClick }: {
    label: string; icon: string; active?: boolean; highlight?: boolean; onClick: () => void;
  }) => (
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

  // Tools sheet — содержит: размеры корпуса, кнопки инструментов, TexturePicker
  const MobileToolsSheet = (
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

  // Props sheet — свойства выделенного элемента
  const MobilePropsSheet = selEl ? (
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
            // Вверх/вниз — какая сторона двигается. Верх: doorTop двигается. Низ: doorBottom двигается.
            // Пользователь вводит нужный итоговый размер по высоте, и выбирает куда расти.
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
                      // растём вверх: doorTop = doorBottom - v
                      const newTop = Math.max(0, (selEl.doorBottom ?? iH) - v);
                      updateEl(selEl.id, {
                        doorTop: newTop,
                        doorTopIsWall: newTop < 1,
                        manualH: undefined, // пересчитается через adjust
                      });
                      try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
                    }} min={50} max={iH} color="#5a8fd4" width="100%" />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Расти вниз ↓</div>
                    <NumInput value={doorH} onChange={v => {
                      // растём вниз: doorBottom = doorTop + v
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
              <button key={ht.id} onClick={() => updateEl(selEl.id, { hingeType: ht.id })} style={{
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

      {selEl.type === "stud" && (() => {
        // Найти соседние stud/стенки слева и справа
        const others = elements.filter(e => e.type === "stud" && e.id !== selEl.id).sort((a, b) => a.x - b.x);
        let leftNeighborRight = 0; // правый край соседа слева (или стенка x=0)
        let rightNeighborLeft = iW; // левый край соседа справа (или стенка x=iW)
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
        // Найти соседние полки с перекрытием по X
        const myLeft = selEl.x || 0, myRight = myLeft + (selEl.w || iW);
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

      {/* Одна кнопка для перемещения — дублирует indicator в header */}
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
  ) : (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "#666", fontSize: 13 }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>👆</div>
      Тапни элемент на схеме, чтобы редактировать его свойства.
    </div>
  );

  // Summary sheet — табы крепёж / детали / итого
  const MobileSummarySheet = (
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

  return (
    <div
      style={{ minHeight: "100vh", width: "100%", color: "#e5e7eb", userSelect: "none", background: "#0b0c10", fontFamily: "'IBM Plex Mono',monospace", boxSizing: "border-box" }}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onTouchMove={onMove}
      onTouchEnd={onUp}
      onTouchCancel={onUp}
    >
      {/* HEADER */}
      <div style={{ borderBottom: "1px solid rgba(50,50,60,0.4)", padding: "8px 16px", background: "rgba(11,12,16,0.97)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#d97706", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 900, fontSize: 11 }}>К2</div>
          <div><h1 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#d1d5db", margin: 0 }}>Редактор мебели</h1>
            <p style={{ fontSize: 11, color: "#555", margin: 0 }}>{corpus.width}×{corpus.height}×{corpus.depth} · {showCorpus ? `${t}мм ЛДСП` : "рамка"}</p></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Drag mode indicator (mobile) */}
          {mobileDragMode && isMobile && (
            <div style={{ padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "rgba(168,85,247,0.15)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.3)", display: "flex", alignItems: "center", gap: 6 }}>
              ✋ Перемещение
              <button onClick={() => setMobileDragMode(null)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0, lineHeight: 1 }}>✕</button>
            </div>
          )}
          {/* Place mode indicator — показывает активный режим размещения */}
          {placeMode && <div style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>{{ shelf: "━ Полка", stud: "┃ Стойка", drawers: "☰ Ящики", rod: "⎯ Штанга", door: "🚪 Дверь" }[placeMode]} · {(placeMode === "shelf" || placeMode === "stud") ? "можно ставить ещё" : "кликни в проём"} <button onClick={() => { setPlaceMode(null);  }} style={{ marginLeft: 6, background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✕</button></div>}
          {/* #2: Eye icon for doors toggle */}
          <button onClick={() => setShowDoors(p => !p)} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid", background: showDoors ? "rgba(217,119,6,0.12)" : "rgba(100,100,100,0.12)", color: showDoors ? "#d97706" : "#888", borderColor: showDoors ? "rgba(217,119,6,0.3)" : "#444" }}>🚪 Двери {showDoors ? "👁" : "👁‍🗨"}</button>
          <button onClick={() => setShow3d(true)} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(96,165,250,0.3)", background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}>🧊 3D</button>
        </div>
      </div>

      {/* ═══ MOBILE LAYOUT ═══ */}
      {isMobile && (
        <>
          {/* MOBILE CANVAS */}
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
            }}>
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
                // угла и не смещал визуально левый край. Это важно для правильной работы
                // с обёрткой конкретного размера.
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

          {/* MOBILE DRAG MODE INDICATOR */}
          {mobileDragMode && (
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
                  setMobileDragMode(null);
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
          )}

          {/* MOBILE ZOOM INDICATOR */}
          {userZoom !== 1 && (
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
                onClick={() => setUserZoom(1)}
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
          )}

          {/* MOBILE BOTTOM TOOLBAR */}
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
        </>
      )}

      {/* ═══ DESKTOP LAYOUT ═══ */}
      {!isMobile && (
      <div style={{ display: "flex", maxWidth: 1600, margin: "0 auto" }}>
        {/* LEFT PANEL */}
        <div style={{ width: leftOpen ? 200 : 0, overflow: leftOpen ? "auto" : "hidden", transition: "width 0.2s", borderRight: "1px solid rgba(50,50,60,0.3)", flexShrink: 0, maxHeight: "calc(100vh - 46px)", position: "relative" }}>
          {leftOpen && <div style={{ padding: 10 }}>
            <button onClick={() => setLeftOpen(false)} style={{ position: "absolute", top: 4, right: 4, background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16 }}>◀</button>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 6 }}>Рамка</div>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {[{ k: "width", l: "Ш", mn: 300, mx: 3000 }, { k: "height", l: "В", mn: 300, mx: 2700 }, { k: "depth", l: "Г", mn: 250, mx: 700 }].map(p => <NumInput key={p.k} label={p.l} value={corpus[p.k]} onChange={v => setCorpus(c => ({ ...c, [p.k]: v }))} min={p.mn} max={p.mx} />)}
              </div>
              <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>{[16, 18, 22].map(th => <button key={th} onClick={() => setCorpus(c => ({ ...c, thickness: th }))} style={{ flex: 1, padding: "3px 0", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", background: corpus.thickness === th ? "#d97706" : "rgba(30,30,40,0.5)", color: corpus.thickness === th ? "#000" : "#6b7280" }}>{th}</button>)}</div>
              <button onClick={() => setShowCorpus(p => !p)} style={{
                width: "100%", padding: "5px 0", borderRadius: 4, fontSize: 10, fontWeight: 700,
                cursor: "pointer", border: "1px solid",
                background: showCorpus ? "rgba(217,119,6,0.12)" : "rgba(100,100,100,0.08)",
                color: showCorpus ? "#d97706" : "#666",
                borderColor: showCorpus ? "rgba(217,119,6,0.3)" : "#333",
              }}>{showCorpus ? "☑ Корпус ЛДСП" : "☐ Пустая рамка"}</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 6 }}>Добавить</div>
              {TOOLS.map(it => <button key={it.type} onClick={() => addEl(it.type)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "5px 8px", borderRadius: 4, marginBottom: 2, cursor: "pointer", background: placeMode === it.type ? "rgba(34,197,94,0.15)" : "rgba(30,30,40,0.3)", border: placeMode === it.type ? "1px solid rgba(34,197,94,0.3)" : "1px solid transparent", color: placeMode === it.type ? "#22c55e" : "#d1d5db", fontSize: 11 }}>
                <span style={{ fontSize: 14, width: 20, textAlign: "center", opacity: 0.5 }}>{it.icon}</span><span style={{ flex: 1 }}>{it.label}</span><span style={{ color: "#444", fontSize: 10 }}>{it.key}</span></button>)}
            </div>
            <div style={{ marginBottom: 12 }}>
              <TexturePicker corpusTextureId={corpusTextureId} facadeTextureId={facadeTextureId} onCorpusChange={setCorpusTextureId} onFacadeChange={setFacadeTextureId} customTextures={customTextures} onAddCustom={(tex) => setCustomTextures(prev => [...prev, tex])} customBrands={customBrands} onAddBrand={(name) => setCustomBrands(prev => [...prev, name])} />
            </div>
            {/* Props */}
            {selEl ? <div style={{ background: "rgba(30,30,40,0.5)", border: "1px solid rgba(100,90,70,0.3)", borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 11, color: "#d97706", fontWeight: 700, marginBottom: 6 }}>{{ stud: "Стойка", drawers: "Ящики", shelf: "Полка", rod: "Штанга", door: "Дверь" }[selEl.type]}</div>
              {selEl.type === "drawers" && (() => {
                const cnt = selEl.count || 3, heights = selEl.drawerHeights || Array(cnt).fill(150);
                return <>
                  <div style={{ marginBottom: 6 }}><div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Кол-во</div>
                    <div style={{ display: "flex", gap: 3 }}>{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => updateEl(selEl.id, { count: n })} style={{ flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", background: cnt === n ? "#22c55e" : "rgba(30,30,40,0.5)", color: cnt === n ? "#000" : "#6b7280" }}>{n}</button>)}</div></div>
                  <div style={{ marginBottom: 6 }}><div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Высоты</div>
                    {Array.from({ length: cnt }, (_, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: "#555", width: 16 }}>{i + 1}.</span>
                      <NumInput value={heights[i] || 150} onChange={v => { const nh = [...heights]; nh[i] = Math.max(60, Math.min(600, v)); updateEl(selEl.id, { drawerHeights: nh }); }} min={60} max={600} color="#22c55e" width="100%" /></div>)}
                    <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>Σ {heights.slice(0, cnt).reduce((a, b) => a + b, 0)}мм</div></div>
                  <div style={{ marginBottom: 6 }}><div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Направляющие</div>
                    {GUIDES.map(gt => <button key={gt.id} onClick={() => updateEl(selEl.id, { guideType: gt.id })} style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2, cursor: "pointer", border: "1px solid transparent", background: (selEl.guideType || "roller") === gt.id ? "rgba(34,197,94,0.12)" : "rgba(30,30,40,0.4)", color: (selEl.guideType || "roller") === gt.id ? "#22c55e" : "#9ca3af", borderColor: (selEl.guideType || "roller") === gt.id ? "rgba(34,197,94,0.3)" : "transparent" }}><b>{gt.label}</b> <span style={{ color: "#555" }}>~{gt.p}₽</span></button>)}</div>
                </>;
              })()}
              {selEl.type === "door" && <>
                <div style={{ marginBottom: 6 }}><div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Тип петли</div>
                  {HINGES.map(ht => <button key={ht.id} onClick={() => updateEl(selEl.id, { hingeType: ht.id })} style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2, cursor: "pointer", border: "1px solid transparent", background: (selEl.hingeType || "overlay") === ht.id ? "rgba(217,119,6,0.12)" : "rgba(30,30,40,0.4)", color: (selEl.hingeType || "overlay") === ht.id ? "#d97706" : "#9ca3af" }}>{ht.label}</button>)}</div>
                <div style={{ marginBottom: 6 }}><div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Петли</div>
                  <div style={{ display: "flex", gap: 3 }}>{["left", "right"].map(s => <button key={s} onClick={() => updateEl(selEl.id, { hingeSide: s })} style={{ flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", background: selEl.hingeSide === s ? "#d97706" : "rgba(30,30,40,0.5)", color: selEl.hingeSide === s ? "#000" : "#6b7280" }}>{s === "left" ? "← Лево" : "Право →"}</button>)}</div></div>
                <div style={{ fontSize: 9, color: "#555", marginTop: 4 }}>
                  {(selEl.hingeType || "overlay") === "overlay" ? "Накл: +14мм корпус / +7мм стойка" : "Вкладная: зазор 2мм"}
                  {selEl.doorLeft !== undefined && <><br/>Границы: {Math.round(selEl.doorLeft)}–{Math.round(selEl.doorRight)} × {Math.round(selEl.doorTop)}–{Math.round(selEl.doorBottom)}</>}
                </div>
              </>}
              {selEl.type === "stud" && <div>
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
                  style={{ width: "100%", padding: "6px 0", borderRadius: 4, marginTop: 6, background: "rgba(96,165,250,0.12)", color: "#60a5fa", fontSize: 11, fontWeight: 700, border: "1px solid rgba(96,165,250,0.3)", cursor: "pointer" }}
                >⟷ По центру</button>
              </div>}
              {selEl.type === "shelf" && <div>
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
                  style={{ width: "100%", padding: "6px 0", borderRadius: 4, marginTop: 6, background: "rgba(217,119,6,0.12)", color: "#d97706", fontSize: 11, fontWeight: 700, border: "1px solid rgba(217,119,6,0.3)", cursor: "pointer" }}
                >⟷ По центру</button>
              </div>}
              <button onClick={delSel} style={{ width: "100%", padding: "5px 0", borderRadius: 4, marginTop: 8, background: "rgba(220,38,38,0.12)", color: "#ef4444", fontSize: 11, fontWeight: 700, border: "1px solid rgba(220,38,38,0.2)", cursor: "pointer" }}>✕ Удалить</button>
            </div> : <div style={{ fontSize: 11, color: "#555", fontStyle: "italic" }}>Кликни элемент</div>}
          </div>}
        </div>
        {!leftOpen && <button onClick={() => setLeftOpen(true)} style={{ position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 30, width: 24, height: 60, borderRadius: "0 6px 6px 0", background: "#1a1b22", border: "1px solid #333", borderLeft: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>▶</button>}

        {/* SVG */}
        <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", minHeight: "calc(100vh - 46px)" }}>
          {canvas}
        </div>

        {!rightOpen && <button onClick={() => setRightOpen(true)} style={{ position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)", zIndex: 30, width: 24, height: 60, borderRadius: "6px 0 0 6px", background: "#1a1b22", border: "1px solid #333", borderRight: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>◀</button>}

        {/* RIGHT PANEL */}
        <div style={{ width: rightOpen ? 230 : 0, overflow: rightOpen ? "auto" : "hidden", transition: "width 0.2s", borderLeft: "1px solid rgba(50,50,60,0.3)", flexShrink: 0, maxHeight: "calc(100vh - 46px)" }}>
          {rightOpen && <>
            <button onClick={() => setRightOpen(false)} style={{ position: "absolute", right: 8, top: 52, background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16, zIndex: 11 }}>▶</button>
            <div style={{ display: "flex", borderBottom: "1px solid rgba(50,50,60,0.3)", position: "sticky", top: 0, zIndex: 10, background: "#0b0c10" }}>
              {[{ id: "hardware", l: "Крепёж" }, { id: "parts", l: "Детали" }, { id: "summary", l: "Итого" }].map(tb => <button key={tb.id} onClick={() => setPanel(tb.id)} style={{ flex: 1, padding: "8px 0", fontSize: 10, fontWeight: 700, textTransform: "uppercase", cursor: "pointer", border: "none", background: "transparent", color: panel === tb.id ? "#d97706" : "#555", borderBottom: panel === tb.id ? "2px solid #d97706" : "2px solid transparent" }}>{tb.l}</button>)}
            </div>
            <div style={{ padding: 8 }}>
              {panel === "hardware" && hw.map((h, i) => <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "4px 0", borderBottom: "1px solid rgba(50,50,60,0.15)" }}><span style={{ fontSize: 12 }}>{h.i}</span><div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#d1d5db" }}>{h.n}</div><div style={{ fontSize: 10, color: "#555" }}>{h.r}</div></div><span style={{ fontSize: 12, color: "#d97706", fontWeight: 900 }}>{h.q}</span></div>)}
              {panel === "parts" && pts.map((p, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid rgba(50,50,60,0.15)" }}><div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#d1d5db" }}>{p.n}</div><div style={{ fontSize: 10, color: "#555", fontFamily: "'IBM Plex Mono',monospace" }}>{p.l}×{p.w}</div></div><span style={{ fontSize: 11, color: "#6b7280" }}>{p.q}</span></div>)}
              {panel === "summary" && <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div style={{ background: "rgba(30,30,40,0.4)", borderRadius: 6, padding: 10, textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 900, color: "#d97706" }}>{area}</div><div style={{ fontSize: 10, color: "#555" }}>м² ЛДСП</div></div>
                  <div style={{ background: "rgba(30,30,40,0.4)", borderRadius: 6, padding: 10, textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 900, color: "#d1d5db" }}>{elements.length}</div><div style={{ fontSize: 10, color: "#555" }}>элем.</div></div>
                </div>
                <button style={{ width: "100%", padding: "8px 0", borderRadius: 6, background: "#d97706", color: "#000", fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer" }}>📄 Экспорт CSV</button>
              </div>}
            </div>
          </>}
        </div>
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
            {MobileToolsSheet}
          </BottomSheet>

          <BottomSheet
            isOpen={mobileSheet === 'props'}
            onClose={() => setMobileSheet(null)}
            title={selEl ? `Свойства: ${MOBILE_EL_LABELS[selEl.type] || selEl.type}` : 'Свойства'}
          >
            {MobilePropsSheet}
          </BottomSheet>

          <BottomSheet
            isOpen={mobileSheet === 'summary'}
            onClose={() => setMobileSheet(null)}
            title="Итого и детали"
          >
            {MobileSummarySheet}
          </BottomSheet>
        </>
      )}

      {show3d && <Wardrobe3D corpus={corpus} elements={elements} corpusTexture={corpusTexInfo} facadeTexture={facadeTexInfo} showDoors={showDoors} showCorpus={showCorpus} onClose={() => setShow3d(false)} />}
    </div>
  );
}
