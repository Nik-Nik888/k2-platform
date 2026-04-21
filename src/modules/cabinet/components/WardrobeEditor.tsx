import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import Wardrobe3D from "./Wardrobe3D";
import { TexturePicker, getTextureInfo } from "./TexturePicker";
import { useIsMobile } from "@shared/hooks/useIsMobile";
import BottomSheet from "@shared/components/BottomSheet";
import { SC, MIN_S, SNAP, TOOLS, GUIDES, HINGES, MOBILE_EL_LABELS, uid } from "../constants";
import { SvgInput } from "./inputs/SvgInput";
import { NumInput } from "./inputs/NumInput";
import { computeZones, findZone } from "../logic/zones";
import { calcHW, calcParts } from "../logic/calculations";
import { adjust as pureAdjust } from "../logic/adjust";
import { findDoorBounds as pureFindDoorBounds, computeDoorSnapTargets } from "../logic/doorBounds";
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
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

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

  // RAF для троттлинга drag-обновлений — сглаживает тач-перемещение
  const rafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ clientX: number; clientY: number } | null>(null);

  // Применение фактического перемещения — вызывается из RAF
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

        let newBounds = {
          left: el.doorLeft ?? 0, right: el.doorRight ?? iW,
          top: el.doorTop ?? 0, bottom: el.doorBottom ?? iH,
          leftIsWall: el.doorLeftIsWall ?? true, rightIsWall: el.doorRightIsWall ?? true,
          topIsWall: el.doorTopIsWall ?? true, bottomIsWall: el.doorBottomIsWall ?? true,
        };

        const { vTargets, hTargets } = doorSnapTargets;

        if (drag.edge === "top" || drag.edge === "bottom") {
          // Find nearest H target to mouse Y
          const mouseY = c.y;
          let best = null, bestDist = Infinity;
          for (const ht of hTargets) {
            // Only snap to targets that make sense (don't invert)
            if (drag.edge === "top" && ht.pos >= newBounds.bottom) continue;
            if (drag.edge === "bottom" && ht.pos <= newBounds.top) continue;
            const d = Math.abs(ht.pos - mouseY);
            if (d < bestDist) { bestDist = d; best = ht; }
          }
          if (best) {
            if (drag.edge === "top") { newBounds.top = best.pos; newBounds.topIsWall = best.isWall; }
            else { newBounds.bottom = best.pos; newBounds.bottomIsWall = best.isWall; }
          }
        }

        if (drag.edge === "left" || drag.edge === "right") {
          const mouseX = c.x;
          let best = null, bestDist = Infinity;
          for (const vt of vTargets) {
            if (drag.edge === "left" && vt.pos >= newBounds.right) continue;
            if (drag.edge === "right" && vt.pos <= newBounds.left) continue;
            const d = Math.abs(vt.pos - mouseX);
            if (d < bestDist) { bestDist = d; best = vt; }
          }
          if (best) {
            if (drag.edge === "left") { newBounds.left = best.pos; newBounds.leftIsWall = best.isWall; }
            else { newBounds.right = best.pos; newBounds.rightIsWall = best.isWall; }
          }
        }

        // ══ CLAMP ПО СОСЕДНИМ ДВЕРЯМ ══
        // Дверь не может пересечь границу соседней двери чей вертикальный диапазон пересекается.
        // Это защита от случая когда snap выбирает дальнюю цель, а на пути есть соседняя дверь.
        const otherDoors = prev.filter(e => e.type === "door" && e.id !== el.id && e.doorLeft !== undefined);
        const myTop = newBounds.top, myBot = newBounds.bottom;
        const overlapsVertically = (d: any) => {
          const dT = d.doorTop ?? 0, dB = d.doorBottom ?? iH;
          return dT < myBot - 1 && dB > myTop + 1;
        };
        if (drag.edge === "right") {
          for (const d of otherDoors) {
            if (!overlapsVertically(d)) continue;
            if (d.doorLeft >= newBounds.left && newBounds.right > d.doorLeft) {
              newBounds.right = d.doorLeft;
              newBounds.rightIsWall = false;
            }
          }
        } else if (drag.edge === "left") {
          for (const d of otherDoors) {
            if (!overlapsVertically(d)) continue;
            if (d.doorRight <= newBounds.right && newBounds.left < d.doorRight) {
              newBounds.left = d.doorRight;
              newBounds.leftIsWall = false;
            }
          }
        }
        if (drag.edge === "bottom" || drag.edge === "top") {
          const myLeft = newBounds.left, myRight = newBounds.right;
          const overlapsHorizontally = (d: any) => {
            const dL = d.doorLeft ?? 0, dR = d.doorRight ?? iW;
            return dL < myRight - 1 && dR > myLeft + 1;
          };
          if (drag.edge === "bottom") {
            for (const d of otherDoors) {
              if (!overlapsHorizontally(d)) continue;
              const dTop = d.doorTop ?? 0;
              if (dTop >= newBounds.top && newBounds.bottom > dTop) {
                newBounds.bottom = dTop;
                newBounds.bottomIsWall = false;
              }
            }
          } else {
            for (const d of otherDoors) {
              if (!overlapsHorizontally(d)) continue;
              const dBot = d.doorBottom ?? iH;
              if (dBot <= newBounds.bottom && newBounds.top < dBot) {
                newBounds.top = dBot;
                newBounds.topIsWall = false;
              }
            }
          }
        }

        // Recalculate door dimensions
        const OC = 14, OS = 7;
        const lo = newBounds.leftIsWall ? OC : OS;
        const ro = newBounds.rightIsWall ? OC : OS;
        const to = newBounds.topIsWall ? OC : OS;
        const bo = newBounds.bottomIsWall ? OC : OS;
        const innerLeft = newBounds.left + (newBounds.left > 0 ? t : 0);
        const innerW = newBounds.right - innerLeft;
        const ht = el.hingeType || "overlay";
        let dX, dW, dY, dH;
        if (ht === "overlay") {
          dX = innerLeft - lo; dW = innerW + lo + ro;
          dY = newBounds.top - to; dH = (newBounds.bottom - newBounds.top) + to + bo;
        } else {
          const gap = 2;
          dX = innerLeft + gap; dW = innerW - gap * 2;
          dY = newBounds.top + gap; dH = (newBounds.bottom - newBounds.top) - gap * 2;
        }

        return prev.map(e => e.id !== drag.id ? e : {
          ...e, x: dX, y: dY, w: dW, h: dH, doorW: dW, doorH: dH,
          doorLeft: newBounds.left, doorRight: newBounds.right,
          doorTop: newBounds.top, doorBottom: newBounds.bottom,
          doorLeftIsWall: newBounds.leftIsWall, doorRightIsWall: newBounds.rightIsWall,
          doorTopIsWall: newBounds.topIsWall, doorBottomIsWall: newBounds.bottomIsWall,
          manualW: undefined, manualH: undefined, // clear manual overrides
        });
      });
      return;
    }

    /* Normal element drag */
    setElements(prev => {
      let next = prev.map(el => {
        if (el.id !== drag.id) return el;
        if (drag.type === "stud") {
          let nx = Math.round((c.x - drag.ox) / SNAP) * SNAP;
          nx = Math.max(0, Math.min(iW - t, nx));
          if (nx < 10) nx = 0;
          if (nx > iW - t - 10) nx = iW - t;
          const anchorY = Math.max(0, Math.min(iH, Math.round(c.y)));
          return { ...el, x: nx, anchorY };
        }
        if (drag.type === "shelf") {
          const ny = Math.max(0, Math.min(iH, Math.round(c.y - drag.oy)));
          return { ...el, y: ny };
        }
        if (drag.type === "door") {
          // Дверь двигается по X и Y одновременно, в пределах iW/iH
          const nx = Math.max(0, Math.min(iW - (el.w || 50), Math.round(c.x - drag.ox)));
          const ny = Math.max(0, Math.min(iH - (el.h || 50), Math.round(c.y - drag.oy)));
          return { ...el, x: nx, y: ny };
        }
        const ny = Math.max(0, Math.min(iH - (drag.type === "drawers" ? (el.h || 450) : 20), Math.round(c.y - drag.oy)));
        return { ...el, y: ny, _dragX: c.x };
      });
      next = adjust(next);
      next = next.map(el => { const { _dragX, ...rest } = el; return rest; });
      return next;
    });
  }, [drag, toSvg, iW, iH, t, adjust]);

  const onMove = useCallback((e) => {
    // Поддержка touch — берём координаты первого пальца
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX);
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY);
    if (clientX === undefined) return;
    if (!drag) return;

    // Буферизируем координаты в ref — применим на следующий анимационный кадр.
    // Это сильно сглаживает drag на touch-устройствах, где события прилетают быстрее 60fps.
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
    // Отменяем запланированный RAF и пустим ref
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingMoveRef.current = null;
    setDrag(null);
  }, []);

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

  const topLevelCols = useMemo(() => {
    const studs = elements.filter(e => e.type === "stud").sort((a, b) => a.x - b.x);
    const xs = [...new Set([0, ...studs.map(s => s.x), iW])].sort((a, b) => a - b);
    return xs.slice(0, -1).map((left, i) => {
      const hasLeftStud = studs.some(st => Math.abs(st.x - left) < 5);
      const sl = left + (hasLeftStud ? t : 0);
      return { left, right: xs[i + 1], sl, sw: xs[i + 1] - sl };
    });
  }, [elements, iW, t]);

  const dims = useMemo(() => {
    const res = [];
    topLevelCols.forEach((col, i) => res.push({ t: "w", x: col.sl, w: col.sw, si: i }));
    // Сначала собираем все вертикальные сегменты по колонкам
    const hSegments: { x: number; y: number; h: number; topY: number; si: number; xRight: number }[] = [];
    topLevelCols.forEach((col, ci) => {
      const breaks = [{ y: 0 }];
      elements.forEach(el => {
        if (el.type === "stud" || el.type === "door") return;
        if (el.type === "shelf") {
          // Полка добавляет brake только если её X-диапазон перекрывает эту колонку
          const shL = el.x || 0, shR = shL + (el.w || iW);
          if (shR > col.sl + 1 && shL < col.sl + col.sw - 1) breaks.push({ y: el.y });
          return;
        }
        const cx = (el.x || 0) + (el.w || 0) / 2;
        if (cx < col.sl - 5 || cx > col.sl + col.sw + 5) return;
        if (el.type === "drawers") { breaks.push({ y: el.y }); breaks.push({ y: el.y + (el.h || 450) }); }
        if (el.type === "rod") breaks.push({ y: el.y });
      });
      breaks.push({ y: iH });
      const sorted = [...new Set(breaks.map(b => b.y))].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) {
        const h = sorted[i + 1] - sorted[i];
        if (h > 25) hSegments.push({ x: col.sl, y: sorted[i], h, topY: sorted[i], si: ci, xRight: col.sl + col.sw });
      }
    });

    // Дедупликация: соседние колонки с ОДИНАКОВЫМ topY и h объединяем в один.
    // Показываем размер только в самой левой колонке группы.
    const used = new Array(hSegments.length).fill(false);
    for (let i = 0; i < hSegments.length; i++) {
      if (used[i]) continue;
      const seg = hSegments[i];
      // Проверяем — есть ли соседняя справа колонка с тем же topY и h?
      // Если ДА И между ними нет стойки (т.е. они смежные через полку или нет преграды) —
      // это значит одинаковый интервал по высоте, дубль.
      // Помечаем все такие как used (кроме первого).
      for (let j = 0; j < hSegments.length; j++) {
        if (i === j || used[j]) continue;
        const other = hSegments[j];
        if (other.topY === seg.topY && other.h === seg.h && other.x !== seg.x) {
          // Тот же интервал высоты в другой колонке — это дубль
          used[j] = true;
        }
      }
      res.push({ t: "h", x: seg.x, y: seg.y, h: seg.h, si: seg.si, topY: seg.topY });
    }
    return res;
  }, [elements, topLevelCols, iH, iW]);

  const getDimDir = (i) => dimDirOverrides[i] || (dims[i]?.t === "w" ? "left" : "top");
  const toggleDimDir = useCallback((i) => { setDimDirOverrides(p => ({ ...p, [i]: getDimDir(i) === "left" || getDimDir(i) === "top" ? (dims[i].t === "w" ? "right" : "bottom") : (dims[i].t === "w" ? "left" : "top") })); }, [dims, dimDirOverrides]);

  const changeHorizDim = useCallback((d, v, dir) => {
    const studs = elements.filter(e => e.type === "stud").sort((a, b) => a.x - b.x);
    if (topLevelCols.length <= 1) { setCorpus(c => ({ ...c, width: Math.max(300, Math.min(3000, v + 2 * t)) })); return; }
    // Попытка двигать согласно dir. Если на выбранной стороне нет стойки — fallback на другую.
    const tryRight = () => {
      if (d.si >= studs.length) return false; // справа стена
      const st = studs[d.si];
      const nx = topLevelCols[d.si].sl + v;
      if (nx >= MIN_S && nx <= iW - MIN_S) { updateEl(st.id, { x: nx }); return true; }
      return false;
    };
    const tryLeft = () => {
      if (d.si <= 0) return false; // слева стена
      const st = studs[d.si - 1];
      const nx = topLevelCols[d.si].sl + topLevelCols[d.si].sw - v;
      if (nx >= MIN_S && nx <= iW - MIN_S) { updateEl(st.id, { x: nx }); return true; }
      return false;
    };
    let moved = false;
    if (dir === "left") { moved = tryRight() || tryLeft(); }
    else { moved = tryLeft() || tryRight(); }
    // Если обе стороны ячейки — стены корпуса (первая и последняя в одно время, т.е. в шкафу нет стоек)
    // — расширяем сам корпус. Это краевой случай (topLevelCols.length === 1 уже обработан выше).
    if (!moved && d.si === 0 && d.si === studs.length) {
      setCorpus(c => ({ ...c, width: Math.max(300, Math.min(3000, v + 2 * t)) }));
    }
  }, [topLevelCols, elements, t, iW, updateEl]);

  const changeVertDim = useCallback((d, v, dir) => {
    const col = topLevelCols[d.si]; if (!col) return;
    const secEls = elements.filter(e => e.type !== "stud" && e.type !== "door").filter(e => {
      if (e.type === "shelf") return true;
      const cx = (e.x || 0) + (e.w || 0) / 2; return cx >= col.sl - 5 && cx <= col.sl + col.sw + 5;
    }).sort((a, b) => (a.y || 0) - (b.y || 0));
    const gT = d.topY, gB = d.topY + d.h;
    // Try the requested direction first, then fall back to the other
    const tryTop = () => {
      const tgt = secEls.find(e => Math.abs((e.y || 0) - gB) < 8);
      if (tgt) { updateEl(tgt.id, { y: Math.max(0, Math.min(iH, gT + v)) }); return true; }
      return false;
    };
    const tryBottom = () => {
      const tgt = secEls.find(e => Math.abs((e.y || 0) - gT) < 8 && gT > 5);
      if (tgt) { updateEl(tgt.id, { y: Math.max(0, Math.min(iH, gB - v)) }); return true; }
      return false;
    };
    if (dir === "top") { if (!tryTop()) tryBottom(); }
    else { if (!tryBottom()) tryTop(); }
  }, [topLevelCols, elements, iH, updateEl]);

  const svgW = corpus.width * SC + 120, svgH = corpus.height * SC + 60;

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

  // Для мобильного: масштабируем canvas через CSS transform, чтобы влез в экран
  // baseFit — автоматический фит под ширину экрана, userZoom — пинч-зум от пользователя
  const mobileCanvasFit = useMemo(() => {
    if (!isMobile) return 1;
    if (typeof window === 'undefined') return 1;
    const availW = window.innerWidth - 16;
    return svgW > availW ? availW / svgW : 1;
  }, [isMobile, svgW]);
  const mobileCanvasScale = mobileCanvasFit * userZoom;

  // ── Pinch-zoom на 2D-канвасе мобильного ─────────────
  const onCanvasTouchStart = useCallback((e: any) => {
    if (e.touches && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = {
        startDist: Math.sqrt(dx * dx + dy * dy),
        startZoom: userZoom,
      };
      // Отменяем drag если был активен
      setDrag(null);
    }
  }, [userZoom]);

  const onCanvasTouchMove = useCallback((e: any) => {
    if (e.touches && e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / pinchRef.current.startDist;
      const newZoom = Math.max(0.5, Math.min(3, pinchRef.current.startZoom * ratio));
      setUserZoom(newZoom);
    }
  }, []);

  const onCanvasTouchEnd = useCallback((e: any) => {
    if (!e.touches || e.touches.length < 2) {
      pinchRef.current = null;
    }
  }, []);

  // Двойной тап по канвасу — сброс зума к 1
  const lastTapRef = useRef<number>(0);
  const onCanvasDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      setUserZoom(1);
      try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
    }
    lastTapRef.current = now;
  }, []);

  const canvas = (
<svg ref={svgRef} width={svgW} height={svgH} viewBox={`-50 -16 ${corpus.width * SC + 120} ${corpus.height * SC + 60}`} style={{ cursor: placeMode ? "crosshair" : "default", filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5))" }} onClick={onSvgClick}>
  <defs>
    <pattern id="g" width={100 * SC} height={100 * SC} patternUnits="userSpaceOnUse"><path d={`M ${100 * SC} 0 L 0 0 0 ${100 * SC}`} fill="none" stroke="#161720" strokeWidth={0.5} /></pattern>
  </defs>
  {/* ═══ FRAME / CORPUS ═══ */}
  {(() => {
    const cHex = corpusTexInfo.hex || "#8b7355";
    const cStroke = "#4a3f35";
    const tPx = t * SC;
    const wPx = corpus.width * SC;
    const hPx = corpus.height * SC;
    const gap = 0.3;

    if (!showCorpus) {
      // Empty frame — dashed boundary, full area usable
      return <>
        <rect x={0} y={0} width={wPx} height={hPx} fill="url(#g)" />
        <rect x={0} y={0} width={wPx} height={hPx} fill="none"
          stroke="#4a3f35" strokeWidth={1} strokeDasharray="6 3" />
        {/* Corner marks */}
        {[[0,0],[wPx,0],[0,hPx],[wPx,hPx]].map(([cx,cy], i) => (
          <g key={`c${i}`}>
            <line x1={cx - (cx > 0 ? 8 : -8)} y1={cy} x2={cx} y2={cy} stroke="#d97706" strokeWidth={0.8} />
            <line x1={cx} y1={cy - (cy > 0 ? 8 : -8)} x2={cx} y2={cy} stroke="#d97706" strokeWidth={0.8} />
          </g>
        ))}
      </>;
    }

    return <>
      {/* Inner background */}
      <rect x={tPx} y={tPx} width={wPx - 2 * tPx} height={hPx - 2 * tPx} fill="url(#g)" />
      {/* ДВП back panel — thin line inset */}
      <rect x={tPx + 1} y={tPx + 1} width={wPx - 2 * tPx - 2} height={hPx - 2 * tPx - 2} fill="none" stroke="rgba(58,53,48,0.25)" strokeWidth={0.5} strokeDasharray="3 2" />
      {/* Left side — full height */}
      <rect x={0} y={0} width={tPx} height={hPx} fill={cHex} stroke={cStroke} strokeWidth={0.6} />
      {/* Right side — full height */}
      <rect x={wPx - tPx} y={0} width={tPx} height={hPx} fill={cHex} stroke={cStroke} strokeWidth={0.6} />
      {/* Top — between sides */}
      <rect x={tPx + gap} y={0} width={wPx - 2 * tPx - 2 * gap} height={tPx} fill={cHex} stroke={cStroke} strokeWidth={0.6} />
      {/* Bottom — between sides */}
      <rect x={tPx + gap} y={hPx - tPx} width={wPx - 2 * tPx - 2 * gap} height={tPx} fill={cHex} stroke={cStroke} strokeWidth={0.6} />
      {/* Joint lines */}
      <line x1={tPx} y1={tPx} x2={tPx + 6} y2={tPx} stroke="rgba(0,0,0,0.3)" strokeWidth={0.4} />
      <line x1={wPx - tPx} y1={tPx} x2={wPx - tPx - 6} y2={tPx} stroke="rgba(0,0,0,0.3)" strokeWidth={0.4} />
      <line x1={tPx} y1={hPx - tPx} x2={tPx + 6} y2={hPx - tPx} stroke="rgba(0,0,0,0.3)" strokeWidth={0.4} />
      <line x1={wPx - tPx} y1={hPx - tPx} x2={wPx - tPx - 6} y2={hPx - tPx} stroke="rgba(0,0,0,0.3)" strokeWidth={0.4} />
      {/* Edge banding */}
      <line x1={0.3} y1={0} x2={0.3} y2={hPx} stroke="rgba(255,255,255,0.08)" strokeWidth={0.3} />
      <line x1={wPx - 0.3} y1={0} x2={wPx - 0.3} y2={hPx} stroke="rgba(255,255,255,0.08)" strokeWidth={0.3} />
      <line x1={tPx + gap} y1={0.3} x2={wPx - tPx - gap} y2={0.3} stroke="rgba(255,255,255,0.08)" strokeWidth={0.3} />
      <line x1={tPx + gap} y1={hPx - 0.3} x2={wPx - tPx - gap} y2={hPx - 0.3} stroke="rgba(255,255,255,0.08)" strokeWidth={0.3} />
    </>;
  })()}

  {/* Zone highlights */}
  {zones.map((z, i) => {
    const zoneMode = !!placeMode;
    const isOccupied = zoneMode && (
      (placeMode === "drawers" && elements.some(e => e.type === "drawers" && e.zoneId === z.id))
    );
    return <rect key={`z${i}`} x={(z.sl + frameT) * SC} y={(z.top + frameT) * SC} width={z.sw * SC} height={(z.bot - z.top) * SC}
      fill={zoneMode ? (isOccupied ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)") : "rgba(25,23,20,0.3)"}
      stroke={zoneMode ? (isOccupied ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)") : "rgba(217,119,6,0.06)"}
      strokeWidth={zoneMode ? 1 : 0.5} strokeDasharray={zoneMode ? "4 2" : "2 2"}
      style={zoneMode && !isOccupied ? { cursor: "pointer" } : {}} />;
  })}

  {elements.map(el => {
    const sel = el.id === selId;
    const inDragMode = isMobile && mobileDragMode === el.id;
    const sx = ((el.x || 0) + frameT) * SC, sy = ((el.y || 0) + frameT) * SC;
    const noPointer = !!placeMode; // disable element interactions during door boundary picking

    if (el.type === "shelf") {
      const shW = (el.w || iW) * SC;
      const shH = t * SC; // full ЛДСП thickness
      const shX = sx;
      // Smart Y positioning: at top edge (y≈0) → below line, at bottom edge (y≈iH) → above line, else centered
      const elY = el.y || 0;
      let shY;
      if (elY < 5) shY = sy; // top — panel goes down from y=0
      else if (elY > iH - 5) shY = sy - shH; // bottom — panel goes up from y=iH
      else shY = sy - shH / 2; // middle — centered on line
      const cHex = corpusTexInfo.hex || "#8b7355";
      const jointGap = 0.3;
      return <g key={el.id} data-element="1" onMouseDown={noPointer ? undefined : e => onDown(e, el)} onTouchStart={noPointer ? undefined : e => onDown(e, el)} style={{ cursor: noPointer ? "default" : "ns-resize", pointerEvents: noPointer ? "none" : "auto" }}>
        {/* Invisible hit target — расширяем зону клика до 16px для удобства попадания на тонкую полку */}
        <rect x={shX} y={shY - 8 + shH / 2} width={shW} height={16} fill="transparent" />
        {/* Shelf ЛДСП panel */}
        <rect x={shX + jointGap} y={shY} width={shW - 2 * jointGap} height={shH} fill={sel ? "#3b82f6" : cHex} stroke={sel ? "#60a5fa" : "#6b5a45"} strokeWidth={sel ? 1.2 : 0.5} />
        {/* Front edge banding */}
        <line x1={shX + jointGap} y1={shY} x2={shX + shW - jointGap} y2={shY} stroke={sel ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.08)"} strokeWidth={0.4} />
        {/* Joint marks at left/right abutment */}
        <line x1={shX + 0.5} y1={shY} x2={shX + 0.5} y2={shY + shH} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />
        <line x1={shX + shW - 0.5} y1={shY} x2={shX + shW - 0.5} y2={shY + shH} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />
      </g>;
    }

    if (el.type === "stud") {
      const cHex = corpusTexInfo.hex || "#8b7355";
      const studLeft = ((el.x || 0) + frameT) * SC;
      const studW = t * SC;
      const pTopPx = ((el.pTop || 0) + frameT) * SC, pBotPx = ((el.pBot || iH) + frameT) * SC;
      const pH = pBotPx - pTopPx;
      const jointGap = 0.3;
      return <g key={el.id} data-element="1" onMouseDown={e => onDown(e, el)} onTouchStart={e => onDown(e, el)} style={{ cursor: "ew-resize" }}>
        {/* Invisible hit target — расширяем зону клика до 16px */}
        <rect x={studLeft - 8 + studW / 2} y={pTopPx} width={16} height={pH} fill="transparent" />
        {/* Stud ЛДСП panel — between bounding shelves */}
        <rect x={studLeft} y={pTopPx + jointGap} width={studW} height={pH - 2 * jointGap} fill={sel ? "#3b82f6" : cHex} stroke={sel ? "#60a5fa" : "#5a4d3f"} strokeWidth={sel ? 1.2 : 0.5} />
        {/* Front edge banding */}
        <line x1={studLeft} y1={pTopPx + jointGap} x2={studLeft} y2={pBotPx - jointGap} stroke={sel ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.08)"} strokeWidth={0.4} />
        {/* Top joint — where stud meets shelf/top panel */}
        <line x1={studLeft - 2} y1={pTopPx + jointGap} x2={studLeft + studW + 2} y2={pTopPx + jointGap} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />
        {/* Bottom joint */}
        <line x1={studLeft - 2} y1={pBotPx - jointGap} x2={studLeft + studW + 2} y2={pBotPx - jointGap} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />
        {/* Конфирмат marks at top and bottom */}
        <circle cx={studLeft + studW / 2} cy={pTopPx + jointGap + 3} r={0.8} fill="rgba(0,0,0,0.2)" />
        <circle cx={studLeft + studW / 2} cy={pBotPx - jointGap - 3} r={0.8} fill="rgba(0,0,0,0.2)" />
      </g>;
    }

    if (el.type === "drawers") {
      const cnt = el.count || 3, heights = el.drawerHeights || Array(cnt).fill(Math.floor((el.h || 450) / cnt));
      const gc = (el.guideType || "roller") === "tandem" ? "#f59e0b" : (el.guideType || "roller") === "ball" ? "#60a5fa" : "#22c55e";
      const fHex = facadeTexInfo.hex || "#f2efe8";
      const elW = (el.w || 100) * SC;
      let accY = 0;
      const facadeGap = 2 * SC; // 2mm gap between facade panels
      return <g key={el.id} data-element="1" onMouseDown={e => onDown(e, el)} onTouchStart={e => onDown(e, el)} style={{ cursor: "move" }}>
        {Array.from({ length: cnt }, (_, i) => {
          const dH = (heights[i] || 150) * SC;
          const dy = sy + accY * SC;
          accY += heights[i] || 150;
          const facH = dH - facadeGap;
          return <g key={i}>
            {/* Drawer box outline (inner) */}
            <rect x={sx + 4} y={dy + facadeGap / 2 + 2} width={elW - 8} height={facH - 4}
              fill="none" stroke={sel ? `${gc}33` : "rgba(70,60,45,0.15)"} strokeWidth={0.4} strokeDasharray="2 1" />
            {/* Facade ЛДСП panel — 1px cosmetic gap */}
            <rect x={sx + 1} y={dy + facadeGap / 2} width={elW - 2} height={facH}
              fill={sel ? `${gc}18` : fHex} fillOpacity={0.85}
              stroke={sel ? gc : "#8a7a6a"} strokeWidth={sel ? 1.2 : 0.5} />
            {/* Edge banding on facade — top */}
            <line x1={sx + 1} y1={dy + facadeGap / 2 + 0.3} x2={sx + elW - 1} y2={dy + facadeGap / 2 + 0.3}
              stroke="rgba(255,255,255,0.06)" strokeWidth={0.3} />
            {/* Handle */}
            <rect x={sx + elW / 2 - 10} y={dy + facadeGap / 2 + facH / 2 - 1} width={20} height={2.5}
              fill={sel ? gc : "#777"} rx={1} />
            {/* Height label */}
            <text x={sx + elW - 8} y={dy + facadeGap / 2 + facH / 2 + 3} textAnchor="end" fontSize={6}
              fill={sel ? gc : "#444"} fontFamily="'IBM Plex Mono',monospace">{heights[i] || 150}</text>
          </g>;
        })}
      </g>;
    }

    if (el.type === "rod") return <g key={el.id} data-element="1" onMouseDown={e => onDown(e, el)} onTouchStart={e => onDown(e, el)} style={{ cursor: "move" }}>
      <line x1={sx} y1={sy} x2={sx + (el.w || 100) * SC} y2={sy} stroke={sel ? "#a855f7" : "#777"} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={sx} cy={sy} r={3} fill={sel ? "#a855f7" : "#555"} /><circle cx={sx + (el.w || 100) * SC} cy={sy} r={3} fill={sel ? "#a855f7" : "#555"} />
    </g>;

    if (el.type === "door" && showDoors) {
      const dw = (el.w || 100) * SC, dh = (el.h || iH) * SC, isL = el.hingeSide === "left";
      const hn = (el.h || 600) > 1800 ? 4 : (el.h || 600) > 1200 ? 3 : 2;
      const hps = Array.from({ length: hn }, (_, i) => i === 0 ? 0.08 : i === hn - 1 ? 0.92 : i / (hn - 1));
      const fHex = facadeTexInfo.hex;
      const isDark = parseInt(fHex.replace('#',''), 16) < 0x666666;
      // На мобильном ручки видны шире (14px) + невидимый hit-target 44px для удобства пальца
      const HANDLE = isMobile ? 14 : 6;
      const HIT = isMobile ? 44 : 10;
      const LEN = isMobile ? 48 : 24;
      return <g key={el.id} data-element="1" onMouseDown={e => onDown(e, el)} onTouchStart={e => onDown(e, el)} style={{ cursor: "pointer" }}>
        <rect x={sx} y={sy} width={dw} height={dh} fill={fHex} fillOpacity={0.85} stroke={sel ? "#fbbf24" : isDark ? "#5a4a3a" : "#bbb"} strokeWidth={sel ? 1.5 : 0.7} rx={1} />
        <circle cx={isL ? sx + dw - 8 : sx + 8} cy={sy + dh / 2} r={2.5} fill={isDark ? "#aaa" : "#555"} />
        {hps.map((p, hi) => <rect key={hi} x={isL ? sx - 1 : sx + dw - 3} y={sy + dh * p - 4} width={4} height={8} rx={1} fill={isDark ? "#888" : "#555"} />)}
        <text x={sx + dw / 2} y={sy + dh / 2 + 3} textAnchor="middle" fontSize={7} fill={isDark ? "#ccc" : "#555"} fontFamily="'IBM Plex Mono',monospace" opacity={0.6}>{facadeTexInfo.name}</text>
        {sel && <>
          {/* Видимые оранжевые ручки (без pointer events — hit-zones в overlay в конце SVG) */}
          {/* TOP */}
          <rect x={sx + dw / 2 - LEN / 2} y={sy - HANDLE / 2} width={LEN} height={HANDLE} rx={2} fill="#d97706" opacity={0.9} style={{ pointerEvents: "none" }} />
          {/* BOTTOM */}
          <rect x={sx + dw / 2 - LEN / 2} y={sy + dh - HANDLE / 2} width={LEN} height={HANDLE} rx={2} fill="#d97706" opacity={0.9} style={{ pointerEvents: "none" }} />
          {/* LEFT */}
          <rect x={sx - HANDLE / 2} y={sy + dh / 2 - LEN / 2} width={HANDLE} height={LEN} rx={2} fill="#d97706" opacity={0.9} style={{ pointerEvents: "none" }} />
          {/* RIGHT */}
          <rect x={sx + dw - HANDLE / 2} y={sy + dh / 2 - LEN / 2} width={HANDLE} height={LEN} rx={2} fill="#d97706" opacity={0.9} style={{ pointerEvents: "none" }} />

          {/* Width dim lines — below door (inputs rendered in overlay at end of SVG) */}
          <line x1={sx + 1} y1={sy + dh + 6} x2={sx + dw - 1} y2={sy + dh + 6} stroke="rgba(217,119,6,0.4)" strokeWidth={0.5} style={{ pointerEvents: "none" }} />
          <line x1={sx} y1={sy + dh + 3} x2={sx} y2={sy + dh + 9} stroke="rgba(217,119,6,0.4)" strokeWidth={0.4} style={{ pointerEvents: "none" }} />
          <line x1={sx + dw} y1={sy + dh + 3} x2={sx + dw} y2={sy + dh + 9} stroke="rgba(217,119,6,0.4)" strokeWidth={0.4} style={{ pointerEvents: "none" }} />

          {/* Height dim lines — left of door (inputs rendered in overlay at end of SVG) */}
          <line x1={sx - 6} y1={sy + 1} x2={sx - 6} y2={sy + dh - 1} stroke="rgba(96,165,250,0.4)" strokeWidth={0.5} style={{ pointerEvents: "none" }} />
          <line x1={sx - 9} y1={sy} x2={sx - 3} y2={sy} stroke="rgba(96,165,250,0.4)" strokeWidth={0.4} style={{ pointerEvents: "none" }} />
          <line x1={sx - 9} y1={sy + dh} x2={sx - 3} y2={sy + dh} stroke="rgba(96,165,250,0.4)" strokeWidth={0.4} style={{ pointerEvents: "none" }} />
        </>}
      </g>;
    }
    return null;
  })}

  {/* DIMS */}
  {dims.map((d, i) => {
    const dir = getDimDir(i);
    if (d.t === "w") { const dx = (d.x + frameT) * SC, dy = (iH + frameT) * SC + 16, dw = d.w * SC; return <g key={`w${i}`}>
      <line x1={dx + 1} y1={dy} x2={dx + dw - 1} y2={dy} stroke="rgba(217,119,6,0.3)" strokeWidth={0.6} />
      <line x1={dx} y1={dy - 3} x2={dx} y2={dy + 3} stroke="rgba(217,119,6,0.3)" strokeWidth={0.4} />
      <line x1={dx + dw} y1={dy - 3} x2={dx + dw} y2={dy + 3} stroke="rgba(217,119,6,0.3)" strokeWidth={0.4} />
      <SvgInput x={dx + dw / 2} y={dy + 12} width={dw} value={Math.round(d.w)} color="#b87a20" fontSize={9} onChange={v => changeHorizDim(d, v, dir)} />
    </g>; }
    if (d.t === "h") { const dx = (d.x + frameT) * SC - 22, dy1 = (d.y + frameT) * SC, dy2 = (d.y + d.h + frameT) * SC, mid = (dy1 + dy2) / 2; return <g key={`h${i}`}>
      <line x1={dx} y1={dy1 + 1} x2={dx} y2={dy2 - 1} stroke="rgba(96,165,250,0.3)" strokeWidth={0.6} />
      <line x1={dx - 3} y1={dy1} x2={dx + 3} y2={dy1} stroke="rgba(96,165,250,0.3)" strokeWidth={0.4} />
      <line x1={dx - 3} y1={dy2} x2={dx + 3} y2={dy2} stroke="rgba(96,165,250,0.3)" strokeWidth={0.4} />
      <SvgInput x={dx - 3} y={mid + 3} width={40} value={Math.round(d.h)} color="#5a8fd4" fontSize={8} onChange={v => changeVertDim(d, v, dir)} />
    </g>; }
    return null;
  })}
  <SvgInput x={corpus.width * SC / 2} y={corpus.height * SC + 38} width={60} value={corpus.width} color="#777" fontSize={10} onChange={v => setCorpus(c => ({ ...c, width: Math.max(300, Math.min(3000, v)) }))} />
  <text x={corpus.width * SC / 2 - 32} y={corpus.height * SC + 38} textAnchor="middle" fontSize={8} fill="#444">←</text>
  <text x={corpus.width * SC / 2 + 32} y={corpus.height * SC + 38} textAnchor="middle" fontSize={8} fill="#444">→</text>
  <SvgInput x={-32} y={corpus.height * SC / 2 + 3} width={40} value={corpus.height} color="#777" fontSize={10} onChange={v => setCorpus(c => ({ ...c, height: Math.max(400, Math.min(2700, v)) }))} />

  {/* ═══ SELECTED ELEMENT EDITABLE DIMS OVERLAY ═══
      Когда выделена стойка/полка — рисуем редактируемые размеры до соседей с правильной логикой:
      пользователь меняет размер ОТРЕЗКА — выделенный элемент двигается в эту сторону на разницу. */}
  {(() => {
    const selEl = elements.find(e => e.id === selId);
    if (!selEl) return null;

    if (selEl.type === "stud") {
      // Найти ближайших соседей слева и справа
      const others = elements.filter(e => e.type === "stud" && e.id !== selEl.id).sort((a, b) => a.x - b.x);
      let leftNeighborRight = 0; // правый край соседа слева (или 0 = стенка)
      let rightNeighborLeft = iW; // левый край соседа справа (или iW = стенка)
      for (const s of others) {
        if (s.x + t <= selEl.x && s.x + t > leftNeighborRight) leftNeighborRight = s.x + t;
        if (s.x >= selEl.x + t && s.x < rightNeighborLeft) rightNeighborLeft = s.x;
      }
      const distLeft = Math.round(selEl.x - leftNeighborRight);
      const distRight = Math.round(rightNeighborLeft - (selEl.x + t));

      // Координаты на канвасе
      const studCenterX = (selEl.x + t / 2 + frameT) * SC;
      const studTopY = ((selEl.pTop || 0) + frameT) * SC;
      const leftMidX = (leftNeighborRight + (selEl.x - leftNeighborRight) / 2 + frameT) * SC;
      const rightMidX = ((selEl.x + t) + (rightNeighborLeft - selEl.x - t) / 2 + frameT) * SC;
      // Y для размеров — выше верха стойки (или над шкафом)
      const dimY = Math.max(studTopY - 18, 14);

      return <>
        {/* Подсветка выделенной стойки */}
        <rect
          x={studCenterX - 8} y={studTopY - 4}
          width={16} height={4}
          fill="#3b82f6" opacity={0.6} rx={1}
          style={{ pointerEvents: "none" }}
        />
        {/* Левый размер (редактируемый) */}
        <line x1={(leftNeighborRight + frameT) * SC + 1} y1={dimY + 4}
              x2={studCenterX - 1} y2={dimY + 4}
              stroke="rgba(96,165,250,0.55)" strokeWidth={0.8} style={{ pointerEvents: "none" }} />
        <line x1={(leftNeighborRight + frameT) * SC} y1={dimY + 1}
              x2={(leftNeighborRight + frameT) * SC} y2={dimY + 7}
              stroke="rgba(96,165,250,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <line x1={studCenterX} y1={dimY + 1} x2={studCenterX} y2={dimY + 7}
              stroke="rgba(96,165,250,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <SvgInput
          x={leftMidX} y={dimY} width={50} fontSize={11}
          value={distLeft} color="#3b82f6"
          onChange={v => {
            // Меняем отрезок СЛЕВА от стойки — двигаем стойку в сторону этого отрезка
            // (если увеличили — стойка двигается ВПРАВО на разницу)
            const nx = Math.max(0, Math.min(iW - t, leftNeighborRight + v));
            updateEl(selEl.id, { x: nx });
          }}
        />
        {/* Правый размер */}
        <line x1={studCenterX + 1} y1={dimY + 4}
              x2={(rightNeighborLeft + frameT) * SC - 1} y2={dimY + 4}
              stroke="rgba(96,165,250,0.55)" strokeWidth={0.8} style={{ pointerEvents: "none" }} />
        <line x1={(rightNeighborLeft + frameT) * SC} y1={dimY + 1}
              x2={(rightNeighborLeft + frameT) * SC} y2={dimY + 7}
              stroke="rgba(96,165,250,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <SvgInput
          x={rightMidX} y={dimY} width={50} fontSize={11}
          value={distRight} color="#3b82f6"
          onChange={v => {
            // Меняем отрезок СПРАВА от стойки — двигаем стойку в сторону этого отрезка
            // (если увеличили — стойка двигается ВЛЕВО на разницу)
            const nx = Math.max(0, Math.min(iW - t, rightNeighborLeft - v - t));
            updateEl(selEl.id, { x: nx });
          }}
        />
      </>;
    }

    if (selEl.type === "shelf") {
      const myLeft = selEl.x || 0, myRight = myLeft + (selEl.w || iW);
      // Соседние полки с перекрытием по X
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

      const shelfY = ((selEl.y || 0) + frameT) * SC;
      const shelfLeftX = (myLeft + frameT) * SC;
      const topMidY = (topNeighborY + ((selEl.y || 0) - topNeighborY) / 2 + frameT) * SC;
      const botMidY = ((selEl.y || 0) + (botNeighborY - (selEl.y || 0)) / 2 + frameT) * SC;
      // X для размеров — левее левого края полки
      const dimX = Math.max(shelfLeftX - 28, 14);

      return <>
        {/* Подсветка выделенной полки */}
        <rect
          x={shelfLeftX - 4} y={shelfY - 2}
          width={4} height={4}
          fill="#d97706" opacity={0.6} rx={1}
          style={{ pointerEvents: "none" }}
        />
        {/* Верхний размер */}
        <line x1={dimX + 4} y1={(topNeighborY + frameT) * SC + 1}
              x2={dimX + 4} y2={shelfY - 1}
              stroke="rgba(217,119,6,0.55)" strokeWidth={0.8} style={{ pointerEvents: "none" }} />
        <line x1={dimX + 1} y1={(topNeighborY + frameT) * SC}
              x2={dimX + 7} y2={(topNeighborY + frameT) * SC}
              stroke="rgba(217,119,6,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <line x1={dimX + 1} y1={shelfY} x2={dimX + 7} y2={shelfY}
              stroke="rgba(217,119,6,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <SvgInput
          x={dimX + 4} y={topMidY + 4} width={42} fontSize={10}
          value={distTop} color="#d97706"
          onChange={v => {
            // Меняем отрезок СВЕРХУ полки — полка двигается в сторону этого отрезка
            // (увеличили — полка идёт ВНИЗ; уменьшили — полка идёт ВВЕРХ)
            const ny = Math.max(0, Math.min(iH, topNeighborY + v));
            updateEl(selEl.id, { y: ny });
          }}
        />
        {/* Нижний размер */}
        <line x1={dimX + 4} y1={shelfY + 1}
              x2={dimX + 4} y2={(botNeighborY + frameT) * SC - 1}
              stroke="rgba(217,119,6,0.55)" strokeWidth={0.8} style={{ pointerEvents: "none" }} />
        <line x1={dimX + 1} y1={(botNeighborY + frameT) * SC}
              x2={dimX + 7} y2={(botNeighborY + frameT) * SC}
              stroke="rgba(217,119,6,0.55)" strokeWidth={0.6} style={{ pointerEvents: "none" }} />
        <SvgInput
          x={dimX + 4} y={botMidY + 4} width={42} fontSize={10}
          value={distBot} color="#d97706"
          onChange={v => {
            const ny = Math.max(0, Math.min(iH, botNeighborY - v));
            updateEl(selEl.id, { y: ny });
          }}
        />
      </>;
    }

    return null;
  })()}

  {/* ═══ DOOR RESIZE HIT-ZONES OVERLAY ═══
      Рендерится в самом конце SVG чтобы быть ПОВЕРХ всех DIMS и прочих элементов.
      Иначе hit-зоны TOP/BOTTOM/LEFT перекрывались линиями размеров и не ловили тапы. */}
  {(() => {
    const selDoor = elements.find(e => e.id === selId && e.type === "door" && showDoors);
    if (!selDoor) return null;
    const dsx = ((selDoor.x || 0) + frameT) * SC;
    const dsy = ((selDoor.y || 0) + frameT) * SC;
    const ddw = (selDoor.w || 100) * SC;
    const ddh = (selDoor.h || iH) * SC;
    const HIT = isMobile ? 44 : 10;
    return <>
      {/* TOP */}
      <rect x={dsx + ddw / 2 - HIT} y={dsy - HIT / 2} width={HIT * 2} height={HIT} fill="transparent" style={{ cursor: "ns-resize" }}
        onMouseDown={e => onDoorEdgeDrag(e, selDoor, "top")} onTouchStart={e => onDoorEdgeDrag(e, selDoor, "top")} />
      {/* BOTTOM */}
      <rect x={dsx + ddw / 2 - HIT} y={dsy + ddh - HIT / 2} width={HIT * 2} height={HIT} fill="transparent" style={{ cursor: "ns-resize" }}
        onMouseDown={e => onDoorEdgeDrag(e, selDoor, "bottom")} onTouchStart={e => onDoorEdgeDrag(e, selDoor, "bottom")} />
      {/* LEFT */}
      <rect x={dsx - HIT / 2} y={dsy + ddh / 2 - HIT} width={HIT} height={HIT * 2} fill="transparent" style={{ cursor: "ew-resize" }}
        onMouseDown={e => onDoorEdgeDrag(e, selDoor, "left")} onTouchStart={e => onDoorEdgeDrag(e, selDoor, "left")} />
      {/* RIGHT */}
      <rect x={dsx + ddw - HIT / 2} y={dsy + ddh / 2 - HIT} width={HIT} height={HIT * 2} fill="transparent" style={{ cursor: "ew-resize" }}
        onMouseDown={e => onDoorEdgeDrag(e, selDoor, "right")} onTouchStart={e => onDoorEdgeDrag(e, selDoor, "right")} />
      {/* Width input — ВНУТРИ двери, у нижнего края по центру */}
      <SvgInput x={dsx + ddw / 2} y={dsy + ddh - 12} width={50} value={Math.round(selDoor.doorW || selDoor.w)} color="#d97706" fontSize={10}
        onChange={v => {
          const oldX = selDoor.x || 0;
          const oldW = Math.round(selDoor.doorW || selDoor.w);
          let newX = oldX;
          if (selDoor.doorRightIsWall && !selDoor.doorLeftIsWall) {
            newX = oldX + oldW - v;
          } else if (!selDoor.doorLeftIsWall && !selDoor.doorRightIsWall) {
            newX = oldX - (v - oldW) / 2;
          }
          updateEl(selDoor.id, { w: v, doorW: v, x: newX, manualW: v });
        }} />
      {/* Height input — ВНУТРИ двери, у левого края по центру */}
      <SvgInput x={dsx + 18} y={dsy + ddh / 2 + 3} width={36} value={Math.round(selDoor.doorH || selDoor.h)} color="#5a8fd4" fontSize={10}
        onChange={v => {
          const oldY = selDoor.y || 0;
          const oldH = Math.round(selDoor.doorH || selDoor.h);
          let newY = oldY;
          if (selDoor.doorBottomIsWall && !selDoor.doorTopIsWall) {
            newY = oldY + oldH - v;
          } else if (!selDoor.doorTopIsWall && !selDoor.doorBottomIsWall) {
            newY = oldY - (v - oldH) / 2;
          }
          updateEl(selDoor.id, { h: v, doorH: v, y: newY, manualH: v });
        }} />
    </>;
  })()}
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
      style={{ minHeight: "100vh", color: "#e5e7eb", userSelect: "none", background: "#0b0c10", fontFamily: "'IBM Plex Mono',monospace" }}
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
              // Когда активен drag/режим перемещения/pinch — блокируем pan-y (скролл),
              // иначе разрешаем вертикальный скролл всей страницы
              touchAction: (drag || mobileDragMode || pinchRef.current) ? "none" : "pan-y",
            }}>
            <div style={{
              transform: `scale(${mobileCanvasScale})`,
              transformOrigin: "top center",
              width: svgW,
              height: svgH,
              flexShrink: 0,
            }}>
              {canvas}
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
