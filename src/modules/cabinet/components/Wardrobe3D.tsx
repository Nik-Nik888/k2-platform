import { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════
   Wardrobe3D — Realistic ЛДСП construction
   ═══════════════════════════════════════════════════════════════
   Key improvements:
   • Real furniture joint logic: sides full-height, top/bottom between sides
   • Edge banding (кромка) on all visible ЛДСП edges
   • Shelf→stud proper abutment with 0.5mm fitting gap
   • Back panel (ДВП 3mm) in a routed groove (4mm from rear edge)
   • Drawer boxes with realistic panel thickness + bottom panel
   • Correct grain direction via UV mapping per panel orientation
   • Chamfered visible edges for realism
   ═══════════════════════════════════════════════════════════════ */

function loadTex(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    new THREE.TextureLoader().load(src, tex => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      resolve(tex);
    }, undefined, () => resolve(null));
  });
}

/** Метки типов элементов — переиспользуются в indicator postановки и панели свойств */
const PLACE_LABELS = {
  shelf: "Полка", stud: "Стойка", drawers: "Ящики",
  rod: "Штанга", door: "Дверь", panel: "Панель",
};

/* ─── Edge-banded ЛДСП panel ───
   Creates a panel with visible edge banding on specified faces.
   edgeBand: { top, bottom, left, right, front, back } — which edges have кромка (0.4mm PVC/ABS)
   grainDir: "h" | "v" — grain runs horizontally or vertically on the face */
function createLDSPPanel(pw, ph, pd, mat, edgeMat, edgeBand = {}, grainDir = "h") {
  const group = new THREE.Group();
  const EDGE = 0.0004; // 0.4mm edge banding thickness in meters

  // Core ЛДСП body
  const coreW = pw - (edgeBand.left ? EDGE : 0) - (edgeBand.right ? EDGE : 0);
  const coreH = ph - (edgeBand.top ? EDGE : 0) - (edgeBand.bottom ? EDGE : 0);
  const coreD = pd - (edgeBand.front ? EDGE : 0) - (edgeBand.back ? EDGE : 0);

  const coreGeo = new THREE.BoxGeometry(Math.max(coreW, 0.001), Math.max(coreH, 0.001), Math.max(coreD, 0.001));
  const core = new THREE.Mesh(coreGeo, mat);
  const ox = ((edgeBand.left ? EDGE : 0) - (edgeBand.right ? EDGE : 0)) / 2;
  const oy = ((edgeBand.bottom ? EDGE : 0) - (edgeBand.top ? EDGE : 0)) / 2;
  const oz = ((edgeBand.front ? EDGE : 0) - (edgeBand.back ? EDGE : 0)) / 2;
  core.position.set(ox, oy, oz);
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);

  // Edge banding strips
  const addEdge = (ew, eh, ed, ex, ey, ez) => {
    const eg = new THREE.BoxGeometry(ew, eh, ed);
    const em = new THREE.Mesh(eg, edgeMat);
    em.position.set(ex, ey, ez);
    em.castShadow = true;
    em.receiveShadow = true;
    group.add(em);
  };

  // Left edge (YZ plane)
  if (edgeBand.left) addEdge(EDGE, ph, pd, -pw / 2 + EDGE / 2, 0, 0);
  // Right edge
  if (edgeBand.right) addEdge(EDGE, ph, pd, pw / 2 - EDGE / 2, 0, 0);
  // Top edge (XZ plane)
  if (edgeBand.top) addEdge(pw - (edgeBand.left ? EDGE : 0) - (edgeBand.right ? EDGE : 0), EDGE, pd,
    ox, ph / 2 - EDGE / 2, 0);
  // Bottom edge
  if (edgeBand.bottom) addEdge(pw - (edgeBand.left ? EDGE : 0) - (edgeBand.right ? EDGE : 0), EDGE, pd,
    ox, -ph / 2 + EDGE / 2, 0);
  // Front edge (XY plane)
  if (edgeBand.front) {
    const feW = pw - (edgeBand.left ? EDGE : 0) - (edgeBand.right ? EDGE : 0);
    const feH = ph - (edgeBand.top ? EDGE : 0) - (edgeBand.bottom ? EDGE : 0);
    addEdge(feW, feH, EDGE, ox, oy, pd / 2 - EDGE / 2);
  }
  // Back edge
  if (edgeBand.back) {
    const beW = pw - (edgeBand.left ? EDGE : 0) - (edgeBand.right ? EDGE : 0);
    const beH = ph - (edgeBand.top ? EDGE : 0) - (edgeBand.bottom ? EDGE : 0);
    addEdge(beW, beH, EDGE, ox, oy, -pd / 2 + EDGE / 2);
  }

  return group;
}

export default function Wardrobe3D({
  corpus, setCorpus, elements, corpusTexture, facadeTexture,
  showDoors = true, showCorpus = true,
  onClose,
  // Интерактивный режим
  selId = null,             // id выделенного элемента (для outline)
  onElementClick = null,    // callback: (elementId: string | null) => void
  showRoom = true,          // показывать ли комнату (стены+пол)
  // Правая панель свойств (рендерится внутри 3D-overlay)
  selEl = null,             // выделенный элемент (объект из elements)
  updateEl = null,          // (id, upd) => void
  delSel = null,            // () => void
  onDuplicate = null,       // (id) => void — дублировать выделенный элемент со сдвигом
  iW = 0, iH = 0, t = 16,
  isMobile = false,
  // Меню добавления элементов
  onAddElement = null,      // (type: string) => void — нажата кнопка «+ Стойка», «+ Полка» и т.д.
  // Click-to-place в 3D (Сессия 2)
  placeMode = null,         // активный режим постановки: 'shelf'|'stud'|'door'|'panel'|'rod'|'drawers'|null
  setPlaceMode = null,      // (mode: string|null) => void
  findDoorBounds = null,    // (clickX, clickY) => { left, right, top, bottom } — для подсветки зоны
  placeInZone = null,       // (zone, clickX, clickY) => void — постановка элемента
}) {
  const mountRef = useRef(null);
  const stateRef = useRef({});
  // Overlay div для HTML-подписей размеров
  const dimsOverlayRef = useRef(null);
  // Подписи: ref на каждый div, чтобы обновлять позицию в animate-tick
  const dimLabelsRef = useRef({});
  // Ghost-dim labels (2 цифры рядом с жёлтым фантомом при placeMode)
  const ghostDimARef = useRef(null);
  const ghostDimBRef = useRef(null);
  // Edit-dim labels — 2 цифры глубины у ВЫДЕЛЕННОГО элемента (панель insert, штанга)
  const editDimARef = useRef(null);
  const editDimBRef = useRef(null);
  // Камера: сохраняем угол/зум между rebuild сцены, чтобы при добавлении элемента
  // камера не «прыгала» в дефолтное положение.
  const cameraRef = useRef({ rotY: 0.35, rotX: 0.12, zoom: 1 });
  // Показывать ли общие размеры (габариты, между-стоечные/полочные).
  // По умолчанию выключены — включаются по тапу на иконку 📏 в углу.
  const [showDims, setShowDims] = useState(false);
  // FAB open/close state — floating "+" button, fan menu со всеми типами элементов
  const [fabOpen, setFabOpen] = useState(false);
  // На touch: после отпускания пальца в placeMode фантом фиксируется,
  // показывается плашка с кнопкой ОК для подтверждения постановки.
  // Это даёт пользователю шанс тапнуть на жёлтую цифру и ввести точный размер
  // вместо немедленной постановки. Хранит { clickX, clickY } или null.
  const [pendingPlace, setPendingPlace] = useState(null);
  // Drag-n-drop существующего элемента в 3D. Long-press на выделенном элементе
  // активирует режим — элемент прячется, вместо него жёлтый фантом который
  // следует за курсором/пальцем. Отпускание → updateEl с новой позицией.
  // Храним { id, type, origEl } чтобы помнить что таскаем.
  const [drag3d, setDrag3d] = useState(null);
  // Если тапнули на цифру во время drag3d — открывается popup для точного ввода.
  // { side: "A"|"B" } определяет от какой стенки считать. После Enter из popup
  // элемент встаёт на введённое расстояние и drag завершается.
  const [drag3dInput, setDrag3dInput] = useState(null);
  // Какой размер корпуса сейчас редактируется ("width" | "height" | "depth" | null)
  const [corpusEditDim, setCorpusEditDim] = useState(null);

  // ═══ Ghost-dim input state (Этап 1-3: стойка/полка/штанга при постановке) ═══
  // Когда пользователь активирует ввод цифры (Space) — она открывается в МОДАЛЬНОМ POPUP
  // (фиксированная позиция сверху canvas). Сцена замораживается: фантом не двигается
  // пока идёт набор. Пересчёт только при commit (Enter).
  const [lockedDim, setLockedDim] = useState(null);
  const [lockedNiche, setLockedNiche] = useState(null);
  // Снимок размеров A/B в момент активации — показываем их пока не коммитнут
  const [lockedSnapshot, setLockedSnapshot] = useState(null);

  // ═══ Edit-Z state (Этап 5: панель insert / штанга после установки) ═══
  const [editDim, setEditDim] = useState(null);
  const [editSnapshot, setEditSnapshot] = useState(null);

  // Ref для актуальных props placement — handlers внутри Three.js не пересоздаются
  // при изменении props (build пересоздавать дорого), поэтому читаем свежие значения через ref.
  const propsRef = useRef({
    placeMode, setPlaceMode, findDoorBounds, placeInZone,
    iW, iH, t,
    showDims,
    elements,
    lockedDim, lockedNiche, lockedSnapshot,
    editDim, editSnapshot, selEl, selId,
    pendingPlace, drag3d, drag3dInput,
  });
  useEffect(() => {
    propsRef.current = {
      placeMode, setPlaceMode, findDoorBounds, placeInZone, iW, iH, t, showDims, elements,
      lockedDim, lockedNiche, lockedSnapshot,
      editDim, editSnapshot, selEl, selId,
      pendingPlace, drag3d, drag3dInput,
    };
  });

  // Сброс pendingPlace когда открывается popup для точного ввода (тап на цифру).
  // Иначе визуально конфликтовали бы ОК-плашка снизу и popup сверху.
  useEffect(() => {
    if (lockedDim) setPendingPlace(null);
  }, [lockedDim]);

  // Сброс lock-режима когда placeMode изменился
  useEffect(() => {
    setLockedDim(null);
    setLockedNiche(null);
    setLockedSnapshot(null);
    setPendingPlace(null);
  }, [placeMode]);

  // Сброс edit-режима когда сменилось выделение (или снято)
  useEffect(() => {
    setEditDim(null);
    setEditSnapshot(null);
  }, [selEl?.id]);

  // Drag3d: скрываем меши элемента (вместо него показывается жёлтый фантом
  // через zoneHighlight). При завершении drag — снова показываем меши и
  // прячем фантом + цифры.
  useEffect(() => {
    const setVis = stateRef.current.setElementVisibility;
    if (!setVis) return;
    if (drag3d?.id) {
      setVis(drag3d.id, false);
    }
    // На очистку: когда drag3d становится null, показываем меши снова.
    // Но id может уже быть новым если пользователь начал drag другого элемента,
    // поэтому возвращаем видимость именно ТОМУ id из closure.
    const closureId = drag3d?.id;
    return () => {
      if (closureId && stateRef.current.setElementVisibility) {
        stateRef.current.setElementVisibility(closureId, true);
      }
      // Чистим фантом и цифры если уходим из drag3d (id больше не активен)
      if (closureId) {
        stateRef.current.drag3dPending = null;
        stateRef.current.drag3dLabelPositions = null;
        stateRef.current.activeSnap = null;
        const zh = stateRef.current.zoneHighlight;
        if (zh) zh.visible = false;
        if (ghostDimARef.current) ghostDimARef.current.style.display = "none";
        if (ghostDimBRef.current) ghostDimBRef.current.style.display = "none";
      }
    };
  }, [drag3d?.id]);

  // ═══ Клавиатура для click-to-edit ═══
  // Space активирует ввод. Логика взаимодействия теперь через popup-компонент LockInputPopup.
  // Здесь остаётся только открытие popup'а по Space и cycle A → B → A.
  const toggleLockedSide = () => {
    const { lockedDim: lD } = propsRef.current;
    const niche = stateRef.current.lastNiche;
    if (!niche) return;
    // Читаем текущие значения A и B из DOM (ghost-dim badge'ев) — это снимок в момент активации.
    const readSnapshot = () => ({
      A: parseFloat(ghostDimARef.current?.textContent ?? "") || 0,
      B: parseFloat(ghostDimBRef.current?.textContent ?? "") || 0,
    });
    if (lD === null) {
      setLockedNiche(niche);
      setLockedSnapshot(readSnapshot());
      setLockedDim("A");
    } else if (lD === "A") {
      setLockedDim("B");
    } else {
      setLockedDim("A");
    }
  };
  const cancelLocked = () => {
    setLockedDim(null);
    setLockedNiche(null);
    setLockedSnapshot(null);
  };

  // Точный ввод размера во время drag3d. side="A" → расстояние от верха/левой стенки,
  // side="B" → от противоположной. Завершает drag и применяет позицию через updateEl.
  const commitDrag3dInput = (val) => {
    const parsed = parseFloat(val);
    const dd = drag3d;
    const inp = drag3dInput;
    if (!Number.isFinite(parsed) || parsed < 0 || !dd || !inp || !updateEl) {
      setDrag3dInput(null);
      return;
    }
    const orig = dd.origEl || {};
    const upd = {};
    if (dd.type === "stud") {
      // X: A = от левой стенки до левой грани стойки
      const x = inp.side === "A" ? parsed : Math.max(0, iW - parsed - t);
      upd.x = Math.max(0, Math.min(iW - t, x));
    } else if (dd.type === "shelf") {
      // Y: A = от верхней стенки до верхней грани полки → центр = parsed + t/2
      const y = inp.side === "A" ? parsed + t / 2 : Math.max(0, iH - parsed - t / 2);
      upd.y = Math.max(t / 2, Math.min(iH - t / 2, y));
    } else if (dd.type === "rod") {
      const y = inp.side === "A" ? parsed : Math.max(0, iH - parsed);
      upd.y = Math.max(t, Math.min(iH - t, y));
    } else if (dd.type === "drawers") {
      const h = orig.h || 450;
      const y = inp.side === "A" ? parsed : Math.max(0, iH - parsed - h);
      upd.y = Math.max(0, Math.min(iH - h, y));
    } else if (dd.type === "door" || dd.type === "panel") {
      const h = orig.h || 600;
      const y = inp.side === "A" ? parsed : Math.max(0, iH - parsed - h);
      upd.y = Math.max(0, Math.min(iH - h, y));
      if (dd.type === "door") {
        upd.manualW = true;
        upd.manualH = true;
        if (orig.w) upd.w = orig.w;
        if (orig.h) upd.h = orig.h;
      }
    }
    updateEl(dd.id, upd);
    setDrag3dInput(null);
    setDrag3d(null);
  };

  // Коммит drag3d на текущей позиции фантома (когда пользователь нажимает ✓
  // или подтверждает через popup без ввода числа). Применяет drag3dPending
  // (последнюю позицию из moveDraggedElement3D) с учётом авто-подгонки ширины
  // для drawers/insert-panel и manualW/H для door.
  const commitDrag3dPending = useCallback(() => {
    const dd = drag3d;
    const pending = stateRef.current?.drag3dPending;
    if (!dd || !pending || !updateEl) {
      setDrag3d(null);
      return;
    }
    const upd = {};
    if (pending.next.x !== undefined) upd.x = pending.next.x;
    if (pending.next.y !== undefined) upd.y = pending.next.y;
    const orig = dd.origEl || {};
    if (dd.type === "door") {
      upd.manualW = true;
      upd.manualH = true;
      if (orig.w) upd.w = orig.w;
      if (orig.h) upd.h = orig.h;
    }
    // Авто-подгонка ширины: drawers всегда, insert-panel только если был insert
    const isInsertPanel = dd.type === "panel" && orig.panelType === "insert";
    if (dd.type === "drawers" || isInsertPanel) {
      const fdb = findDoorBounds;
      const defaultH = dd.type === "drawers" ? 450 : 600;
      const defaultW = dd.type === "drawers" ? 400 : 400;
      const newX = upd.x ?? orig.x ?? 0;
      const newY = upd.y ?? orig.y ?? 0;
      const cyMm = newY + (orig.h || defaultH) / 2;
      const cxMm = newX + (orig.w || defaultW) / 2;
      if (fdb) {
        const bounds = fdb(cxMm, cyMm);
        if (bounds) {
          const innerLeft = bounds.left.x + (bounds.left.isWall ? 0 : t);
          const innerRight = bounds.right.x;
          const innerW = Math.max(100, innerRight - innerLeft);
          upd.x = innerLeft;
          upd.w = innerW;
        }
      }
    }
    updateEl(pending.id, upd);
    setDrag3d(null);
  }, [drag3d, updateEl, t, findDoorBounds]);

  // Отмена drag3d без коммита — фантом убирается, элемент остаётся на старом месте.
  const cancelDrag3d = useCallback(() => {
    setDrag3d(null);
    setDrag3dInput(null);
  }, []);

  // ═══ Edit-Z controls (Этап 5) ═══
  // Работает для выделенной панели insert или штанги.
  // A = значение спереди (утоплена от передней грани шкафа)
  // B = значение сзади (до задней стенки)
  const editableZ = selEl && (
    (selEl.type === "panel" && selEl.panelType === "insert") ||
    selEl.type === "rod" ||
    selEl.type === "drawers"
  );

  const toggleEditSide = () => {
    if (!editableZ) return;
    const { editDim: eD } = propsRef.current;
    const readSnapshot = () => ({
      A: parseFloat(editDimARef.current?.textContent ?? "") || 0,
      B: parseFloat(editDimBRef.current?.textContent ?? "") || 0,
    });
    if (eD === null) {
      setEditSnapshot(readSnapshot());
      setEditDim("A");
    } else if (eD === "A") {
      setEditDim("B");
    } else {
      setEditDim("A");
    }
  };
  const cancelEdit = () => {
    setEditDim(null);
    setEditSnapshot(null);
  };
  const commitEditZ = (typedValue) => {
    const parsed = parseFloat(typedValue);
    if (!Number.isFinite(parsed) || parsed < 0 || !selEl || !updateEl) {
      cancelEdit();
      return;
    }
    const { depth: D } = corpus;

    // Для ящиков значение в input — это ГЛУБИНА ящика (метабокса), не позиция.
    // Кламп в [200, D - 50] — стандартные глубины ящиков.
    if (selEl.type === "drawers") {
      const newDepth = Math.max(200, Math.min(D - 50, parsed));
      updateEl(selEl.id, { depth: newDepth });
      cancelEdit();
      return;
    }

    // Толщина элемента по Z
    let objT;
    if (selEl.type === "panel") {
      objT = t; // панель = ЛДСП t мм
    } else {
      objT = 25; // штанга — диаметр 25мм
    }
    // A = расстояние от ПЕРЕДНЕЙ грани шкафа до ПЕРЕДНЕЙ грани элемента
    // B = расстояние от ЗАДНЕЙ грани элемента до ЗАДНЕЙ стенки
    // depthOffset = B (от задней стенки до задней грани элемента)
    // z для штанги = центр относительно центра шкафа = -D/2 + B + objT/2
    // Для панели используем depthOffset (через формулу в рендере)
    let newDepthOffset;
    if (editDim === "A") {
      // A = утопление спереди → depthOffset = D - objT - A
      newDepthOffset = D - objT - parsed;
    } else {
      // B = до задней стенки → depthOffset = B
      newDepthOffset = parsed;
    }
    // Кламп в [0, D - objT]
    newDepthOffset = Math.max(0, Math.min(D - objT, newDepthOffset));
    if (selEl.type === "panel") {
      // Для панели используем depthOffset + depth=objT
      updateEl(selEl.id, { depthOffset: newDepthOffset, depth: objT });
    } else if (selEl.type === "rod") {
      // Для штанги z = центр относительно центра шкафа
      // centerZ = -D/2 + newDepthOffset + objT/2
      const newZ = -D / 2 + newDepthOffset + objT / 2;
      updateEl(selEl.id, { z: newZ });
    }
    cancelEdit();
  };

  useEffect(() => {
    // Клавиатура активна только для тех режимов где реализован lock-ввод.
    if (placeMode !== "stud" && placeMode !== "shelf" && placeMode !== "rod") return;
    const onKey = (e) => {
      // Если фокус в input — игнорируем window-keydown, чтобы не конфликтовать
      // с его собственным onKeyDown (он вызовет toggleLockedSide напрямую).
      const isInputFocused = document.activeElement?.tagName === "INPUT";
      if (isInputFocused) return;
      const { lockedDim: lD } = propsRef.current;
      if (e.key === " ") {
        e.preventDefault();
        toggleLockedSide();
      } else if (e.key === "Escape" && lD !== null) {
        e.preventDefault();
        cancelLocked();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placeMode]);

  // Keyboard handler для edit-Z выделенного элемента (панель insert / штанга)
  useEffect(() => {
    if (!editableZ) return;
    if (placeMode) return; // не конфликтуем с placement
    const onKey = (e) => {
      const isInputFocused = document.activeElement?.tagName === "INPUT";
      if (isInputFocused) return;
      const { editDim: eD } = propsRef.current;
      if (e.key === " ") {
        e.preventDefault();
        toggleEditSide();
      } else if (e.key === "Escape" && eD !== null) {
        e.preventDefault();
        cancelEdit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editableZ, placeMode]);

  // Keyboard handler для drag3d — Space открывает popup точного ввода,
  // повторный Space переключает сторону A/B, Escape отменяет drag.
  useEffect(() => {
    if (!drag3d) return;
    const onKey = (e) => {
      const isInputFocused = document.activeElement?.tagName === "INPUT";
      if (isInputFocused) return;
      if (e.key === " ") {
        e.preventDefault();
        setDrag3dInput(prev => {
          if (!prev) return { side: "A" };
          if (prev.side === "A") return { side: "B" };
          return null; // 3-й Space — закрывает
        });
      } else if (e.key === "Escape") {
        e.preventDefault();
        setDrag3dInput(null);
        setDrag3d(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag3d]);

  // Callback: применить зафиксированное значение — ставит элемент точно.
  // Вызывается при Enter в input.
  const commitLockedPlacement = (typedValue) => {
    const parsed = parseFloat(typedValue);
    if (!Number.isFinite(parsed) || parsed < 0 || !lockedNiche || !placeInZone) {
      cancelLocked();
      return;
    }
    const { niL, niR, niT, niB } = lockedNiche;
    const midX = (niL + niR) / 2;
    const midY = (niT + niB) / 2;
    if (placeMode === "stud") {
      // Пересчёт: где надо кликнуть чтобы stud встал по нужной цифре.
      // A (левая колонка = lockedValue): studX = niL + lockedValue → clickX = niL + lockedValue + t/2
      // B (правая колонка = lockedValue): studX = niR - lockedValue - t → clickX = niR - lockedValue - t/2
      let clickX;
      if (lockedDim === "A") {
        clickX = niL + parsed + t / 2;
      } else {
        clickX = niR - parsed - t / 2;
      }
      clickX = Math.max(niL + t / 2, Math.min(niR - t / 2, clickX));
      placeInZone(null, clickX, midY);
    } else if (placeMode === "shelf") {
      // A (верхний проём = lockedValue): y1 = niT + lockedValue → clickY = y1 + t/2 = niT + lockedValue + t/2
      // B (нижний проём = lockedValue): y2 = niB - lockedValue → y1 = y2 - t → clickY = y1 + t/2 = niB - lockedValue - t/2
      let clickY;
      if (lockedDim === "A") {
        clickY = niT + parsed + t / 2;
      } else {
        clickY = niB - parsed - t / 2;
      }
      // Кламп так чтобы полка не вылезла за нишу
      clickY = Math.max(niT + t / 2, Math.min(niB - t / 2, clickY));
      placeInZone(null, midX, clickY);
    } else if (placeMode === "rod") {
      // A (верхний проём = lockedValue): rodY = niT + lockedValue → clickY = rodY
      // B (нижний проём = lockedValue): rodY = niB - lockedValue → clickY = rodY
      let clickY;
      if (lockedDim === "A") {
        clickY = niT + parsed;
      } else {
        clickY = niB - parsed;
      }
      clickY = Math.max(niT + 12, Math.min(niB - 12, clickY));
      placeInZone(null, midX, clickY);
    }
    cancelLocked();
  };

  // ═══ Расчёт размеров для чертёжного стиля ═══
  // Каждая запись: { key, text, p1, p2, axis, offset3d } — две 3D-точки (метры)
  // измеряемого отрезка + ось (h/v) + вектор смещения линии размера наружу от шкафа.
  // Линия проекции и риски рисуются в SVG overlay; позиция обновляется в animate-tick.
  const dimsData = (() => {
    if (!showDims) return [];
    const S = 1 / 1000;
    const { width: W, height: H, depth: D } = corpus;
    const iWmm = iW;
    const iHmm = iH;
    const halfW = (showCorpus ? W - 2 * t : W) * S / 2;
    const halfH = (showCorpus ? H - 2 * t : H) * S / 2;
    const halfD = D * S / 2;
    const OFF_NEAR = 0.05;
    const OFF_FAR = 0.13;
    const zFront = halfD;

    const dims: any[] = [];

    // mm → 3D world coords
    const toX = (mm: number) => (mm - iWmm / 2) * S;
    const toY = (mm: number) => (iHmm / 2 - mm) * S;

    // ── Общие габариты корпуса ──
    // Ширина — сверху, дальняя линия
    dims.push({
      key: "total-w", text: `${W}`, axis: "h",
      p1: { x: -halfW, y: halfH, z: zFront },
      p2: { x:  halfW, y: halfH, z: zFront },
      offset3d: { x: 0, y: OFF_FAR, z: 0 },
    });
    // Высота — справа СНАРУЖИ
    dims.push({
      key: "total-h", text: `${H}`, axis: "v",
      p1: { x: halfW, y:  halfH, z: zFront },
      p2: { x: halfW, y: -halfH, z: zFront },
      offset3d: { x: OFF_FAR, y: 0, z: 0 },
    });
    // Глубина
    dims.push({
      key: "total-d", text: `${D}`, axis: "d",
      p1: { x: halfW, y: -halfH, z:  halfD },
      p2: { x: halfW, y: -halfH, z: -halfD },
      offset3d: { x: OFF_NEAR, y: -OFF_NEAR, z: 0 },
    });

    // ── Размеры по УРОВНЯМ ──
    // Уровень = горизонтальная полоса между двумя соседними полками (или
    // между потолком и первой полкой, последней полкой и полом). В каждом
    // уровне находим стойки которые в нём присутствуют (их Y-диапазон
    // перекрывает уровень) и показываем ширину ниш МЕЖДУ ВНЕШНИМИ ГРАНЯМИ
    // соседних стоек / стенок корпуса.
    //
    // Это даёт пользователю «по уму»: на каждом уровне отдельный набор
    // ширин ниш с учётом стоек именно этого уровня. Стойка которая делит
    // только средний уровень — не попадает в верхний/нижний.

    // Все полки отсортированы по Y (по центру)
    const shelves = elements
      .filter((e: any) => e.type === "shelf")
      .sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0));
    // Y-границы уровней. Каждая полка занимает [y - t/2 .. y + t/2].
    // Сегменты: [0 .. shelf1.top], [shelf1.bot .. shelf2.top], ..., [shelfN.bot .. iH]
    const levels: { top: number, bot: number }[] = [];
    let prevBot = 0;
    for (const sh of shelves) {
      const shTop = (sh.y ?? 0) - t / 2;
      const shBot = (sh.y ?? 0) + t / 2;
      if (shTop - prevBot > 25) {
        levels.push({ top: prevBot, bot: shTop });
      }
      prevBot = shBot;
    }
    if (iHmm - prevBot > 25) {
      levels.push({ top: prevBot, bot: iHmm });
    }

    // Для каждого уровня — ширины ниш и (на самой левой колонке) высота уровня
    levels.forEach((lvl, li) => {
      const yMid = (lvl.top + lvl.bot) / 2;
      // Стойки которые присутствуют в этом уровне: их вертикальный диапазон
      // [pTop..pBot] перекрывает [lvl.top..lvl.bot] на ≥10мм
      const studsInLvl = elements
        .filter((e: any) => e.type === "stud")
        .filter((s: any) => {
          const pTop = s.pTop ?? 0;
          const pBot = s.pBot ?? iHmm;
          const overlap = Math.min(pBot, lvl.bot) - Math.max(pTop, lvl.top);
          return overlap > 10;
        })
        .sort((a: any, b: any) => (a.x ?? 0) - (b.x ?? 0));

      // X-границы ниш в этом уровне: левая стенка → [стойка] → ... → правая стенка
      // Считаем ВНУТРЕННИЕ грани (после толщины стойки/стенки).
      const niches: { left: number, right: number }[] = [];
      let cursorL = 0; // внутренний левый край (правая грань левой стенки = 0 если корпус уже включает стенки в iW; в нашем случае iW = внутренняя ширина)
      for (const s of studsInLvl) {
        const sx = s.x ?? 0;
        // Ниша от cursorL до sx (левой грани стойки)
        if (sx - cursorL > 25) niches.push({ left: cursorL, right: sx });
        cursorL = sx + t; // правее стойки
      }
      // Последняя ниша до правой стенки
      if (iWmm - cursorL > 25) niches.push({ left: cursorL, right: iWmm });

      // Y для линии размеров. На САМОМ ВЕРХНЕМ уровне ставим линию НАД корпусом,
      // на остальных — внутри уровня под потолком уровня (на верхней грани полки).
      const isTopLevel = li === 0;
      let dimY: number;
      let dimOffset: number;
      if (isTopLevel) {
        // Над корпусом — на той же линии что и total-w, но ближе (OFF_NEAR)
        dimY = halfH;
        dimOffset = OFF_NEAR;
      } else {
        // Внутри: чуть выше верхней полки (внутри уровня)
        dimY = toY(lvl.top);
        dimOffset = -OFF_NEAR; // вверх внутри уровня = в направлении потолка уровня
      }
      // Если в уровне только одна ниша и она = вся ширина iW — общая ширина уже
      // показана через total-w, поэтому дублировать не надо. Пропускаем.
      const onlyOneFull = niches.length === 1 && niches[0].right - niches[0].left >= iWmm - 5;
      if (!onlyOneFull || !isTopLevel) {
        niches.forEach((n, ni) => {
          dims.push({
            key: `lvl-${li}-niche-${ni}`,
            text: `${Math.round(n.right - n.left)}`,
            axis: "h",
            p1: { x: toX(n.left), y: isTopLevel ? halfH : toY(lvl.top), z: zFront },
            p2: { x: toX(n.right), y: isTopLevel ? halfH : toY(lvl.top), z: zFront },
            offset3d: { x: 0, y: dimOffset, z: 0 },
          });
        });
      }

      // Высота уровня — слева СНАРУЖИ корпуса
      const lvlH = lvl.bot - lvl.top;
      dims.push({
        key: `lvl-${li}-h`,
        text: `${Math.round(lvlH)}`,
        axis: "v",
        p1: { x: -halfW, y: toY(lvl.top), z: zFront },
        p2: { x: -halfW, y: toY(lvl.bot), z: zFront },
        offset3d: { x: -OFF_NEAR, y: 0, z: 0 },
      });
    });

    return dims;
  })();

  // После рендера — синхронизируем dimLabelsRef с SVG-группами.
  // dimLabelsRef.current.groups: Map<key, { g, p1, p2, offset3d, axis }>
  useEffect(() => {
    if (!dimsOverlayRef.current) {
      dimLabelsRef.current.groups = null;
      return;
    }
    const map = new Map();
    dimsData.forEach(d => {
      const g = dimsOverlayRef.current.querySelector(`[data-dim-key="${d.key}"]`);
      if (g) {
        g.dataset.text = d.text;
        map.set(d.key, { g, p1: d.p1, p2: d.p2, offset3d: d.offset3d, axis: d.axis });
      }
    });
    dimLabelsRef.current.groups = map;
    if (stateRef.current.updateDimLabels) {
      stateRef.current.updateDimLabels();
    }
  }, [dimsData]);

  const build = useCallback(async () => {
    const { width: W, height: H, depth: D, thickness: T } = corpus;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08090c);

    const S = 1 / 1000; // mm → meters
    const w = W * S, h = H * S, d = D * S, tt = T * S;

    const cTex = await loadTex(corpusTexture?.imgUrl);
    const fTex = await loadTex(facadeTexture?.imgUrl);

    /* ─── Materials ─── */
    const makeMat = (hex, tex, rX = 1, rY = 1, opts = {}) => {
      if (tex) {
        const t = tex.clone();
        t.repeat.set(rX, rY);
        t.needsUpdate = true;
        return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.0, ...opts });
      }
      return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex || "#8b7355"), roughness: 0.6, metalness: 0.0, ...opts });
    };

    const corpRepX = W / 600, corpRepY = H / 600;
    const corpMat = makeMat(corpusTexture?.hex, cTex, corpRepX, corpRepY);
    const facMat = makeMat(facadeTexture?.hex, fTex, 1, 1, { roughness: 0.35 });

    // Edge banding — slightly lighter/darker than base, with higher gloss
    const edgeHex = corpusTexture?.hex || "#8b7355";
    const edgeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(edgeHex).offsetHSL(0, -0.05, 0.03),
      roughness: 0.3, metalness: 0.0,
    });
    const facEdgeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(facadeTexture?.hex || "#f2efe8").offsetHSL(0, -0.05, 0.02),
      roughness: 0.25, metalness: 0.0,
    });

    // ДВП 3mm back panel
    const dvpMat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.85, side: THREE.DoubleSide });
    // Metal hardware
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.2, metalness: 0.85 });
    // Inner drawer surfaces
    const innerMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.85 });
    // Chrome rod
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.15, metalness: 0.95 });

    const group = new THREE.Group();

    // Shorthand to add an ЛДСП panel with edge banding
    const addPanel = (pw, ph, pd, x, y, z, mat, eMat, edges = {}) => {
      const panel = createLDSPPanel(pw, ph, pd, mat, eMat, edges);
      panel.position.set(x, y, z);
      group.add(panel);
      return panel;
    };

    // Simple box (no edge banding — for hardware, etc.)
    const addBox = (bw, bh, bd, x, y, z, mat) => {
      const g = new THREE.BoxGeometry(bw, bh, bd);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return m;
    };

    /* ═══════════════════════════════
       CORPUS — Real furniture construction
       ═══════════════════════════════
       Joint rules (К3-Мебель style):
       • Боковины (sides) — FULL HEIGHT (H), depth D
         Edges: front кромка, top & bottom — NO (hidden by крыша/дно)
       • Крыша (top) — fits BETWEEN sides: width = W - 2T, depth D
         Edges: front кромка
       • Дно (bottom) — same as top
         Edges: front кромка
       • Задняя стенка (back) — ДВП 3mm, sits in 4mm groove routed
         10mm from rear edge of sides/top/bottom
    */

    const DVP_T = 3 * S;     // ДВП thickness: 3mm
    const GROOVE_INSET = 10 * S; // groove is 10mm from rear edge
    const FIT_GAP = 0.5 * S; // 0.5mm fitting gap

    if (showCorpus) {
      // ── Left side (Левая боковина) ──
      addPanel(tt, h, d,
        -w / 2 + tt / 2, 0, 0,
        corpMat, edgeMat,
        { front: true }
      );

      // ── Right side (Правая боковина) ──
      addPanel(tt, h, d,
        w / 2 - tt / 2, 0, 0,
        corpMat, edgeMat,
        { front: true }
      );

      // ── Top (Крыша) — between sides ──
      const topW = w - 2 * tt;
      addPanel(topW, tt, d,
        0, h / 2 - tt / 2, 0,
        corpMat, edgeMat,
        { front: true }
      );

      // ── Bottom (Дно) — between sides ──
      addPanel(topW, tt, d,
        0, -h / 2 + tt / 2, 0,
        corpMat, edgeMat,
        { front: true }
      );

      // ── Back panel (Задняя стенка ДВП 3мм) ──
      const backW = (W - 2 * T - 2) * S;
      const backH = (H - 2 * T - 2) * S;
      addBox(backW, backH, DVP_T,
        0, 0, -d / 2 + GROOVE_INSET + DVP_T / 2,
        dvpMat
      );
    }

    // When no corpus, iW/iH = full dimensions
    const iW = showCorpus ? W - 2 * T : W;
    const iH = showCorpus ? H - 2 * T : H;

    // ═══ ROOM — простая комната для понимания масштаба ═══
    // - Пол: 4×4м, светло-серый матовый (нейтральный «бетон»)
    // - Задняя стена: шире шкафа на 500мм с каждой стороны, высота +500мм
    // - Левая стена: 500мм в глубину, перпендикулярно задней (для эффекта угла)
    // Шкаф стоит у задней стены (z = -d/2 совпадает со стеной).
    if (showRoom) {
      const roomW = Math.max(w + 1, 3);          // ≥3м ширина комнаты
      const roomH = Math.max(h + 0.5, 2.5);      // потолок на 500мм выше шкафа
      const sideW = 0.5;                          // 500мм боковая стена
      const floorSize = Math.max(w + 2, 4);       // пол с запасом 1м с каждой стороны

      // Материалы
      const floorMat2 = new THREE.MeshStandardMaterial({
        color: 0xc8c0b0, roughness: 0.95, metalness: 0,
      });
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0xe8e2d5, roughness: 0.92, metalness: 0,
      });

      // Пол
      const roomFloor = new THREE.Mesh(new THREE.PlaneGeometry(floorSize, floorSize), floorMat2);
      roomFloor.rotation.x = -Math.PI / 2;
      roomFloor.position.y = -h / 2;
      roomFloor.receiveShadow = true;
      scene.add(roomFloor);

      // Задняя стена (позади шкафа, z = -d/2)
      const backWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallMat);
      backWall.position.set(0, -h / 2 + roomH / 2, -d / 2 - 0.005);
      backWall.receiveShadow = true;
      scene.add(backWall);

      // Левая стена (перпендикулярно задней)
      const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(sideW + d, roomH), wallMat);
      leftWall.rotation.y = Math.PI / 2;
      leftWall.position.set(-w / 2 - 0.005, -h / 2 + roomH / 2, -d / 2 + (sideW + d) / 2);
      leftWall.receiveShadow = true;
      scene.add(leftWall);
    } else {
      // Старое поведение — просто теневой пол (для тестов или мобильного если понадобится)
      const floorGeo2 = new THREE.PlaneGeometry(6, 6);
      const floorMat3 = new THREE.ShadowMaterial({ opacity: 0.35 });
      const floorT = new THREE.Mesh(floorGeo2, floorMat3);
      floorT.rotation.x = -Math.PI / 2;
      floorT.position.y = -h / 2;
      floorT.receiveShadow = true;
      scene.add(floorT);
    }

    // ═══ WIREFRAME-РАМКА — тонкий контур рабочей зоны шкафа ═══
    // Показывает внутренние границы шкафа (iW × iH × D), чтобы даже при showCorpus=false
    // было видно «где шкаф». При showCorpus=true дублирует корпус, но не мешает.
    // Для контраста на бежевой стене комнаты рисуем ДВЕ линии: тёмную-тень + яркую-оранжевую.
    {
      const iWm = (showCorpus ? W - 2 * T : W) * S;
      const iHm = (showCorpus ? H - 2 * T : H) * S;
      const dM = d;
      const halfW = iWm / 2, halfH = iHm / 2, halfD = dM / 2;
      // 8 вершин прямоугольного параллелепипеда
      const v = [
        [-halfW, -halfH, -halfD], [ halfW, -halfH, -halfD],
        [ halfW,  halfH, -halfD], [-halfW,  halfH, -halfD],
        [-halfW, -halfH,  halfD], [ halfW, -halfH,  halfD],
        [ halfW,  halfH,  halfD], [-halfW,  halfH,  halfD],
      ];
      // 12 рёбер куба (по парам индексов вершин)
      const edges = [
        [0,1],[1,2],[2,3],[3,0],  // задняя грань
        [4,5],[5,6],[6,7],[7,4],  // передняя грань
        [0,4],[1,5],[2,6],[3,7],  // соединяющие рёбра
      ];
      const positions = [];
      edges.forEach(([a, b]) => {
        positions.push(...v[a], ...v[b]);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

      // Слой 1 — тёмная тень (чуть больше, за передним планом)
      const shadowMat = new THREE.LineBasicMaterial({
        color: 0x1a0f05, transparent: true, opacity: 0.9,
        depthTest: false, // рисуется поверх всего
      });
      const wireShadow = new THREE.LineSegments(geo.clone(), shadowMat);
      wireShadow.renderOrder = 998;
      scene.add(wireShadow);

      // Слой 2 — яркая оранжевая (поверх тени)
      const wireMat = new THREE.LineBasicMaterial({
        color: 0xfb923c,  // ярко-оранжевый (чуть светлее primary)
        transparent: false,
        depthTest: false, // рисуется поверх всего
      });
      const wireframe = new THREE.LineSegments(geo, wireMat);
      wireframe.renderOrder = 999;
      scene.add(wireframe);
    }

    // ═══ PROJECTION PLANE — невидимая плоскость для raycast click-to-place ═══
    // Расположена на передней грани шкафа (z = +d/2), размер = iW × iH.
    // Используется только в placeMode для определения координат клика в шкафу.
    // ВАЖНО: visible:false НЕ работает с raycaster'ом — плоскость становится не пересекаемой.
    // Поэтому делаем её прозрачной (opacity:0) и без записи в z-buffer.
    const placeProjPlane = (() => {
      // Plane делаем СУЩЕСТВЕННО больше корпуса (×3), чтобы raycaster ловил курсор
      // даже когда тот ушёл за границы шкафа. Без этого фантом «выпадает» за границей —
      // raycaster промахивается мимо plane → screenToCabinetMm возвращает null →
      // hideZone(). Большая plane + clamp в screenToCabinetMm = фантом прилипает к стенке.
      const iWm = (showCorpus ? W - 2 * T : W) * S;
      const iHm = (showCorpus ? H - 2 * T : H) * S;
      const planeGeo = new THREE.PlaneGeometry(iWm * 3, iHm * 3);
      const planeMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,               // невидима визуально
        side: THREE.DoubleSide,   // raycast с обеих сторон
        depthWrite: false,        // не пишет в z-buffer (не загораживает другие меши)
      });
      const plane = new THREE.Mesh(planeGeo, planeMat);
      plane.position.set(0, 0, d / 2 + 0.01); // чуть впереди шкафа
      // Помечаем чтобы raycaster мог фильтровать
      plane.userData.isPlaceProjPlane = true;
      scene.add(plane);
      return plane;
    })();

    /* ─── Coordinate helpers ─── */
    // Convert inner mm coords to 3D position
    const toX = mmX => (mmX - iW / 2) * S;
    const toY = mmY => (iH / 2 - mmY) * S;

    /* ═══════════════════════════════
       INTERNAL ELEMENTS
       ═══════════════════════════════ */
    // Карта id → Object3D[] — чтобы быстро найти все меши элемента для подсветки (outline).
    const elementMeshes = new Map();

    elements.forEach(el => {
      // Запоминаем сколько детей group было ДО обработки этого элемента,
      // чтобы потом пометить все новые userData.elementId = el.id
      const childrenBefore = group.children.length;

      /* ── SHELF (Полка) ──
         Real construction:
         • Width = el.w (already accounts for stud gaps)
         • Depth = D - T(back inset) - 2mm front setback
         • Sits on полкодержатели (shelf pins), so small gaps
         • Кромка on front edge
         • 0.5mm gap from sides/studs it abuts */
      if (el.type === "shelf") {
        const shelfW = ((el.w || iW) - 1) * S; // 0.5mm gap each side
        const shelfD = d - GROOVE_INSET - DVP_T - 2 * S; // stops before back panel, 2mm front setback
        const elX = el.x || 0;
        const shelfCenterX = toX(elX + (el.w || iW) / 2);
        const shelfY = toY(el.y || 0);

        addPanel(shelfW, tt, shelfD,
          shelfCenterX, shelfY,
          tt / 2 + 1 * S, // slightly forward of center (2mm front setback)
          corpMat, edgeMat,
          { front: true } // кромка on front visible edge
        );

        // Shelf pins (полкодержатели) — 4 per shelf, small metal cylinders
        const pinR = 2.5 * S;
        const pinH = 8 * S;
        const shelfLeft = shelfCenterX - shelfW / 2;
        const shelfRight = shelfCenterX + shelfW / 2;
        const pinZ1 = d / 2 - 40 * S;  // front pins
        const pinZ2 = -d / 2 + GROOVE_INSET + DVP_T + 40 * S; // rear pins
        [shelfLeft + 15 * S, shelfRight - 15 * S].forEach(px => {
          [pinZ1, pinZ2].forEach(pz => {
            const pinGeo = new THREE.CylinderGeometry(pinR, pinR, pinH, 8);
            const pin = new THREE.Mesh(pinGeo, metalMat);
            pin.position.set(px, shelfY - tt / 2 - pinH / 2, pz);
            group.add(pin);
          });
        });
      }

      /* ── STUD (Стойка / Перегородка) ──
         Real construction:
         • Runs from pTop to pBot (between shelves or top/bottom)
         • Width = T (ЛДСП thickness)
         • Depth = D - T(back) - 2mm
         • Joint: конфирматы from top/bottom shelf into stud end-grain
         • Кромка on front + both side edges visible through shelves
         • FIT_GAP from bounding shelves */
      if (el.type === "stud") {
        const pTop = el.pTop || 0, pBot = el.pBot || iH;
        const studH = (pBot - pTop - 1) * S; // 0.5mm gap top + bottom
        const studD = d - GROOVE_INSET - DVP_T - 2 * S;
        // el.x is LEFT edge of stud; center = el.x + T/2
        const studX = toX((el.x || 0) + T / 2);
        const studY = toY(pTop + (pBot - pTop) / 2);

        addPanel(tt, studH, studD,
          studX, studY,
          tt / 2 + 1 * S,
          corpMat, edgeMat,
          { front: true, left: true, right: true } // кромка on front + both visible sides
        );

        // Конфирмат holes visualization — small dark circles on top/bottom
        // (subtle detail showing where screws go)
        [studY + studH / 2, studY - studH / 2].forEach(cy => {
          const confGeo = new THREE.CylinderGeometry(2.5 * S, 2.5 * S, 1 * S, 8);
          const conf = new THREE.Mesh(confGeo, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
          conf.position.set(studX, cy, d / 2 - 30 * S);
          group.add(conf);
          const conf2 = conf.clone();
          conf2.position.set(studX, cy, -d / 2 + GROOVE_INSET + DVP_T + 30 * S);
          group.add(conf2);
        });
      }

      /* ── DRAWERS (Ящики) ──
         Real construction:
         • Facade (фасад) — ЛДСП with кромка on all 4 edges
         • Box sides — thinner ЛДСП (12mm default) or ДСП
         • Box bottom — ДВП/ХДФ 3mm
         • 4mm gap between facade bottom and next drawer facade top
         • Metal handle on facade front */
      if (el.type === "drawers") {
        const cnt = el.count || 3;
        const heights = el.drawerHeights || Array(cnt).fill(Math.floor((el.h || 450) / cnt));
        let accY = el.y || 0;
        const totalW = (el.w || 400) * S;
        const sx = toX((el.x || 0) + (el.w || 400) / 2);

        const DRAWER_SIDE_T = 12 * S;  // 12mm drawer side thickness
        const DRAWER_BOTTOM_T = 3 * S;  // 3mm ХДФ bottom
        const FACADE_GAP = 4 * S;       // 4mm gap between facade panels
        // Глубина ящика — пользователь может задать через el.depth (мм).
        // По умолчанию 72% от глубины корпуса (стандарт для метабокса/тандембокса).
        const drawerDepthMm = (typeof el.depth === "number" && el.depth > 0)
          ? el.depth
          : (corpus.depth || 600) * 0.72;
        const DRAWER_DEPTH = drawerDepthMm * S;

        for (let i = 0; i < cnt; i++) {
          const dh = heights[i] || 150;
          const dhS = dh * S;
          const sy = toY(accY + dh / 2);
          const facadeH = dhS - FACADE_GAP;

          // ── Facade panel — full ЛДСП with кромка on all 4 edges ──
          addPanel(totalW - 4 * S, facadeH, tt,
            sx, sy, d / 2 - tt / 2,
            facMat, facEdgeMat,
            { top: true, bottom: true, left: true, right: true }
          );

          // ── Drawer box ──
          const boxInnerW = totalW - 36 * S; // gap for guides
          const boxH = (dh - 40) * S;
          const boxCenterZ = -d * 0.08;

          // Bottom panel (ХДФ 3mm)
          addBox(boxInnerW - 2 * DRAWER_SIDE_T, DRAWER_BOTTOM_T, DRAWER_DEPTH,
            sx, sy - facadeH / 2 + 14 * S, boxCenterZ, innerMat);

          // Left side
          addBox(DRAWER_SIDE_T, boxH, DRAWER_DEPTH,
            sx - boxInnerW / 2 + DRAWER_SIDE_T / 2, sy, boxCenterZ, innerMat);

          // Right side
          addBox(DRAWER_SIDE_T, boxH, DRAWER_DEPTH,
            sx + boxInnerW / 2 - DRAWER_SIDE_T / 2, sy, boxCenterZ, innerMat);

          // Back panel of drawer box
          addBox(boxInnerW - 2 * DRAWER_SIDE_T, boxH, DRAWER_SIDE_T,
            sx, sy, boxCenterZ - DRAWER_DEPTH / 2 + DRAWER_SIDE_T / 2, innerMat);

          // Front panel of drawer box (behind facade)
          addBox(boxInnerW - 2 * DRAWER_SIDE_T, boxH, DRAWER_SIDE_T,
            sx, sy, boxCenterZ + DRAWER_DEPTH / 2 - DRAWER_SIDE_T / 2, innerMat);

          // ── Handle — modern flat bar ──
          addBox(50 * S, 6 * S, 12 * S, sx, sy, d / 2 + 6 * S, metalMat);

          // ── Guide rails (telescopic) ──
          [-1, 1].forEach(side => {
            const gx = sx + side * (boxInnerW / 2 + 4 * S);
            addBox(3 * S, 6 * S, DRAWER_DEPTH * 0.9, gx, sy, boxCenterZ, metalMat);
          });

          accY += dh;
        }
      }

      /* ── ROD (Штанга) ──
         Chrome tube + metal holders with screws */
      if (el.type === "rod") {
        const rw = (el.w || 400) * S;
        const sx = toX((el.x || 0) + (el.w || 400) / 2);
        const sy = toY(el.y || 150);
        // Z-позиция: центр глубины штанги от центра шкафа.
        // el.z измеряется от центра шкафа (0 = центр, +d/2 = передняя грань, -d/2 = задняя).
        // По умолчанию 0 (центр).
        const sz = (el.z ?? 0) * S;

        // Chrome tube — 25mm diameter
        const rodGeo = new THREE.CylinderGeometry(12.5 * S, 12.5 * S, rw, 24);
        rodGeo.rotateZ(Math.PI / 2);
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.position.set(sx, sy, sz);
        rod.castShadow = true;
        group.add(rod);

        // Rod holders (фланцы) — detailed bracket
        [-rw / 2 - 3 * S, rw / 2 + 3 * S].forEach(ox => {
          // Vertical plate screwed to side/stud
          addBox(3 * S, 20 * S, 30 * S, sx + ox, sy + 2 * S, sz, metalMat);
          // U-bracket holding the tube
          addBox(8 * S, 4 * S, 28 * S, sx + ox, sy + 12 * S, sz, metalMat);
          // Screws
          [{ dy: 6, dz: 8 }, { dy: 6, dz: -8 }, { dy: -6, dz: 8 }, { dy: -6, dz: -8 }].forEach(s => {
            const screwGeo = new THREE.CylinderGeometry(1.5 * S, 1.5 * S, 4 * S, 6);
            screwGeo.rotateZ(Math.PI / 2);
            const screw = new THREE.Mesh(screwGeo, metalMat);
            screw.position.set(sx + ox + (ox > 0 ? 2 : -2) * S, sy + s.dy * S, sz + s.dz * S);
            group.add(screw);
          });
        });
      }

      /* ═══ DOORS — Real ЛДСП panel with петли (hinges) ═══
         Construction:
         • Panel = ЛДСП T mm thick, кромка on all 4 edges
         • Петли (hinges): cup Ø35mm in door back, arm to mounting plate
         • Handle: modern metal bar
         • Overlay (накладная): door covers corpus front edge, 2mm gap
         • Insert (вкладная): door recessed inside, flush with front */
      if (el.type === "door" && showDoors) {
        const hingeType = el.hingeType || "overlay";
        const isL = el.hingeSide === "left";
        const doorT = tt;

        const doorW = (el.w || 400) * S;
        const doorH = (el.h || iH) * S;
        const doorX = toX((el.x || 0) + (el.w || 400) / 2);
        const doorY = toY((el.y || 0) + (el.h || iH) / 2);

        const GAP_FROM_CORPUS = 2 * S;
        let doorZ;
        if (hingeType === "overlay") {
          doorZ = d / 2 + GAP_FROM_CORPUS + doorT / 2;
        } else {
          doorZ = d / 2 - doorT / 2 - GAP_FROM_CORPUS;
        }

        // ── Door panel with кромка on all 4 edges ──
        addPanel(doorW, doorH, doorT,
          doorX, doorY, doorZ,
          facMat, facEdgeMat,
          { top: true, bottom: true, left: true, right: true }
        );

        // ── Handle — sleek vertical bar ──
        const handleLen = Math.min(doorH * 0.12, 60 * S);
        const handleX = isL ? doorX + doorW / 2 - 22 * S : doorX - doorW / 2 + 22 * S;
        addBox(5 * S, handleLen, 14 * S, handleX, doorY, doorZ + doorT / 2 + 7 * S, metalMat);
        // Handle standoffs
        [handleLen / 2 - 4 * S, -handleLen / 2 + 4 * S].forEach(dy => {
          addBox(5 * S, 4 * S, 8 * S, handleX, doorY + dy, doorZ + doorT / 2 + 3 * S, metalMat);
        });

        // ── Hinges — петли Blum/Hettich style ──
        const hingeCount = doorH / S > 1800 ? 4 : doorH / S > 1200 ? 3 : 2;
        const hingeX = isL ? doorX - doorW / 2 + 12 * S : doorX + doorW / 2 - 12 * S;
        const hingeSideSign = isL ? -1 : 1;

        for (let hi = 0; hi < hingeCount; hi++) {
          const hFrac = hi === 0 ? 0.08 : hi === hingeCount - 1 ? 0.92 : (hi / (hingeCount - 1));
          const hingeY = doorY + doorH / 2 - doorH * hFrac;

          // Cup (чашка Ø35mm) — recessed into door back
          const cupGeo = new THREE.CylinderGeometry(17.5 * S, 17.5 * S, 12 * S, 16);
          cupGeo.rotateX(Math.PI / 2);
          const cup = new THREE.Mesh(cupGeo, metalMat);
          cup.position.set(hingeX, hingeY, doorZ - doorT / 2 - 6 * S);
          group.add(cup);

          // Arm (рычаг) — connects cup to mounting plate
          addBox(8 * S, 12 * S, GAP_FROM_CORPUS + 10 * S,
            hingeX, hingeY, doorZ - doorT / 2 - GAP_FROM_CORPUS / 2 - 5 * S, metalMat);

          // Mounting plate (ответная планка) on corpus side
          addBox(12 * S, 20 * S, 3 * S,
            hingeX + hingeSideSign * (-4 * S), hingeY,
            d / 2 - 1.5 * S, metalMat);

          // Screws on mounting plate
          [-6, 6].forEach(sdy => {
            const sg = new THREE.CylinderGeometry(1.5 * S, 1.5 * S, 3 * S, 6);
            sg.rotateX(Math.PI / 2);
            const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.3, metalness: 0.7 }));
            sm.position.set(hingeX + hingeSideSign * (-4 * S), hingeY + sdy * S, d / 2 - 3 * S);
            group.add(sm);
          });
        }
      }

      /* ── PANEL (Панель — цоколь/антресоль/заглушка) ──
         Реальная конструкция:
         • ЛДСП-панель того же цвета что и корпус
         • Накладная (overlay) — выступает за габариты проёма на 14мм/7мм, ставится на 2мм перед корпусом
         • Вкладная (insert) — утоплена в проём на 2мм, внутри габаритов
         • Учитывается el.depth / el.depthOffset если заданы — для утопленных панелей
         • Кромка на всех 4 видимых рёбрах */
      if (el.type === "panel") {
        const panelType = el.panelType || "overlay";
        const panelT = tt;

        const panelW = (el.w || 400) * S;
        const panelH = (el.h || iH) * S;
        const panelX = toX((el.x || 0) + (el.w || 400) / 2);
        const panelY = toY((el.y || 0) + (el.h || iH) / 2);

        const GAP_FROM_CORPUS = 2 * S;
        // Z-координата центра панели. Приоритет:
        // 1. Если задана depth — используем её (depth = "занимаемое место по глубине").
        //    Центр панели по Z = задняя_стенка + depthOffset + depth/2
        // 2. Иначе если задан depthOffset — аналогично, от задней стенки
        // 3. Иначе — по типу (overlay/insert)
        const hasCustomDepth = typeof el.depth === "number" && el.depth > 0;
        // Был баг: depthOffset > 0 пропускал случай 0мм (панель у задней стенки).
        // Принимаем любое неотрицательное значение, включая 0.
        const hasCustomOffset = typeof el.depthOffset === "number" && el.depthOffset >= 0;

        let panelZ;
        if (hasCustomDepth || hasCustomOffset) {
          // Пользователь явно задал где стоит панель — используем depth/depthOffset от ЗАДНЕЙ стенки.
          // Задняя стенка в 3D = -d/2, передняя = +d/2
          const offset = (el.depthOffset || 0) * S;
          const depth = hasCustomDepth ? el.depth * S : panelT;
          // Центр панели-объёма по Z = задняя_стенка + offset + depth/2
          panelZ = -d / 2 + offset + depth / 2;
        } else if (panelType === "overlay") {
          // Накладная без custom depth: перед корпусом + 2мм зазор
          panelZ = d / 2 + GAP_FROM_CORPUS + panelT / 2;
        } else {
          // Вкладная без custom depth: у передней кромки внутри, 2мм зазор
          panelZ = d / 2 - panelT / 2 - GAP_FROM_CORPUS;
        }

        // ── Панель с кромкой на всех 4 видимых рёбрах ──
        addPanel(panelW, panelH, panelT,
          panelX, panelY, panelZ,
          corpMat, edgeMat,
          { top: true, bottom: true, left: true, right: true }
        );
      }

      // После обработки элемента: всем новым children группы присваиваем elementId.
      // Это нужно для raycast'а (чтобы понять на что кликнули) и для outline (подсветка).
      const addedMeshes = group.children.slice(childrenBefore);
      addedMeshes.forEach(obj => {
        obj.userData.elementId = el.id;
        // Рекурсивно у вложенных (у стойки/полки корневой — Group из createLDSPPanel)
        obj.traverse?.(c => { c.userData.elementId = el.id; });
      });
      elementMeshes.set(el.id, addedMeshes);
    });

    scene.add(group);

    /* ═══ LIGHTING — studio setup for product render ═══ */
    const amb = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(amb);

    // Key light — warm, from upper right
    const key = new THREE.DirectionalLight(0xfff5e0, 0.85);
    key.position.set(2.5, 3.5, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 15;
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -3;
    key.shadow.bias = -0.0003;
    scene.add(key);

    // Fill light — cool, from left
    const fill = new THREE.DirectionalLight(0xd0e0ff, 0.3);
    fill.position.set(-3.5, 2, -1);
    scene.add(fill);

    // Rim light — edge separation
    const rim = new THREE.DirectionalLight(0xffffff, 0.18);
    rim.position.set(0, 1.5, -4);
    scene.add(rim);

    // Bounce — warm from floor
    const bounce = new THREE.PointLight(0xd4a060, 0.08, 6);
    bounce.position.set(0, -h / 2 + 0.1, 1.2);
    scene.add(bounce);

    // Interior light — illuminates inside of wardrobe
    const interior = new THREE.PointLight(0xffe8c0, 0.15, 3);
    interior.position.set(0, 0, d * 0.2);
    scene.add(interior);

    /* ═══ CAMERA ═══ */
    const aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(32, aspect, 0.01, 50);
    const dist = Math.max(w, h) * 2.1;
    camera.position.set(dist * 0.7, dist * 0.25, dist * 0.85);
    camera.lookAt(0, 0, 0);

    /* ═══ RENDERER ═══ */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    // ═══ ZONE HIGHLIGHT — полный силуэт будущего элемента в 3D ═══
    // Полупрозрачный жёлтый параллелепипед в реальных размерах элемента (W×H×D)
    // + жёлтая обводка по рёбрам сверху. Выглядит как «фантом» элемента —
    // понятно куда встанет, в каких размерах, с какой глубиной.
    const zoneHighlight = (() => {
      const grp = new THREE.Group();
      // Заливка — полупрозрачный жёлтый solid box (масштабируется через scale)
      const fillGeo = new THREE.BoxGeometry(1, 1, 1);
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,         // не пишем в z-buffer — другие меши не закрывает
      });
      const fillMesh = new THREE.Mesh(fillGeo, fillMat);
      fillMesh.renderOrder = 996;
      grp.add(fillMesh);
      // Outline — яркие жёлтые рёбра поверх (EdgesGeometry от того же box)
      const edgeGeo = new THREE.EdgesGeometry(fillGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 1.0,
        depthTest: false,          // рёбра видны поверх всего
      });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      edges.renderOrder = 999;
      grp.add(edges);
      // Сохраняем ссылки для лёгкого доступа в updateZoneHighlight
      grp.userData.fillMesh = fillMesh;
      grp.userData.edges = edges;
      grp.visible = false;
      scene.add(grp);
      return grp;
    })();

    return { scene, camera, renderer, dist, elementMeshes, group, placeProjPlane, zoneHighlight, S, d, cTex, fTex };
  }, [corpus, elements, corpusTexture, facadeTexture, showDoors, showCorpus, showRoom]);

  useEffect(() => {
    if (!mountRef.current) return;
    let cancelled = false;

    build().then(({ scene, camera, renderer, dist, elementMeshes, group, placeProjPlane, zoneHighlight, S, d, cTex, fTex }) => {
      if (cancelled) return;

      // Камера: восстанавливаем последнее положение из cameraRef (rotY/rotX/zoom).
      // При первом mount это дефолт, при последующих rebuild — то что пользователь
      // покрутил вручную.
      let isDragging = false, prevX = 0, prevY = 0;
      let rotY = cameraRef.current.rotY;
      let rotX = cameraRef.current.rotX;
      let zoom = cameraRef.current.zoom;

      // ── Raycast setup — для клика по элементам ──
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      // Запоминаем начальные координаты pointerdown — если pointerup близко, это клик (не drag).
      let downX = 0, downY = 0, downTime = 0;
      const CLICK_THRESHOLD_PX = 6;
      const CLICK_THRESHOLD_MS = 400;

      // ── Outline (подсветка) выделенного элемента ──
      // Создаём group для outline-линий, обновляем его при изменении selId.
      const outlineGroup = new THREE.Group();
      scene.add(outlineGroup);
      const OUTLINE_COLOR = 0xfbbf24;
      const updateOutline = (id) => {
        // Удаляем старые линии
        while (outlineGroup.children.length) {
          const c = outlineGroup.children.pop();
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        }
        if (!id) return;
        const meshes = elementMeshes.get(id);
        if (!meshes) return;
        // Для каждой mesh с BoxGeometry строим EdgesGeometry
        const mat = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR, linewidth: 2 });
        meshes.forEach(obj => {
          obj.traverse?.(c => {
            if (c.isMesh && c.geometry) {
              const edges = new THREE.EdgesGeometry(c.geometry, 15);
              const line = new THREE.LineSegments(edges, mat);
              // Копируем world-трансформацию
              obj.updateMatrixWorld?.(true);
              c.updateMatrixWorld?.(true);
              line.position.copy(c.getWorldPosition(new THREE.Vector3()));
              line.quaternion.copy(c.getWorldQuaternion(new THREE.Quaternion()));
              line.scale.copy(c.getWorldScale(new THREE.Vector3()));
              // Чуть увеличиваем чтобы outline был виден поверх меша
              line.scale.multiplyScalar(1.008);
              outlineGroup.add(line);
            }
          });
        });
      };
      // Сохраняем updateOutline в stateRef, чтобы можно было дёргать при изменении selId снаружи
      stateRef.current.updateOutline = updateOutline;
      stateRef.current.zoneHighlight = zoneHighlight;
      // Начальная подсветка (если selId уже задан)
      updateOutline(selId);

      // ── Helper: скрыть/показать меши элемента во время drag3d ──
      // Когда пользователь тащит существующий элемент, сам он «пропадает»,
      // а вместо него рисуется жёлтый фантом (через zoneHighlight как при placement).
      // setVisible проходит по всем мешам элемента и включает/выключает visible.
      const setElementVisibility = (id, visible) => {
        const meshes = elementMeshes.get(id);
        if (!meshes) return;
        meshes.forEach(obj => {
          obj.visible = visible;
          obj.traverse?.(c => { c.visible = visible; });
        });
      };
      stateRef.current.setElementVisibility = setElementVisibility;

      const onWheel = e => {
        e.preventDefault();
        zoom = Math.max(0.3, Math.min(3, zoom + e.deltaY * -0.0008));
      };

      // ── Helper: проекция screen coords → шкафные координаты в мм ──
      // Возвращает {clickX, clickY} в мм или null если клик мимо шкафа.
      const screenToCabinetMm = (clientX, clientY) => {
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(placeProjPlane, false);
        if (!hits.length) return null;
        const point = hits[0].point;
        // Обратная формула из toX/toY:
        // toX(mmX) = (mmX - iW/2) * S  →  mmX = point.x / S + iW/2
        // toY(mmY) = (iH/2 - mmY) * S  →  mmY = iH/2 - point.y / S
        const { iW: cW, iH: cH } = propsRef.current;
        let clickX = point.x / S + cW / 2;
        let clickY = cH / 2 - point.y / S;
        // Если курсор ушёл далеко за границы — отбрасываем (фантом скрывается).
        // Иначе клампим в [0, iW] × [0, iH] чтобы фантом оставался у границы,
        // а не пропадал — пользователь может ставить элемент вплотную к стенке.
        // MARGIN большой потому что plane ×3 от размеров корпуса (см. placeProjPlane).
        const MARGIN = Math.max(cW, cH); // до 1× размера корпуса за границей — всё ещё клампим
        if (clickX < -MARGIN || clickX > cW + MARGIN ||
            clickY < -MARGIN || clickY > cH + MARGIN) return null;
        clickX = Math.max(0, Math.min(cW, clickX));
        clickY = Math.max(0, Math.min(cH, clickY));
        return { clickX, clickY };
      };

      // ── Helper: обновить подсветку силуэта элемента под курсором ──
      // Для placeMode рассчитываем где именно встанет элемент (а не всю нишу),
      // и рисуем жёлтый прямоугольник его реального размера.
      const hideZone = () => {
        zoneHighlight.visible = false;
        if (ghostDimARef.current) ghostDimARef.current.style.display = "none";
        if (ghostDimBRef.current) ghostDimBRef.current.style.display = "none";
        // Сбрасываем активный snap чтобы жёлтые линии исчезли вместе с фантомом
        stateRef.current.activeSnap = null;
      };

      // ── Helper: перемещение существующего элемента в 3D (drag-n-drop) ──
      // Вызывается из onPointerMove когда drag3d активен. Рассчитывает новые
      // координаты (с snap 10мм и clamp в рамки) и сохраняет в stateRef для
      // последующего updateEl при отпускании (onPointerUp).
      // Фантом отрисовывается через zoneHighlight — такой же жёлтый прямоугольник
      // как при placement, но для уже существующего элемента.
      // ── Snap к соседним элементам ──
      // Собирает значения координат соседей которые могут «притянуть» фантом.
      // Возвращает { value, snapTo } — value: финальная координата, snapTo: target
      // или null если не притянулось. SNAP_MAGNET = 15мм — расстояние срабатывания.
      const SNAP_MAGNET = 30;
      const applySnap = (value: number, targets: number[]): { value: number, snapTo: number | null } => {
        if (!targets.length) return { value, snapTo: null };
        let best = null;
        let bestDist = SNAP_MAGNET;
        for (const t of targets) {
          const d = Math.abs(value - t);
          if (d < bestDist) {
            bestDist = d;
            best = t;
          }
        }
        return best !== null ? { value: best, snapTo: best } : { value, snapTo: null };
      };

      // Сбор snap-targets для drag элемента draggedId.
      // Для X (стойка/дверь/панель/ящики): собираем x-границы всех других стоек,
      // двери, панели, ящиков + центры между ними.
      // Для Y (полка/штанга/ящики/дверь/панель): собираем y-границы полок,
      // штанг, ящиков (верх/низ блока).
      // ── Сбор snap-targets раздельно по семантике ──
      // Возвращает три массива чтобы одинаковые «сущности» снапились друг к другу:
      // - edges: грани/стенки (внешние границы элементов)
      // - centers: центральные оси (середины стоек, штанг, центры полок)
      // - dividers: внутренние разделители (между ящиками — для прилипания
      //   полки к уровню перегородки в соседнем блоке)
      const collectSnapTargets = (draggedId: string, axis: "x" | "y") => {
        const { elements: els, t: ct, iW: cW, iH: cH } = propsRef.current;
        const edges: number[] = [];
        const centers: number[] = [];
        const dividers: number[] = [];
        // Стенки корпуса — грани
        if (axis === "x") {
          edges.push(0, cW);
        } else {
          edges.push(0, cH);
        }
        for (const el of els) {
          if (!el || el.id === draggedId) continue;
          if (axis === "x") {
            if (el.type === "stud") {
              const sx = el.x ?? 0;
              edges.push(sx, sx + ct);     // обе грани стойки
              centers.push(sx + ct / 2);   // ось стойки
            }
            if (el.type === "door" || el.type === "panel" || el.type === "drawers") {
              const ex = el.x ?? 0;
              const ew = el.w ?? 0;
              edges.push(ex, ex + ew);     // обе грани блока
              centers.push(ex + ew / 2);
            }
          } else {
            if (el.type === "shelf") {
              const sy = el.y ?? 0;
              centers.push(sy);            // центр полки
              edges.push(sy - ct / 2, sy + ct / 2);  // верхняя/нижняя грань
            }
            if (el.type === "rod") {
              centers.push(el.y ?? 0);     // ось штанги
            }
            if (el.type === "drawers" || el.type === "door" || el.type === "panel") {
              const ey = el.y ?? 0;
              const eh = el.h ?? 0;
              edges.push(ey, ey + eh);     // верх/низ блока
              centers.push(ey + eh / 2);
            }
            if (el.type === "drawers" && el.drawerHeights) {
              let y = el.y ?? 0;
              for (const h of el.drawerHeights) {
                y += h;
                dividers.push(y);          // разделители между ящиками
              }
            }
          }
        }
        return { edges, centers, dividers };
      };

      const moveDraggedElement3D = (d3d, clickX, clickY) => {
        const { iW: cW, iH: cH, t: ct } = propsRef.current;
        const SNAP = 10;
        let cx = Math.round(clickX / SNAP) * SNAP;
        let cy = Math.round(clickY / SNAP) * SNAP;
        const { type, origEl } = d3d;
        const orig = origEl || {};
        const activeSnap: { x: number | null, y: number | null } = { x: null, y: null };
        // Snap логика — снапим САМОЕ БЛИЗКОЕ совпадение по СЕМАНТИКЕ:
        // - центр элемента → центр другого (центральная ось)
        // - грань → грань (встык)
        // Не смешиваем «центр к грани» — иначе полка прилипает со смещением t/2.
        if (type === "stud") {
          // Стойка: левая грань = cx - t/2, правая = cx + t/2, центр = cx.
          // Snap по семантике: центр-к-центру и грань-к-грани раздельно.
          const { centers, edges } = collectSnapTargets(d3d.id, "x");
          // 1) Центр стойки → центру соседней стойки
          const rC = applySnap(cx, centers);
          if (rC.snapTo !== null) {
            cx = rC.value;
            activeSnap.x = rC.snapTo;
          } else {
            // 2) Левая грань → грани соседа (встык справа от соседа)
            const leftEdge = cx - ct / 2;
            const rL = applySnap(leftEdge, edges);
            if (rL.snapTo !== null) {
              cx = rL.value + ct / 2;
              activeSnap.x = rL.snapTo;
            } else {
              // 3) Правая грань → грани соседа (встык слева от соседа)
              const rightEdge = cx + ct / 2;
              const rR = applySnap(rightEdge, edges);
              if (rR.snapTo !== null) {
                cx = rR.value - ct / 2;
                activeSnap.x = rR.snapTo;
              }
            }
          }
        } else if (type === "shelf") {
          // Полка: y = центр полки. Снапим:
          // 1) центр-к-центру другой полки/штанги
          // 2) ВЕРХНЮЮ грань (cy - ct/2) к НИЖНЕЙ грани соседнего элемента (стык сверху)
          // 3) НИЖНЮЮ грань (cy + ct/2) к ВЕРХНЕЙ грани соседнего элемента (стык снизу)
          // Также к dividers (разделители ящиков) — центр-к-разделителю.
          const { edges, centers, dividers } = collectSnapTargets(d3d.id, "y");
          // Кандидаты для центра моей полки (вместе с эквивалентами для граней)
          const all: number[] = [];
          // Центр-к-центру
          all.push(...centers);
          // Центр-к-разделителю (полка лежит на уровне границы между ящиками)
          all.push(...dividers);
          // Центр-к-грани = моя верх. грань (cy - t/2) совпадёт с гранью другого
          // ⇒ это означает cy = край + t/2 (моя полка лежит "на" другом)
          //   или cy = край - t/2 (моя полка лежит "под" другим)
          for (const e of edges) {
            all.push(e + ct / 2);  // моя нижняя грань = верх соседа (cy = верх + t/2)
            all.push(e - ct / 2);  // моя верхняя грань = низ соседа (cy = низ - t/2)
          }
          const r = applySnap(cy, all);
          cy = r.value;
          activeSnap.y = r.snapTo;
        } else if (type === "rod") {
          const { edges, centers } = collectSnapTargets(d3d.id, "y");
          const r = applySnap(cy, [...centers, ...edges]);
          cy = r.value;
          activeSnap.y = r.snapTo;
        } else if (type === "drawers" || type === "door" || type === "panel") {
          // Блоки: ширина w, высота h. Снапим ГРАНЬ-К-ГРАНИ:
          // - левая грань блока (cx - w/2) к edges по X (встык справа от стойки/края)
          // - правая грань (cx + w/2) к edges по X (встык слева)
          // - центр блока к центрам
          // По Y аналогично.
          const w = orig.w || (type === "drawers" ? 400 : 400);
          const h = orig.h || (type === "drawers" ? 450 : 600);
          // X: пробуем сначала левую грань, потом правую, потом центр
          const tX = collectSnapTargets(d3d.id, "x");
          const leftEdge = cx - w / 2;
          const rL = applySnap(leftEdge, tX.edges);
          if (rL.snapTo !== null) {
            cx = rL.value + w / 2;
            activeSnap.x = rL.snapTo;
          } else {
            const rightEdge = cx + w / 2;
            const rR = applySnap(rightEdge, tX.edges);
            if (rR.snapTo !== null) {
              cx = rR.value - w / 2;
              activeSnap.x = rR.snapTo;
            } else {
              const rC = applySnap(cx, tX.centers);
              if (rC.snapTo !== null) {
                cx = rC.value;
                activeSnap.x = rC.snapTo;
              }
            }
          }
          // Y аналогично
          const tY = collectSnapTargets(d3d.id, "y");
          const topEdge = cy - h / 2;
          const rT = applySnap(topEdge, tY.edges);
          if (rT.snapTo !== null) {
            cy = rT.value + h / 2;
            activeSnap.y = rT.snapTo;
          } else {
            const bottomEdge = cy + h / 2;
            const rB = applySnap(bottomEdge, tY.edges);
            if (rB.snapTo !== null) {
              cy = rB.value - h / 2;
              activeSnap.y = rB.snapTo;
            } else {
              const rC = applySnap(cy, tY.centers);
              if (rC.snapTo !== null) {
                cy = rC.value;
                activeSnap.y = rC.snapTo;
              }
            }
          }
        }
        // Сохраняем snap-цели для рендера индикатора (жёлтая линия)
        stateRef.current.activeSnap = activeSnap;
        // Рассчитываем новое положение в терминах (x1, y1, x2, y2) фантома
        let x1, y1, x2, y2;
        let nextEl = { ...orig };
        if (type === "stud") {
          const nx = Math.max(0, Math.min(cW - ct, cx - ct / 2));
          nextEl.x = nx;
          x1 = nx; x2 = nx + ct;
          y1 = orig.pTop || 0; y2 = orig.pBot || cH;
        } else if (type === "shelf") {
          const ny = Math.max(ct / 2, Math.min(cH - ct / 2, cy));
          nextEl.y = ny;
          x1 = orig.x || 0; x2 = x1 + (orig.w || cW);
          y1 = ny - ct / 2; y2 = ny + ct / 2;
        } else if (type === "rod") {
          const ny = Math.max(ct, Math.min(cH - ct, cy));
          nextEl.y = ny;
          x1 = orig.x || 0; x2 = x1 + (orig.w || cW);
          y1 = ny - 12; y2 = ny + 12;
        } else if (type === "drawers") {
          const h = orig.h || 450;
          // Автоширина по нише между стойками — ящики занимают всю ширину
          // ниши в которую попал курсор (как полка). Если стоек нет — на всю ширину корпуса.
          const { findDoorBounds: fdb } = propsRef.current;
          let nx, w;
          if (fdb) {
            const bounds = fdb(cx, cy);
            const left = bounds?.left?.x ?? 0;
            const right = bounds?.right?.x ?? cW;
            const lWall = bounds?.left?.isWall ?? true;
            nx = lWall ? left : left + ct;       // если слева стойка — отступ на её толщину
            w = Math.max(20, right - nx);
          } else {
            w = orig.w || 400;
            nx = Math.max(0, Math.min(cW - w, cx - w / 2));
          }
          const ny = Math.max(0, Math.min(cH - h, cy - h / 2));
          nextEl.x = nx; nextEl.y = ny; nextEl.w = w;
          x1 = nx; x2 = nx + w; y1 = ny; y2 = ny + h;
        } else if (type === "panel") {
          // Панель — авто-подгонка под нишу только для insert (вкладной).
          // Накладная (overlay) сохраняет свою ширину — она перекрывает стойки.
          const h = orig.h || 600;
          const isInsert = orig.panelType === "insert";
          const { findDoorBounds: fdb } = propsRef.current;
          let nx, w;
          if (isInsert && fdb) {
            const bounds = fdb(cx, cy);
            const left = bounds?.left?.x ?? 0;
            const right = bounds?.right?.x ?? cW;
            const lWall = bounds?.left?.isWall ?? true;
            nx = lWall ? left : left + ct;
            w = Math.max(20, right - nx);
          } else {
            // Overlay или нет fdb — сохраняем оригинальную ширину
            w = orig.w || 400;
            nx = Math.max(0, Math.min(cW - w, cx - w / 2));
          }
          const ny = Math.max(0, Math.min(cH - h, cy - h / 2));
          nextEl.x = nx; nextEl.y = ny; nextEl.w = w;
          x1 = nx; x2 = nx + w; y1 = ny; y2 = ny + h;
        } else if (type === "door") {
          // Дверь — фиксированный размер (не авто), пользователь может вручную править.
          const w = orig.w || 400;
          const h = orig.h || 600;
          const nx = Math.max(0, Math.min(cW - w, cx - w / 2));
          const ny = Math.max(0, Math.min(cH - h, cy - h / 2));
          nextEl.x = nx; nextEl.y = ny;
          x1 = nx; x2 = nx + w; y1 = ny; y2 = ny + h;
        } else {
          return;
        }
        // Сохраняем pending обновление — применится в onPointerUp
        stateRef.current.drag3dPending = { id: d3d.id, next: nextEl };
        // Обновляем фантом (жёлтый прямоугольник элемента на новой позиции)
        showDrag3dPhantom(type, x1, y1, x2, y2);
      };

      // ── Helper: жёлтый фантом для drag3d (переиспользует zoneHighlight из placement) ──
      const showDrag3dPhantom = (type, x1, y1, x2, y2) => {
        const { iW: cW, iH: cH } = propsRef.current;
        const w = x2 - x1, h = y2 - y1;
        if (w <= 0 || h <= 0) { zoneHighlight.visible = false; return; }
        const cxMm = (x1 + x2) / 2;
        const cyMm = (y1 + y2) / 2;
        const cx = (cxMm - cW / 2) * S;
        const cy = (cH / 2 - cyMm) * S;
        const wM = w * S;
        const hM = h * S;
        // Глубина и Z для каждого типа — как в updateZoneHighlight
        let depthM, zPos;
        if (type === "door" || type === "panel") {
          depthM = 16 * S;
          zPos = d / 2 + depthM / 2 + 0.001;
        } else if (type === "rod") {
          depthM = 24 * S;
          zPos = 0;
        } else {
          // stud / shelf / drawers — глубина корпуса - 30мм зазор сзади
          depthM = d - 30 * S;
          zPos = 15 * S;
        }
        // Позиционируем и показываем zoneHighlight (мы переиспользуем его геометрию)
        zoneHighlight.userData.fillMesh?.scale?.set(wM, hM, depthM);
        zoneHighlight.userData.edges?.scale?.set(wM, hM, depthM);
        zoneHighlight.position.set(cx, cy, zPos);
        zoneHighlight.visible = true;

        // Показываем цифры расстояний от стенок (как при placement).
        // Для горизонтально движущихся (X) — расстояния слева/справа,
        // для вертикально (Y) — сверху/снизу.
        const ghostA = ghostDimARef.current;
        const ghostB = ghostDimBRef.current;
        if (!ghostA || !ghostB) return;
        let textA = "", textB = "", posA3D = null, posB3D = null;
        // Размеры показывают расстояние в МИЛЛИМЕТРАХ корпуса от ближайших стенок.
        // Позицию badge на экране проецируем из 3D world coords:
        // - x = (mm - cW/2) × S
        // - y = (cH/2 - mm) × S
        // - z = передняя грань корпуса + небольшой зазор. Это даёт стабильную проекцию
        //   независимо от depthM/zPos конкретного типа элемента (избегаем точек за камерой).
        const labelZ = d / 2 + 5 * S;
        if (type === "stud") {
          // Расстояние слева и справа
          textA = `${Math.round(x1)}`;
          textB = `${Math.round(cW - x2)}`;
          const midYmm = (y1 + y2) / 2;
          posA3D = {
            x: (x1 / 2 - cW / 2) * S,
            y: (cH / 2 - midYmm) * S,
            z: labelZ,
          };
          posB3D = {
            x: ((x2 + cW) / 2 - cW / 2) * S,
            y: (cH / 2 - midYmm) * S,
            z: labelZ,
          };
        } else {
          // Для остальных — расстояния сверху и снизу
          textA = `${Math.round(y1)}`;
          textB = `${Math.round(cH - y2)}`;
          const midXmm = (x1 + x2) / 2;
          posA3D = {
            x: (midXmm - cW / 2) * S,
            y: (cH / 2 - y1 / 2) * S,
            z: labelZ,
          };
          posB3D = {
            x: (midXmm - cW / 2) * S,
            y: (cH / 2 - (y2 + cH) / 2) * S,
            z: labelZ,
          };
        }
        // Проецируем на экран
        const projFn = stateRef.current.projectToScreen;
        // Сохраняем 3D позиции для анимации (animate-loop перепроецирует при вращении)
        stateRef.current.drag3dLabelPositions = { A: posA3D, B: posB3D };
        if (projFn && posA3D && posB3D) {
          const pA = projFn(posA3D.x, posA3D.y, posA3D.z);
          const pB = projFn(posB3D.x, posB3D.y, posB3D.z);
          if (pA?.visible) {
            ghostA.style.display = "";
            ghostA.style.left = `${pA.px}px`;
            ghostA.style.top = `${pA.py}px`;
            if (!ghostA.querySelector("input")) ghostA.textContent = textA;
          } else { ghostA.style.display = "none"; }
          if (pB?.visible) {
            ghostB.style.display = "";
            ghostB.style.left = `${pB.px}px`;
            ghostB.style.top = `${pB.py}px`;
            if (!ghostB.querySelector("input")) ghostB.textContent = textB;
          } else { ghostB.style.display = "none"; }
        }
      };
      const updateZoneHighlight = (clientX, clientY) => {
        const { placeMode: pm, findDoorBounds: fdb, iW: cW, iH: cH, t: ct } = propsRef.current;
        if (!pm || !fdb) {
          hideZone();
          return;
        }
        const proj = screenToCabinetMm(clientX, clientY);
        if (!proj) {
          hideZone();
          return;
        }
        const bounds = fdb(proj.clickX, proj.clickY);
        if (!bounds) {
          hideZone();
          return;
        }
        // Границы ниши (innerEdge с учётом стенок/стоек)
        const niL = bounds.left.innerEdge ?? bounds.left.x ?? 0;
        const niR = bounds.right.innerEdge ?? bounds.right.x ?? cW;
        const niT = bounds.top.innerEdge ?? bounds.top.y ?? 0;
        const niB = bounds.bottom.innerEdge ?? bounds.bottom.y ?? cH;

        // Сохраняем текущую нишу — нужно при клике на ghost-dim для locked placement
        stateRef.current.lastNiche = { niL, niR, niT, niB };

        // Если есть заблокированное измерение — пересчитываем границы ниши так
        // как будто мы находимся в ЗАБЛОКИРОВАННОЙ нише (а не в той где курсор).
        // Это нужно чтобы при наборе в input фантом не "улетал" за другие стойки.
        const { lockedDim: lD, lockedValue: lV, lockedNiche: lN } = propsRef.current;
        let effNiL = niL, effNiR = niR, effNiT = niT, effNiB = niB;
        if (lD !== null && lN) {
          effNiL = lN.niL; effNiR = lN.niR; effNiT = lN.niT; effNiB = lN.niB;
        }

        // Рассчитываем ПРЯМОУГОЛЬНИК СИЛУЭТА элемента (мм координаты в шкафу).
        // {x1, y1} — верхний левый угол, {x2, y2} — нижний правый.
        let x1, y1, x2, y2;

        if (pm === "stud") {
          // Стойка — узкая вертикальная полоска шириной t на полную высоту ниши.
          // Если зафиксирована цифра — ставим стойку точно так, чтобы зафиксированная
          // цифра была = введённому значению в мм.
          let studX;
          const parsedLV = typeof lV === "string" ? parseFloat(lV) : lV;
          if (lD === "A" && Number.isFinite(parsedLV) && parsedLV >= 0) {
            // A — левая колонка фиксирована = parsedLV мм → studX = effNiL + parsedLV
            studX = effNiL + parsedLV;
          } else if (lD === "B" && Number.isFinite(parsedLV) && parsedLV >= 0) {
            // B — правая колонка = parsedLV → studX + ct = effNiR - parsedLV → studX = effNiR - parsedLV - ct
            studX = effNiR - parsedLV - ct;
          } else {
            // Обычный режим (по курсору) — центрируется на X клика, кламп в [niL, niR-t].
            // Snap к соседям: центр стойки → центры/грани других стоек/панелей в нише.
            const rawCx = Math.round(proj.clickX);
            const { centers, edges } = collectSnapTargets("__placing__", "x");
            const r = applySnap(rawCx, [...centers, ...edges]);
            stateRef.current.activeSnap = { x: r.snapTo, y: null };
            studX = r.value - ct / 2;
          }
          // Кламп
          studX = Math.max(effNiL, Math.min(effNiR - ct, studX));
          x1 = studX; x2 = studX + ct;
          y1 = effNiT;   y2 = effNiB;
        } else if (pm === "shelf") {
          // Полка — горизонтальная полоска высотой t на полную ширину ниши.
          // Если зафиксирована цифра — ставим полку точно: A=верхний_проём, B=нижний_проём.
          const parsedLV = typeof lV === "string" ? parseFloat(lV) : lV;
          if (lD === "A" && Number.isFinite(parsedLV) && parsedLV >= 0) {
            // A — верхний проём = parsedLV → y1 = effNiT + parsedLV
            y1 = effNiT + parsedLV;
            y2 = y1 + ct;
          } else if (lD === "B" && Number.isFinite(parsedLV) && parsedLV >= 0) {
            // B — нижний проём = parsedLV → y2 = effNiB - parsedLV → y1 = y2 - ct
            y2 = effNiB - parsedLV;
            y1 = y2 - ct;
          } else {
            // Обычный режим — Smart-Y snap к краям ниши + snap к соседним полкам.
            const rawY = Math.round(proj.clickY);
            // Сначала пробуем snap к соседним полкам по семантике
            const { centers, edges, dividers } = collectSnapTargets("__placing__", "y");
            const all: number[] = [];
            all.push(...centers, ...dividers);
            for (const e of edges) {
              all.push(e + ct / 2, e - ct / 2);
            }
            const r = applySnap(rawY, all);
            stateRef.current.activeSnap = { x: null, y: r.snapTo };
            const shY = r.value;
            if (shY < niT + 5) { y1 = niT; y2 = niT + ct; }
            else if (shY > niB - 5) { y1 = niB - ct; y2 = niB; }
            else { y1 = shY - ct / 2; y2 = shY + ct / 2; }
          }
          // Кламп
          y1 = Math.max(effNiT, Math.min(effNiB - ct, y1));
          y2 = y1 + ct;
          x1 = effNiL; x2 = effNiR;
        } else if (pm === "rod") {
          // Штанга — тонкая (~25мм) горизонтальная палка.
          // A = верхний проём, B = нижний проём. Центр палки на clickY.
          const parsedLV = typeof lV === "string" ? parseFloat(lV) : lV;
          let rodY;
          if (lD === "A" && Number.isFinite(parsedLV) && parsedLV >= 0) {
            rodY = effNiT + parsedLV;
          } else if (lD === "B" && Number.isFinite(parsedLV) && parsedLV >= 0) {
            rodY = effNiB - parsedLV;
          } else {
            // Snap к соседям по Y
            const rawY = Math.round(proj.clickY);
            const { centers, edges } = collectSnapTargets("__placing__", "y");
            const r = applySnap(rawY, [...centers, ...edges]);
            stateRef.current.activeSnap = { x: null, y: r.snapTo };
            rodY = r.value;
          }
          rodY = Math.max(effNiT + 12, Math.min(effNiB - 12, rodY));
          y1 = rodY - 12; y2 = rodY + 12;
          x1 = effNiL;    x2 = effNiR;
        } else if (pm === "door" || pm === "panel") {
          // Дверь/панель — заполняет всю нишу (для insert вычитаем 3мм зазор).
          // Для overlay налезает на стенки на 14мм — но мы рисуем по нише insert-режима
          // как достаточное приближение.
          const GAP = 3;
          x1 = niL + GAP; x2 = niR - GAP;
          y1 = niT + GAP; y2 = niB - GAP;
        } else if (pm === "drawers") {
          // Ящики — заполняют весь проём.
          x1 = niL; x2 = niR;
          y1 = niT; y2 = niB;
        } else {
          x1 = niL; x2 = niR;
          y1 = niT; y2 = niB;
        }

        const w = x2 - x1;
        const h = y2 - y1;
        if (w <= 0 || h <= 0) {
          hideZone();
          return;
        }

        // ─── Размеры и позиция «фантома» элемента в 3D ───
        // Глубина зависит от типа элемента (как в реальной сцене Wardrobe3D).
        const cxMm = (x1 + x2) / 2;
        const cyMm = (y1 + y2) / 2;
        const cx = (cxMm - cW / 2) * S;
        const cy = (cH / 2 - cyMm) * S;
        const wM = w * S;
        const hM = h * S;

        // Глубина и Z-позиция для каждого типа элемента
        let depthM, zPos;
        if (pm === "door" || pm === "panel") {
          // Дверь/панель — тонкая (16мм) на передней грани шкафа
          depthM = ct * S;
          zPos = d / 2 + depthM / 2 + 0.001;
        } else if (pm === "rod") {
          // Штанга — тонкая трубка по середине глубины шкафа
          depthM = 0.025; // 25мм диаметр
          zPos = 0;
        } else {
          // Стойка / полка / ящики — на полную глубину шкафа минус задняя стенка
          depthM = d - 0.005;
          zPos = 0;
        }

        zoneHighlight.position.set(cx, cy, zPos);
        zoneHighlight.scale.set(1, 1, 1); // не трогаем — размеры через scale на mesh'ах

        // Заливка: solid box в реальных размерах элемента
        const fillMesh = zoneHighlight.userData.fillMesh;
        const edges = zoneHighlight.userData.edges;
        fillMesh.scale.set(wM, hM, depthM);
        // Outline — рёбра того же box (чуть больше чтобы был виден)
        edges.scale.set(wM * 1.01, hM * 1.01, depthM * 1.01);

        zoneHighlight.visible = true;

        // ─── Ghost-dim labels — 2 цифры рядом с фантомом ───
        // Для стойки: «левая_колонка / правая_колонка» (мм, что получится после постановки)
        // Для полки: «верхний_проём / нижний_проём»
        // Для двери/панели/ящиков: размеры самого элемента «W × H»
        const ghostA = ghostDimARef.current;
        const ghostB = ghostDimBRef.current;
        const projFn = stateRef.current.projectToScreen;
        if (ghostA && ghostB && projFn) {
          let textA = "", textB = "";
          let posA3D = null, posB3D = null;
          if (pm === "stud") {
            // Левая и правая будущие колонки
            const leftCol = x1 - niL;
            const rightCol = niR - x2;
            textA = `${leftCol}`;
            textB = `${rightCol}`;
            // Позиции: слева и справа от стойки на той же высоте
            const leftCx = ((niL + x1) / 2 - cW / 2) * S;
            const rightCx = ((x2 + niR) / 2 - cW / 2) * S;
            posA3D = { x: leftCx, y: cy, z: d / 2 + 0.06 };
            posB3D = { x: rightCx, y: cy, z: d / 2 + 0.06 };
          } else if (pm === "shelf") {
            // Верхний и нижний проёмы
            const topRow = y1 - niT;
            const botRow = niB - y2;
            textA = `${topRow}`;
            textB = `${botRow}`;
            const topCy = (cH / 2 - (niT + y1) / 2) * S;
            const botCy = (cH / 2 - (y2 + niB) / 2) * S;
            posA3D = { x: cx, y: topCy, z: d / 2 + 0.06 };
            posB3D = { x: cx, y: botCy, z: d / 2 + 0.06 };
          } else if (pm === "door" || pm === "panel" || pm === "drawers") {
            // Размер самого элемента W × H
            textA = `${w}`;
            textB = `${h}`;
            // Позиции: ширина снизу от элемента, высота — слева от элемента
            posA3D = { x: cx, y: cy - hM / 2 - 0.04, z: d / 2 + 0.06 };
            posB3D = { x: cx - wM / 2 - 0.04, y: cy, z: d / 2 + 0.06 };
          } else if (pm === "rod") {
            // Длина штанги
            textA = `${w}`;
            posA3D = { x: cx, y: cy - 0.04, z: d / 2 + 0.06 };
          }

          // Когда lockedDim активен — НЕ двигаем позицию/текст активного badge.
          // Это предотвращает blur/перерисовку input'а при каждом animate-tick.
          const aFrozen = lD === "A";
          const bFrozen = lD === "B";
          if (posA3D && !aFrozen) {
            const pA = projFn(posA3D.x, posA3D.y, posA3D.z);
            if (pA.visible) {
              ghostA.style.display = "";
              ghostA.style.left = `${pA.px}px`;
              ghostA.style.top = `${pA.py}px`;
              // Не перезаписываем содержимое, если badge в lock-режиме (внутри input)
              if (!ghostA.querySelector("input")) {
                ghostA.textContent = textA;
              }
            } else {
              ghostA.style.display = "none";
            }
          } else if (!aFrozen) {
            ghostA.style.display = "none";
          }
          if (posB3D && !bFrozen) {
            const pB = projFn(posB3D.x, posB3D.y, posB3D.z);
            if (pB.visible) {
              ghostB.style.display = "";
              ghostB.style.left = `${pB.px}px`;
              ghostB.style.top = `${pB.py}px`;
              if (!ghostB.querySelector("input")) {
                ghostB.textContent = textB;
              }
            } else {
              ghostB.style.display = "none";
            }
          } else if (!bFrozen) {
            ghostB.style.display = "none";
          }
        }
      };

      const onPointerDown = e => {
        // На тач-устройствах предотвращаем скролл страницы
        if (e.pointerType === 'touch') e.preventDefault();
        // Если был зафиксированный фантом ожидающий ОК — сбрасываем,
        // пользователь начал новый жест (двигать фантом на новое место).
        setPendingPlace(null);
        // Drag разрешён ВСЕГДА — даже в placeMode (чтобы можно было крутить сцену
        // перед постановкой элемента). Различение drag vs click делается в onPointerUp
        // по дистанции (CLICK_THRESHOLD_PX) и времени (CLICK_THRESHOLD_MS).
        isDragging = true;
        prevX = e.clientX;
        prevY = e.clientY;
        downX = e.clientX;
        downY = e.clientY;
        downTime = Date.now();
        renderer.domElement.setPointerCapture(e.pointerId);

        // ─── Long-press для drag-n-drop существующего элемента ───
        // Запускаем таймер для ЛЮБОГО элемента под курсором (не только уже
        // выделенного). Это убирает лишний шаг «сначала выделить — потом
        // зажать»: сейчас одно нажатие = выделить + drag.
        // При движении до 500мс таймер отменяется (это был жест вращения).
        const { placeMode: pmd, elements: els } = propsRef.current;
        if (!pmd) {
          const rect = renderer.domElement.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(ndc, camera);
          const hits = raycaster.intersectObject(group, true);
          const hit = hits.find(h => h.object?.userData?.elementId);
          if (hit) {
            const hitId = hit.object.userData.elementId;
            // Запускаем таймер long-press
            stateRef.current.longPressTimer = setTimeout(() => {
              const srcEl = els.find(x => x.id === hitId);
              if (!srcEl) return;
              // Хаптик на тач
              if (e.pointerType === "touch" && navigator.vibrate) navigator.vibrate(30);
              // Выделяем элемент (если не был выделен) и сразу запускаем drag
              if (onElementClick) onElementClick(hitId);
              setDrag3d({ id: hitId, type: srcEl.type, origEl: srcEl });
              isDragging = false; // отключаем вращение во время drag элемента
            }, 500);
          }
        }
      };
      const onPointerMove = e => {
        const { placeMode: pm, pendingPlace: pp, drag3d: d3d } = propsRef.current;
        // Если фантом зафиксирован (ждём ОК) — не двигаем
        if (pp) return;

        // ─── Обработка drag-n-drop существующего элемента ───
        // Если активен режим drag3d — двигаем элемент за курсором/пальцем.
        if (d3d && d3d.id) {
          const proj = screenToCabinetMm(e.clientX, e.clientY);
          if (!proj) return;
          moveDraggedElement3D(d3d, proj.clickX, proj.clickY);
          return;
        }

        // Если идёт обычный drag и пользователь сдвинул палец — отменяем long-press timer
        // (это был жест «покрутить» а не «долгое нажатие»).
        if (stateRef.current.longPressTimer) {
          const dxLP = e.clientX - downX;
          const dyLP = e.clientY - downY;
          if (Math.sqrt(dxLP * dxLP + dyLP * dyLP) >= CLICK_THRESHOLD_PX) {
            clearTimeout(stateRef.current.longPressTimer);
            stateRef.current.longPressTimer = null;
          }
        }

        // Если идёт drag (мышь зажата и движется) — крутим сцену.
        // Иначе (просто hover в placeMode) — обновляем подсветку зоны.
        if (isDragging) {
          // Различаем «настоящий drag» от «дёрнул мышью при клике» по порогу:
          // если переместились дальше CLICK_THRESHOLD_PX — это уже точно drag
          const dx = e.clientX - downX;
          const dy = e.clientY - downY;
          const totalDist = Math.sqrt(dx * dx + dy * dy);
          if (totalDist >= CLICK_THRESHOLD_PX) {
            // ВАЖНО: на touch-устройствах в placeMode НЕ крутим сцену.
            // Палец просто двигает фантом по сцене (как мышь без зажатия).
            // Без этого один палец одновременно: ① крутит камеру, ② двигает фантом —
            // и пользователь не понимает что ставится.
            // Pinch-zoom (2 пальца) обрабатывается отдельно в onTouchMove.
            if (pm && e.pointerType === "touch") {
              // Двигаем фантом за пальцем
              const { lockedDim: lD } = propsRef.current;
              if (lD === null) {
                stateRef.current.lastMouseX = e.clientX;
                stateRef.current.lastMouseY = e.clientY;
                updateZoneHighlight(e.clientX, e.clientY);
              }
              return;
            }
            // Это вращение (мышь на десктопе, или touch без placeMode)
            rotY += (e.clientX - prevX) * 0.004;
            rotX = Math.max(-1.0, Math.min(1.0, rotX + (e.clientY - prevY) * 0.004));
            prevX = e.clientX;
            prevY = e.clientY;
            // В placeMode при настоящем drag (мышь) скрываем подсветку (мы крутим, не выбираем)
            if (pm) hideZone();
          }
          return;
        }
        // Hover без зажатой кнопки — только в placeMode обновляем подсветку
        if (pm) {
          // Запомним координаты курсора — нужно чтобы при наборе в input пересчитать
          // фантом из той же точки что выбрал пользователь.
          stateRef.current.lastMouseX = e.clientX;
          stateRef.current.lastMouseY = e.clientY;
          // Если зафиксирована цифра (пользователь набирает в input) — мышь НЕ двигает фантом.
          // Фантом пересчитывается только при изменении lockedValue (через updateHighlightFromLock).
          const { lockedDim: lD } = propsRef.current;
          if (lD !== null) return;
          updateZoneHighlight(e.clientX, e.clientY);
        }
      };
      const onPointerUp = (e) => {
        const wasTouch = e?.pointerType === "touch";
        const wasDragging = isDragging;
        isDragging = false;
        // Отмена long-press таймера (если был но не успел сработать)
        if (stateRef.current.longPressTimer) {
          clearTimeout(stateRef.current.longPressTimer);
          stateRef.current.longPressTimer = null;
        }
        // Завершение drag3d — коммитим pending обновление сразу при отпускании
        // (как при placement новой стойки/полки). Если у пользователя в данный
        // момент открыт popup точного ввода (drag3dInput) — пропускаем коммит,
        // popup сам решит позицию.
        if (propsRef.current.drag3d) {
          // Если popup уже открыт — пользователь набирает точное число, не трогаем
          if (propsRef.current.drag3dInput) return;
          const pending = stateRef.current.drag3dPending;
          if (pending && updateEl) {
            const upd = {};
            if (pending.next.x !== undefined) upd.x = pending.next.x;
            if (pending.next.y !== undefined) upd.y = pending.next.y;
            const orig = propsRef.current.drag3d?.origEl || {};
            const dragType = propsRef.current.drag3d?.type;
            // Дверь: помечаем manualW/manualH чтобы adjust() не пересчитал
            if (dragType === "door") {
              upd.manualW = true;
              upd.manualH = true;
              if (orig.w) upd.w = orig.w;
              if (orig.h) upd.h = orig.h;
            }
            // Авто-подгонка ширины: drawers всегда, panel только если insert
            const isInsertPanel = dragType === "panel" && orig.panelType === "insert";
            if (dragType === "drawers" || isInsertPanel) {
              const fdb = propsRef.current.findDoorBounds;
              const ct = propsRef.current.t;
              const defaultH = dragType === "drawers" ? 450 : 600;
              const defaultW = dragType === "drawers" ? 400 : 400;
              const newX = upd.x ?? orig.x ?? 0;
              const newY = upd.y ?? orig.y ?? 0;
              const cyMm = newY + (orig.h || defaultH) / 2;
              const cxMm = newX + (orig.w || defaultW) / 2;
              if (fdb) {
                const bounds = fdb(cxMm, cyMm);
                if (bounds) {
                  const innerLeft = bounds.left.x + (bounds.left.isWall ? 0 : ct);
                  const innerRight = bounds.right.x;
                  const innerW = Math.max(100, innerRight - innerLeft);
                  upd.x = innerLeft;
                  upd.w = innerW;
                }
              }
            }
            updateEl(pending.id, upd);
          }
          // Сброс drag3d состояния — useEffect cleanup для drag3d.id уберёт
          // фантом и цифры
          stateRef.current.drag3dPending = null;
          stateRef.current.drag3dLabelPositions = null;
          setDrag3d(null);
          return;
        }
        const { placeMode: pm, placeInZone: piz, setPlaceMode: spm, t: ct } = propsRef.current;
        // Короткий клик (не drag)?
        const dx = (e?.clientX ?? 0) - downX;
        const dy = (e?.clientY ?? 0) - downY;
        const dt = Date.now() - downTime;
        const isClick = Math.sqrt(dx * dx + dy * dy) < CLICK_THRESHOLD_PX && dt < CLICK_THRESHOLD_MS;
        // На touch в placeMode после РЕАЛЬНОГО drag (двигал палец по сцене) — НЕ ставим
        // элемент сразу, а фиксируем фантом и показываем плашку ОК. Это даёт
        // пользователю шанс тапнуть на жёлтую цифру и ввести точный размер
        // вместо моментальной постановки.
        // Короткий тап (без drag) — ставим как раньше.
        const isTouchDragPlace = wasTouch && pm && wasDragging && !isClick;
        if (isTouchDragPlace) {
          // Зафиксировать фантом в текущем месте: фантом уже отрисован updateZoneHighlight
          // на координатах последнего pointermove. Сохраняем эти координаты.
          // Применяем snap к тем же осям что и в фантоме чтобы зафиксированная
          // позиция совпадала с визуально показанной.
          const proj = screenToCabinetMm(e.clientX, e.clientY);
          if (proj) {
            const pmTouch = propsRef.current.placeMode;
            let { clickX, clickY } = proj;
            if (pmTouch === "stud") {
              const { centers, edges } = collectSnapTargets("__placing__", "x");
              const r = applySnap(Math.round(clickX), [...centers, ...edges]);
              clickX = r.value;
            } else if (pmTouch === "shelf") {
              const { centers, edges, dividers } = collectSnapTargets("__placing__", "y");
              const all: number[] = [];
              all.push(...centers, ...dividers);
              for (const e of edges) all.push(e + ct / 2, e - ct / 2);
              const r = applySnap(Math.round(clickY), all);
              clickY = r.value;
            } else if (pmTouch === "rod") {
              const { centers, edges } = collectSnapTargets("__placing__", "y");
              const r = applySnap(Math.round(clickY), [...centers, ...edges]);
              clickY = r.value;
            }
            setPendingPlace({ clickX, clickY });
          }
          return;
        }
        if (!isClick) return;

        // Логика клика:
        // 1. Если placeMode АКТИВЕН → всегда ставим элемент в зоне (где жёлтый фантом),
        //    даже если курсор попал на существующий элемент. Это критично — иначе
        //    нельзя поставить панель в проем рядом со стойкой (клик попадал бы на стойку
        //    и выделял её вместо постановки панели).
        // 2. Если placeMode ВЫКЛЮЧЕН → проверяем попадание по элементу для выделения.
        if (pm && piz) {
          // ─── Режим постановки: проекция → placeInZone ───
          const proj = screenToCabinetMm(e.clientX, e.clientY);
          if (proj) {
            // Применяем snap к координатам клика (как в фантоме фантоме postaviti).
            // Раньше snap менял только визуал фантома — а сам placeInZone получал
            // сырые clickX/clickY и ставил элемент мимо snap-цели.
            let { clickX, clickY } = proj;
            if (pm === "stud") {
              const { centers, edges } = collectSnapTargets("__placing__", "x");
              const r = applySnap(Math.round(clickX), [...centers, ...edges]);
              clickX = r.value;
            } else if (pm === "shelf") {
              const { centers, edges, dividers } = collectSnapTargets("__placing__", "y");
              const all: number[] = [];
              all.push(...centers, ...dividers);
              for (const e of edges) all.push(e + ct / 2, e - ct / 2);
              const r = applySnap(Math.round(clickY), all);
              clickY = r.value;
            } else if (pm === "rod") {
              const { centers, edges } = collectSnapTargets("__placing__", "y");
              const r = applySnap(Math.round(clickY), [...centers, ...edges]);
              clickY = r.value;
            }
            piz(null, clickX, clickY);
            hideZone();
          }
          return;
        }

        // placeMode выключен → обычное выделение существующего элемента
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(group, true);
        const hit = hits.find(h => h.object?.userData?.elementId);

        if (hit && onElementClick) {
          hideZone();
          onElementClick(hit.object.userData.elementId);
          return;
        }
        // ─── Обычный режим: снимаем выделение ───
        if (onElementClick) onElementClick(null);
      };

      // ── Touch: pinch-zoom двумя пальцами ──────────────
      let pinchStartDist = 0;
      let pinchStartZoom = 1;
      const onTouchStart = e => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          pinchStartDist = Math.sqrt(dx * dx + dy * dy);
          pinchStartZoom = zoom;
          isDragging = false; // при pinch отключаем вращение
        }
      };
      const onTouchMove = e => {
        if (e.touches.length === 2 && pinchStartDist > 0) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist2 = Math.sqrt(dx * dx + dy * dy);
          zoom = Math.max(0.3, Math.min(3, pinchStartZoom * (pinchStartDist / dist2)));
          return;
        }
        // На телефоне в placeMode — одиночный палец двигает фантом (как мышь на ПК).
        // Без этого pointermove не срабатывает на тач-устройствах для одного пальца.
        if (e.touches.length === 1) {
          const { placeMode: pm, lockedDim: lD, drag3d: d3d } = propsRef.current;
          const t0 = e.touches[0];
          // Drag3d активен → двигаем существующий элемент за пальцем
          if (d3d?.id) {
            const proj = screenToCabinetMm(t0.clientX, t0.clientY);
            if (proj) moveDraggedElement3D(d3d, proj.clickX, proj.clickY);
            return;
          }
          if (pm && lD === null) {
            stateRef.current.lastMouseX = t0.clientX;
            stateRef.current.lastMouseY = t0.clientY;
            updateZoneHighlight(t0.clientX, t0.clientY);
          }
        }
      };
      const onTouchEnd = () => {
        pinchStartDist = 0;
      };

      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointercancel", onPointerUp);
      renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: false });
      renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: false });
      renderer.domElement.addEventListener("touchend", onTouchEnd);
      renderer.domElement.addEventListener("touchcancel", onTouchEnd);
      // Предотвращаем скролл браузера на канвасе
      renderer.domElement.style.touchAction = "none";

      // Throttle для updateDimLabels — не каждый кадр, а раз в 2 кадра (30fps достаточно)
      let dimFrameSkip = 0;
      // Вспомогательная: проецирует 3D-точку → pixel coords относительно canvas
      const _proj = new THREE.Vector3();
      const projectToScreen = (x, y, z) => {
        _proj.set(x, y, z);
        _proj.project(camera);
        // NDC (-1..1) → pixels
        const rect = renderer.domElement.getBoundingClientRect();
        const px = (_proj.x * 0.5 + 0.5) * rect.width;
        const py = (1 - (_proj.y * 0.5 + 0.5)) * rect.height;
        const visible = _proj.z < 1; // точка перед камерой
        return { px, py, visible };
      };

      // Обновляет SVG-элементы размерных линий.
      // dimLabelsRef.current.groups: Map<key, { g: SVGGElement, p1, p2, offset3d, axis }>
      const updateDimLabels = () => {
        const groups = dimLabelsRef.current.groups;
        if (!groups) return;
        groups.forEach(({ g, p1, p2, offset3d, axis }) => {
          // Проецируем p1, p2 и их смещённые варианты
          const sp1 = projectToScreen(p1.x, p1.y, p1.z);
          const sp2 = projectToScreen(p2.x, p2.y, p2.z);
          const dp1 = projectToScreen(p1.x + offset3d.x, p1.y + offset3d.y, p1.z + offset3d.z);
          const dp2 = projectToScreen(p2.x + offset3d.x, p2.y + offset3d.y, p2.z + offset3d.z);
          if (!sp1.visible || !sp2.visible || !dp1.visible || !dp2.visible) {
            g.style.display = "none";
            return;
          }
          g.style.display = "";
          // Выносные линии (sp → dp)
          const ext1 = g.querySelector('[data-ext="1"]');
          const ext2 = g.querySelector('[data-ext="2"]');
          ext1.setAttribute("x1", sp1.px); ext1.setAttribute("y1", sp1.py);
          ext1.setAttribute("x2", dp1.px); ext1.setAttribute("y2", dp1.py);
          ext2.setAttribute("x1", sp2.px); ext2.setAttribute("y1", sp2.py);
          ext2.setAttribute("x2", dp2.px); ext2.setAttribute("y2", dp2.py);
          // Размерная линия между смещёнными точками
          const dimLine = g.querySelector('[data-dim-line="1"]');
          dimLine.setAttribute("x1", dp1.px); dimLine.setAttribute("y1", dp1.py);
          dimLine.setAttribute("x2", dp2.px); dimLine.setAttribute("y2", dp2.py);
          // Текст — в середине размерной линии, сдвинут на ~12px перпендикулярно наружу
          const text = g.querySelector('[data-dim-text="1"]');
          const midX = (dp1.px + dp2.px) / 2;
          const midY = (dp1.py + dp2.py) / 2;
          // Нормаль к линии (для сдвига текста наружу от шкафа)
          const lineDx = dp2.px - dp1.px;
          const lineDy = dp2.py - dp1.py;
          const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy) || 1;
          // Нормаль — в сторону от измеряемого отрезка (sp → dp направление)
          const outDx = (dp1.px - sp1.px + dp2.px - sp2.px) / 2;
          const outDy = (dp1.py - sp1.py + dp2.py - sp2.py) / 2;
          const outLen = Math.sqrt(outDx * outDx + outDy * outDy) || 1;
          const offPx = 10;
          const tx = midX + (outDx / outLen) * offPx;
          const ty = midY + (outDy / outLen) * offPx;
          text.setAttribute("x", tx);
          text.setAttribute("y", ty);
          text.textContent = g.dataset.text || "";
        });
      };

      // Сохраняем projectToScreen в stateRef — пригодится для фантома при placeMode
      stateRef.current.projectToScreen = projectToScreen;
      stateRef.current.updateDimLabels = updateDimLabels;
      stateRef.current.updateZoneHighlight = updateZoneHighlight;

      // ── updateEditDimLabels — 2 жёлтые цифры глубины у выделенного элемента ──
      // Показываем только если selEl — panel insert или rod.
      // A = спереди (утоплено от передней грани), B = сзади (до задней стенки).
      const updateEditDimLabels = () => {
        const { selEl: sE, editDim: eD } = propsRef.current;
        const aEl = editDimARef.current;
        const bEl = editDimBRef.current;
        if (!aEl || !bEl) return;
        if (!sE) {
          aEl.style.display = "none";
          bEl.style.display = "none";
          return;
        }
        // Определяем тип и размеры
        const D = corpus.depth;
        const isPanelInsert = sE.type === "panel" && sE.panelType === "insert";
        const isRod = sE.type === "rod";
        if (!isPanelInsert && !isRod) {
          aEl.style.display = "none";
          bEl.style.display = "none";
          return;
        }
        // Толщина элемента по Z и позиция центра (в мм от центра шкафа)
        let objT, centerZmm;
        if (isPanelInsert) {
          objT = t;
          // Из рендера: если depthOffset/depth заданы — используем, иначе insert = d/2 - t/2 - 2 (2мм зазор)
          const hasOff = typeof sE.depthOffset === "number";
          if (hasOff) {
            const off = sE.depthOffset;
            const dp = typeof sE.depth === "number" ? sE.depth : objT;
            centerZmm = -D / 2 + off + dp / 2;
          } else {
            centerZmm = D / 2 - objT / 2 - 2; // 2мм зазор
          }
        } else {
          // rod
          objT = 25;
          centerZmm = sE.z ?? 0;
        }
        // A = D/2 - (centerZmm + objT/2)  (от передней грани до переда элемента)
        // B = (centerZmm - objT/2) - (-D/2) = centerZmm - objT/2 + D/2
        const A = Math.round(D / 2 - (centerZmm + objT / 2));
        const B = Math.round(centerZmm - objT / 2 + D / 2);
        // 3D-координаты элемента для позиционирования подписи
        const elX = isPanelInsert
          ? ((sE.x || 0) + (sE.w || 400) / 2 - iW / 2) * S
          : ((sE.x || 0) + (sE.w || 400) / 2 - iW / 2) * S;
        const elY = isPanelInsert
          ? (iH / 2 - ((sE.y || 0) + (sE.h || iH) / 2)) * S
          : (iH / 2 - (sE.y || 150)) * S;
        const centerZ = centerZmm * S;
        const objTm = objT * S;
        // Подпись A — между передней гранью шкафа и элементом (центр по Z)
        const aCenterZ = (d / 2 + centerZ + objTm / 2) / 2;
        // Подпись B — между задней гранью элемента и задней стенкой
        const bCenterZ = (centerZ - objTm / 2 + (-d / 2)) / 2;
        // Правее элемента для видимости (смещение вправо по X)
        const offX = Math.max(elX + (isPanelInsert ? (sE.w || 400) * S / 2 : 0) + 0.04, 0);
        const pA = projectToScreen(offX, elY, aCenterZ);
        const pB = projectToScreen(offX, elY, bCenterZ);
        // Когда editDim активен — НЕ обновляем позицию/текст активного badge.
        // Позиция "замораживается" в момент активации, чтобы input не дёргался
        // при каждом animate-tick (особенно на мобильных где reflow → blur).
        // Неактивный badge продолжает обновляться нормально.
        const aFrozen = eD === "A";
        const bFrozen = eD === "B";
        if (pA.visible && !aFrozen) {
          aEl.style.display = "";
          aEl.style.left = `${pA.px}px`;
          aEl.style.top = `${pA.py}px`;
          if (!aEl.querySelector("input")) aEl.textContent = `${A}`;
        } else if (!aFrozen) {
          aEl.style.display = "none";
        }
        if (pB.visible && !bFrozen) {
          bEl.style.display = "";
          bEl.style.left = `${pB.px}px`;
          bEl.style.top = `${pB.py}px`;
          if (!bEl.querySelector("input")) bEl.textContent = `${B}`;
        } else if (!bFrozen) {
          bEl.style.display = "none";
        }
      };
      stateRef.current.updateEditDimLabels = updateEditDimLabels;

      const animate = () => {
        stateRef.current.animId = requestAnimationFrame(animate);
        if (!isDragging) {} // no auto-rotation — manual only
        // Сохраняем текущее положение камеры в ref — чтобы при следующем rebuild
        // (добавление элемента, смена текстуры и т.д.) восстановить угол/зум.
        cameraRef.current.rotY = rotY;
        cameraRef.current.rotX = rotX;
        cameraRef.current.zoom = zoom;
        const dd = dist * zoom;
        camera.position.set(
          Math.sin(rotY) * Math.cos(rotX) * dd,
          Math.sin(rotX) * dd,
          Math.cos(rotY) * Math.cos(rotX) * dd
        );
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        // Обновляем подписи (throttle через frame skip)
        dimFrameSkip = (dimFrameSkip + 1) % 2;
        if (dimFrameSkip === 0) {
          updateDimLabels();
          updateEditDimLabels();
          // Перепроецирование цифр drag3d при вращении сцены — позиции 3D
          // фиксированы в drag3dPositions, но screen координата меняется.
          const dragPos = stateRef.current.drag3dLabelPositions;
          const ghostA = ghostDimARef.current;
          const ghostB = ghostDimBRef.current;
          if (dragPos && propsRef.current.drag3d) {
            if (ghostA && dragPos.A) {
              const pA = projectToScreen(dragPos.A.x, dragPos.A.y, dragPos.A.z);
              if (pA?.visible) {
                ghostA.style.display = "";
                ghostA.style.left = `${pA.px}px`;
                ghostA.style.top = `${pA.py}px`;
              } else {
                ghostA.style.display = "none";
              }
            }
            if (ghostB && dragPos.B) {
              const pB = projectToScreen(dragPos.B.x, dragPos.B.y, dragPos.B.z);
              if (pB?.visible) {
                ghostB.style.display = "";
                ghostB.style.left = `${pB.px}px`;
                ghostB.style.top = `${pB.py}px`;
              } else {
                ghostB.style.display = "none";
              }
            }
          } else {
            // Нет активного drag3d — прячем призрачные подписи. Иначе после
            // удаления элемента они зависают на экране до следующего drag.
            if (ghostA && ghostA.style.display !== "none" && !propsRef.current.placeMode) {
              ghostA.style.display = "none";
            }
            if (ghostB && ghostB.style.display !== "none" && !propsRef.current.placeMode) {
              ghostB.style.display = "none";
            }
          }
          // Snap-индикатор — жёлтые пунктирные линии показывающие к чему прилип фантом.
          // Рисуем линию на передней грани шкафа через всю ширину/высоту корпуса.
          const snapLineX = dimsOverlayRef.current?.querySelector('[data-snap-line="x"]');
          const snapLineY = dimsOverlayRef.current?.querySelector('[data-snap-line="y"]');
          const activeSnap = stateRef.current.activeSnap;
          // Snap-линии рисуются когда активен drag3d ИЛИ placeMode (фантом placement).
          if ((propsRef.current.drag3d || propsRef.current.placeMode) && activeSnap) {
            const cWmm = propsRef.current.iW;
            const cHmm = propsRef.current.iH;
            const Sloc = 1 / 1000;
            const halfD = d / 2 + 5 * Sloc; // передняя грань корпуса + 5мм
            // Snap по X — вертикальная линия через высоту корпуса
            if (snapLineX && activeSnap.x !== null) {
              const xWorld = (activeSnap.x - cWmm / 2) * Sloc;
              const top3D = { x: xWorld, y: cHmm / 2 * Sloc, z: halfD };
              const bot3D = { x: xWorld, y: -cHmm / 2 * Sloc, z: halfD };
              const pT = projectToScreen(top3D.x, top3D.y, top3D.z);
              const pB = projectToScreen(bot3D.x, bot3D.y, bot3D.z);
              if (pT?.visible && pB?.visible) {
                snapLineX.setAttribute("x1", pT.px);
                snapLineX.setAttribute("y1", pT.py);
                snapLineX.setAttribute("x2", pB.px);
                snapLineX.setAttribute("y2", pB.py);
                snapLineX.style.display = "";
              } else {
                snapLineX.style.display = "none";
              }
            } else if (snapLineX) {
              snapLineX.style.display = "none";
            }
            // Snap по Y — горизонтальная линия через ширину корпуса
            if (snapLineY && activeSnap.y !== null) {
              const yWorld = (cHmm / 2 - activeSnap.y) * Sloc;
              const left3D = { x: -cWmm / 2 * Sloc, y: yWorld, z: halfD };
              const right3D = { x: cWmm / 2 * Sloc, y: yWorld, z: halfD };
              const pL = projectToScreen(left3D.x, left3D.y, left3D.z);
              const pR = projectToScreen(right3D.x, right3D.y, right3D.z);
              if (pL?.visible && pR?.visible) {
                snapLineY.setAttribute("x1", pL.px);
                snapLineY.setAttribute("y1", pL.py);
                snapLineY.setAttribute("x2", pR.px);
                snapLineY.setAttribute("y2", pR.py);
                snapLineY.style.display = "";
              } else {
                snapLineY.style.display = "none";
              }
            } else if (snapLineY) {
              snapLineY.style.display = "none";
            }
          } else {
            if (snapLineX) snapLineX.style.display = "none";
            if (snapLineY) snapLineY.style.display = "none";
          }
        }
      };
      animate();

      const onResize = () => {
        if (!mountRef.current) return;
        camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
      };
      window.addEventListener("resize", onResize);

      stateRef.current.cleanup = () => {
        cancelAnimationFrame(stateRef.current.animId);
        renderer.domElement.removeEventListener("wheel", onWheel);
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointercancel", onPointerUp);
        renderer.domElement.removeEventListener("touchstart", onTouchStart);
        renderer.domElement.removeEventListener("touchmove", onTouchMove);
        renderer.domElement.removeEventListener("touchend", onTouchEnd);
        renderer.domElement.removeEventListener("touchcancel", onTouchEnd);
        window.removeEventListener("resize", onResize);

        // ═══ Полная очистка сцены ═══
        // Without this, each 2D↔3D switch leaves all geometries/materials/textures
        // in GPU memory and eventually leads to "Too many active WebGL contexts" warning.
        // Обходим все объекты в сцене и освобождаем их GPU-ресурсы.
        const disposeMaterial = (mat) => {
          if (!mat) return;
          // Освобождаем все текстуры материала
          for (const key of Object.keys(mat)) {
            const value = mat[key];
            if (value && value.isTexture) {
              value.dispose();
            }
          }
          mat.dispose?.();
        };
        scene.traverse((obj) => {
          // Geometry
          obj.geometry?.dispose?.();
          // Material (может быть массив для multi-material)
          const m = obj.material;
          if (Array.isArray(m)) {
            m.forEach(disposeMaterial);
          } else if (m) {
            disposeMaterial(m);
          }
        });
        // Также освобождаем загруженные текстуры корпуса/фасада (кэш в модуле).
        // Не вызываем loadTex.dispose() — loadTex — это наш helper, не объект.
        // Используем clear() на сцене чтобы убрать ссылки.
        cTex?.dispose?.();
        fTex?.dispose?.();
        scene.clear();

        // Освобождаем сам renderer и его WebGL context.
        renderer.dispose();
        // forceContextLoss явно говорит драйверу GPU "забудь этот context".
        // Без этого, несмотря на dispose(), браузер держит контекст в пуле и
        // после нескольких переключений упирается в лимит (обычно 16 контекстов).
        renderer.forceContextLoss?.();

        // Убираем canvas из DOM, чтобы React не хранил ссылку на старый элемент.
        if (renderer.domElement?.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      };
    });

    return () => {
      cancelled = true;
      stateRef.current.cleanup?.();
    };
  }, [build]);

  // Синхронизация outline-подсветки с selId (обновляется без полного перестроения сцены)
  useEffect(() => {
    if (stateRef.current.updateOutline) {
      stateRef.current.updateOutline(selId);
    }
  }, [selId]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.97)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: "1px solid #1a1a1a",
        background: "rgba(8,9,12,0.95)",
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: "linear-gradient(135deg, #60a5fa, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 900, fontSize: 10,
            fontFamily: "'IBM Plex Mono',monospace",
            boxShadow: "0 2px 8px rgba(96,165,250,0.3)",
          }}>3D</div>
          <div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "#d1d5db",
              fontFamily: "'IBM Plex Mono',monospace",
            }}>3D Редактор · ЛДСП</div>
            <div style={{
              fontSize: 10, color: "#444",
              fontFamily: "'IBM Plex Mono',monospace",
            }}>
              {corpus.width}×{corpus.height}×{corpus.depth} мм · Кромка · Петли · ДВП
              <span style={{ marginLeft: 8, color: "#555" }}>Палец = вращение · 2 пальца = зум · клик = выделить</span>
            </div>
          </div>
        </div>

        {/* Шапка теперь содержит только заголовок и описание шкафа.
            Добавление элементов — через FAB ("+") справа внизу canvas (на всех устройствах).
            Переключение на 2D — через кнопку в верхнем левом углу canvas рядом с «Размеры». */}
      </div>

      {/* BODY: 3D canvas + right panel (desktop) или bottom sheet (mobile) */}
      <div style={{
        flex: 1, display: "flex",
        flexDirection: isMobile ? "column" : "row",
        minHeight: 0,
      }}>
        {/* 3D canvas + индикатор placeMode сверху */}
        {/* minWidth: 0 — обязательно, иначе flex-child с content 100% распирает себя
            и соседа (PropsPanel3D width:320) выпихивает за экран, из-за чего панель
            свойств кажется "невидимой" хотя рендерится. */}
        <div style={{ flex: 1, position: "relative", minHeight: 0, minWidth: 0 }}>
          <div ref={mountRef} style={{
            width: "100%", height: "100%",
            cursor: placeMode ? "crosshair" : "grab",
          }} />

          {/* SVG overlay — чертёжные размерные линии с рисками и цифрами */}
          <svg
            ref={dimsOverlayRef}
            style={{
              position: "absolute", inset: 0,
              pointerEvents: "none",
              overflow: "visible",
              zIndex: 5,
            }}
            width="100%" height="100%"
          >
            {dimsData.map(d => {
              // Общие габариты корпуса (W/H/D) — кликабельные для редактирования.
              // Тап на цифру → popup с input → setCorpus({ ширина/высота/глубина })
              const isCorpusDim = d.key === "total-w" || d.key === "total-h" || d.key === "total-d";
              return (
                <g key={d.key} data-dim-key={d.key} style={{ display: "none" }}>
                  <line data-ext="1" stroke="#94a3b8" strokeWidth="1" opacity="0.7" />
                  <line data-ext="2" stroke="#94a3b8" strokeWidth="1" opacity="0.7" />
                  <line data-dim-line="1" stroke="#cbd5e1" strokeWidth="1.3" markerStart="url(#dim-tick)" markerEnd="url(#dim-tick)" />
                  <text
                    data-dim-text="1"
                    fill={isCorpusDim ? "#fbbf24" : "#e2e8f0"}
                    fontSize="13"
                    fontFamily="'IBM Plex Mono', monospace"
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="central"
                    stroke="#08090c"
                    strokeWidth="3"
                    paintOrder="stroke"
                    style={isCorpusDim && setCorpus ? { cursor: "pointer", pointerEvents: "auto" } : undefined}
                    onClick={isCorpusDim && setCorpus ? (() => {
                      const dim = d.key === "total-w" ? "width" : d.key === "total-h" ? "height" : "depth";
                      setCorpusEditDim(dim);
                    }) : undefined}
                  />
                </g>
              );
            })}
            {/* Snap-индикатор: жёлтые линии когда фантом прилип к соседу.
                Обновляются в animate-loop через updateSnapIndicator. */}
            <line data-snap-line="x" stroke="#fbbf24" strokeWidth="1" strokeDasharray="4,3" opacity="0.85" style={{ display: "none" }} />
            <line data-snap-line="y" stroke="#fbbf24" strokeWidth="1" strokeDasharray="4,3" opacity="0.85" style={{ display: "none" }} />
            {/* Markers для рисок */}
            <defs>
              <marker id="dim-tick" viewBox="-5 -5 10 10" refX="0" refY="0" markerWidth="8" markerHeight="8" orient="auto">
                <line x1="-3" y1="-3" x2="3" y2="3" stroke="#cbd5e1" strokeWidth="1.5" />
              </marker>
            </defs>
          </svg>

          {/* Ghost-dim labels (2 цифры) — обновляются напрямую в updateZoneHighlight.
              При placeMode: для стойки показывают левую/правую будущие колонки,
              для полки — верхний/нижний проёмы, для двери/панели/ящиков — собственные размеры.
              Цвет жёлтый (соответствует фантому), display:none по умолчанию.
              Стойка (Этап 1): активация режима ввода по клавише Space (см. useEffect).
              Space циклически переключает: null → A → B → A. Enter = commit, Escape = cancel. */}
          {/* Ghost-dim labels (4 штуки: 2 для placement A/B, 2 для edit-Z A/B).
              Они — просто жёлтые цифры рядом с элементом/фантомом. Ввод
              значений идёт в отдельном LockInputPopup (фикс. позиция сверху),
              чтобы input не перерисовывался при движении сцены. */}
          <GhostDimBadge
            refEl={ghostDimARef}
            isActive={lockedDim === "A" || drag3dInput?.side === "A"}
            onClick={
              drag3d ? () => setDrag3dInput({ side: "A" }) :
              placeMode ? () => {
                const niche = stateRef.current.lastNiche;
                if (!niche) return;
                setLockedNiche(niche);
                setLockedDim("A");
              } : undefined
            }
          />
          <GhostDimBadge
            refEl={ghostDimBRef}
            isActive={lockedDim === "B" || drag3dInput?.side === "B"}
            onClick={
              drag3d ? () => setDrag3dInput({ side: "B" }) :
              placeMode ? () => {
                const niche = stateRef.current.lastNiche;
                if (!niche) return;
                setLockedNiche(niche);
                setLockedDim("B");
              } : undefined
            }
          />
          <GhostDimBadge
            refEl={editDimARef}
            isActive={editDim === "A"}
            onClick={editableZ ? () => {
              setEditDim("A");
            } : undefined}
          />
          <GhostDimBadge
            refEl={editDimBRef}
            isActive={editDim === "B"}
            onClick={editableZ ? () => {
              setEditDim("B");
            } : undefined}
          />

          {/* Кнопка toggle размеров — компактная иконка-ярлычок в левом верхнем углу.
              Оранжевая подсветка = размеры показываются, прозрачная = скрыты. */}
          <button
            onClick={() => setShowDims(v => !v)}
            title={showDims ? "Скрыть размеры" : "Показать размеры"}
            style={{
              position: "absolute", top: 12, left: 12,
              width: 36, height: 36, borderRadius: 6,
              padding: 0,
              cursor: "pointer",
              border: "1px solid " + (showDims ? "rgba(217,119,6,0.6)" : "rgba(100,100,110,0.4)"),
              background: showDims ? "rgba(217,119,6,0.25)" : "rgba(30,30,40,0.7)",
              color: showDims ? "#fbbf24" : "#888",
              fontSize: 18, lineHeight: 1,
              fontFamily: "'IBM Plex Mono', monospace",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 9,
              pointerEvents: "auto",
              transition: "all 150ms",
            }}
          >📏</button>

          {/* Кнопка 2D-редактора — переключение в классический 2D-редактор.
              Доступна на всех устройствах в верхнем левом углу canvas рядом с «Размеры». */}
          {onClose && (
            <button
              onClick={onClose}
              title="Переключиться на классический 2D-редактор"
              style={{
                position: "absolute", top: 12, left: 56,
                width: 48, height: 36, borderRadius: 6,
                padding: 0,
                cursor: "pointer",
                border: "1px solid rgba(96,165,250,0.4)",
                background: "rgba(96,165,250,0.15)",
                color: "#60a5fa",
                fontSize: 11, fontWeight: 700,
                fontFamily: "'IBM Plex Mono', monospace",
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 3,
                zIndex: 9,
                pointerEvents: "auto",
              }}
            >📐 2D</button>
          )}

          {/* Индикатор активного placeMode — поверх 3D, сверху.
              pointerEvents: "none" на контейнере чтобы клики СКВОЗЬ плашку
              падали на canvas (иначе пользователь не может поставить элемент
              в верхней части шкафа — клик попадает в плашку). Только кнопка ✕
              получает pointerEvents: "auto". */}
          {placeMode && (
            <div style={{
              position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
              padding: "6px 12px", borderRadius: 6,
              background: lockedDim ? "rgba(251,191,36,0.85)" : "rgba(34,197,94,0.82)",
              color: "#000",
              fontSize: 11, fontWeight: 700,
              fontFamily: "'IBM Plex Mono',monospace",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              zIndex: 10,
              pointerEvents: "none",
              maxWidth: "calc(100% - 100px)",
            }}>
              <span>+ {PLACE_LABELS[placeMode] || placeMode}</span>
              <span style={{ opacity: 0.7, fontSize: 10 }}>
                {lockedDim
                  ? ((placeMode === "shelf" || placeMode === "rod")
                      ? `· вводим ${lockedDim === "A" ? "↑" : "↓"} · Space=сменить · Enter=OK · Esc=отмена`
                      : `· вводим ${lockedDim === "A" ? "←" : "→"} · Space=сменить · Enter=OK · Esc=отмена`)
                  : (placeMode === "stud" || placeMode === "shelf" || placeMode === "rod")
                    ? "· клик = поставить · Space = точный ввод"
                    : "· кликни в зону"}
              </span>
              <button
                onClick={() => setPlaceMode?.(null)}
                style={{
                  background: "rgba(0,0,0,0.25)", border: "none",
                  borderRadius: 4, padding: "2px 8px",
                  color: "#000", fontWeight: 700, fontSize: 12,
                  cursor: "pointer",
                  pointerEvents: "auto",
                }}
                title="Отменить постановку"
              >✕</button>
            </div>
          )}

          {/* Индикатор edit-Z — для выделенной панели-insert или штанги.
              Показывается когда НЕТ placeMode (чтобы не конфликтовать с плашкой постановки). */}
          {!placeMode && editableZ && (
            <div style={{
              position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
              padding: "8px 16px", borderRadius: 6,
              background: editDim ? "rgba(251,191,36,0.95)" : "rgba(96,165,250,0.92)",
              color: "#000",
              fontSize: 12, fontWeight: 700,
              fontFamily: "'IBM Plex Mono',monospace",
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              zIndex: 10,
              pointerEvents: "auto",
            }}>
              <span>Глубина {selEl?.type === "panel" ? "панели" : "штанги"}</span>
              <span style={{ opacity: 0.7, fontSize: 10 }}>
                {editDim
                  ? `· вводим ${editDim === "A" ? "спереди" : "сзади"} · Space=сменить · Enter=OK · Esc=отмена`
                  : "· Space = редактировать Z"}
              </span>
            </div>
          )}

          {/* Индикатор drag3d — когда пользователь тащит существующий элемент.
              Показывает тип и подсказку «отпустите для подтверждения». */}
          {drag3d && (
            <div style={{
              position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
              padding: "6px 12px", borderRadius: 6,
              background: "rgba(34,197,94,0.82)",
              color: "#000",
              fontSize: 11, fontWeight: 700,
              fontFamily: "'IBM Plex Mono',monospace",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              zIndex: 10,
              pointerEvents: "none",
              maxWidth: "calc(100% - 100px)",
            }}>
              <span>↔ Перемещаем: {PLACE_LABELS[drag3d.type] || drag3d.type}</span>
              <span style={{ opacity: 0.7, fontSize: 10 }}>отпусти = поставить · Space = точный ввод</span>
            </div>
          )}

          {/* Контекстное меню выделенного элемента — быстрые действия.
              Показывается когда есть выделение И нет placeMode.
              Плавающая плашка снизу-по-центру над canvas.
              Не мешает PropsPanel (справа/снизу) и индикатору edit-Z (сверху). */}
          {selEl && !placeMode && (
            <div style={{
              position: "absolute",
              bottom: 24, left: "50%",
              transform: "translateX(-50%)",
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 8px",
              borderRadius: 8,
              background: "rgba(11,12,16,0.95)",
              border: "1px solid rgba(96,165,250,0.35)",
              boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
              zIndex: 11,
              pointerEvents: "auto",
            }}>
              {/* Удалить */}
              {delSel && (
                <button
                  onClick={() => delSel()}
                  title="Удалить элемент"
                  style={{
                    padding: "6px 10px", borderRadius: 5,
                    border: "1px solid rgba(239,68,68,0.4)",
                    background: "rgba(239,68,68,0.12)",
                    color: "#f87171",
                    fontSize: 11, fontWeight: 700,
                    fontFamily: "'IBM Plex Mono',monospace",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.25)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
                >
                  🗑 Удалить
                </button>
              )}
              {/* Дублировать */}
              {onDuplicate && (
                <button
                  onClick={() => onDuplicate(selEl.id)}
                  title="Создать копию рядом"
                  style={{
                    padding: "6px 10px", borderRadius: 5,
                    border: "1px solid rgba(96,165,250,0.4)",
                    background: "rgba(96,165,250,0.12)",
                    color: "#93c5fd",
                    fontSize: 11, fontWeight: 700,
                    fontFamily: "'IBM Plex Mono',monospace",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(96,165,250,0.25)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(96,165,250,0.12)"; }}
                >
                  📋 Дублировать
                </button>
              )}
              {/* Глубина — только для insert-панели и штанги. Активирует edit-Z (A). */}
              {editableZ && (
                <button
                  onClick={() => {
                    setEditDim("A");
                  }}
                  title="Редактировать глубину (Z)"
                  style={{
                    padding: "6px 10px", borderRadius: 5,
                    border: "1px solid rgba(251,191,36,0.4)",
                    background: "rgba(251,191,36,0.12)",
                    color: "#fcd34d",
                    fontSize: 11, fontWeight: 700,
                    fontFamily: "'IBM Plex Mono',monospace",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(251,191,36,0.25)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(251,191,36,0.12)"; }}
                >
                  📏 Глубина
                </button>
              )}
            </div>
          )}

          {/* LockInputPopup — фикс. popup сверху canvas для ввода точного размера.
              Появляется при Space или клике на «📏 Глубина». Не двигается пока сцена
              обновляется — это устраняет дёргание input'а. */}
          {lockedDim && (
            <LockInputPopup
              key={`place-${lockedDim}`}
              title={placeMode === "stud" ? "Точная позиция стойки" :
                     placeMode === "shelf" ? "Точная высота полки" :
                     placeMode === "rod" ? "Точная высота штанги" : "Размер"}
              side={lockedDim}
              initialValue={(lockedDim === "A"
                ? ghostDimARef.current?.textContent
                : ghostDimBRef.current?.textContent) ?? ""}
              maxValue={(() => {
                if (!lockedNiche) return undefined;
                const { niL, niR, niT, niB } = lockedNiche;
                if (placeMode === "stud") return Math.max(0, niR - niL - t);
                if (placeMode === "shelf") return Math.max(0, niB - niT - t);
                if (placeMode === "rod") return Math.max(0, niB - niT);
                return undefined;
              })()}
              onCommit={(val) => commitLockedPlacement(val)}
              onCancel={cancelLocked}
              onToggle={toggleLockedSide}
              hint={lockedDim === "A"
                ? "вводим с одной стороны · ⇄ сменить · Enter=OK · Esc=отмена"
                : "вводим с другой стороны · ⇄ сменить · Enter=OK · Esc=отмена"}
            />
          )}
          {editDim && (
            <LockInputPopup
              key={`edit-${editDim}`}
              title={selEl?.type === "panel" ? "Глубина панели" : "Глубина штанги"}
              side={editDim}
              initialValue={(editDim === "A"
                ? editDimARef.current?.textContent
                : editDimBRef.current?.textContent) ?? ""}
              maxValue={(() => {
                if (!selEl) return undefined;
                const objT = selEl.type === "panel" ? t : 25;
                return Math.max(0, corpus.depth - objT);
              })()}
              onCommit={(val) => commitEditZ(val)}
              onCancel={cancelEdit}
              onToggle={toggleEditSide}
              hint={editDim === "A" ? "расстояние от передней грани" : "расстояние до задней стенки"}
            />
          )}
          {/* Popup точного ввода размера во время drag3d.
              Открывается тапом на жёлтую цифру у фантома. */}
          {drag3dInput && drag3d && (
            <LockInputPopup
              key={`drag3d-${drag3dInput.side}`}
              title={`Перемещение: ${PLACE_LABELS[drag3d.type] || drag3d.type}`}
              side={drag3dInput.side}
              initialValue={(drag3dInput.side === "A"
                ? ghostDimARef.current?.textContent
                : ghostDimBRef.current?.textContent) ?? ""}
              maxValue={(() => {
                const orig = drag3d.origEl || {};
                if (drag3d.type === "stud") return Math.max(0, iW - t);
                if (drag3d.type === "shelf") return Math.max(0, iH - t);
                if (drag3d.type === "rod") return Math.max(0, iH);
                if (drag3d.type === "drawers") return Math.max(0, iH - (orig.h || 450));
                if (drag3d.type === "door" || drag3d.type === "panel") return Math.max(0, iH - (orig.h || 600));
                return undefined;
              })()}
              onCommit={(val) => commitDrag3dInput(val)}
              onCancel={() => setDrag3dInput(null)}
              onToggle={() => setDrag3dInput(prev => ({ side: prev?.side === "A" ? "B" : "A" }))}
              hint={drag3dInput.side === "A"
                ? "расстояние от верхней/левой стенки"
                : "расстояние от нижней/правой стенки"}
            />
          )}

          {/* Popup для редактирования общих габаритов корпуса (W/H/D).
              Тап на жёлтую цифру 1200/2100/600 → этот popup. */}
          {corpusEditDim && setCorpus && (
            <LockInputPopup
              key={`corpus-${corpusEditDim}`}
              title={
                corpusEditDim === "width" ? "Ширина шкафа"
                : corpusEditDim === "height" ? "Высота шкафа"
                : "Глубина шкафа"
              }
              side="A"
              initialValue={String(corpus[corpusEditDim] ?? 0)}
              maxValue={5000}
              onCommit={(val) => {
                const v = parseFloat(val);
                if (Number.isFinite(v) && v >= 100) {
                  // Минимум 100мм, максимум 5000мм
                  const clamped = Math.max(100, Math.min(5000, Math.round(v)));
                  setCorpus(c => ({ ...c, [corpusEditDim]: clamped }));
                }
                setCorpusEditDim(null);
              }}
              onCancel={() => setCorpusEditDim(null)}
              hint="мм"
            />
          )}

          {/* Pending-place плашка: появляется на touch после отпускания пальца в placeMode.
              Фантом зафиксирован, пользователь может тапнуть на жёлтую цифру чтобы
              ввести точное значение, или нажать ✓ для постановки в текущем месте,
              или ✕ для отмены (фантом снова будет следовать за пальцем). */}
          {pendingPlace && placeMode && !lockedDim && (
            <div style={{
              position: "absolute",
              bottom: 24, left: "50%", transform: "translateX(-50%)",
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px",
              borderRadius: 10,
              background: "rgba(11,12,16,0.97)",
              border: "1px solid rgba(34,197,94,0.5)",
              boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
              zIndex: 14,
              pointerEvents: "auto",
            }}>
              <span style={{
                fontSize: 10, color: "#aaa", fontFamily: "'IBM Plex Mono',monospace",
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                Тап на цифру → размер, или
              </span>
              <button
                onClick={() => {
                  if (placeInZone) placeInZone(null, pendingPlace.clickX, pendingPlace.clickY);
                  setPendingPlace(null);
                }}
                style={{
                  padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                  background: "#22c55e", color: "#000", border: "none",
                  cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
                }}
              >✓ Поставить</button>
              <button
                onClick={() => setPendingPlace(null)}
                style={{
                  padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: "transparent", color: "#888",
                  border: "1px solid #444",
                  cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
                }}
              >✕</button>
            </div>
          )}

          {/* FAB — floating action button "+". Снизу-справа, раскрывается веером.
              Видим в любом режиме (placeMode, selEl) кроме drag3d, чтобы пользователь
              мог переключаться между типами добавляемых элементов на лету,
              не нажимая Esc/× для выхода из текущего режима. */}
          {onAddElement && !drag3d && (
            <Fab
              open={fabOpen}
              onToggle={() => setFabOpen(v => !v)}
              onPick={(type) => {
                setFabOpen(false);
                onAddElement(type);
              }}
            />
          )}
        </div>

        {/* Панель свойств — появляется при выделении элемента.
            В placeMode скрыта чтобы не загораживать подсветку зоны постановки.
            При drag3d — тоже скрыта, иначе закрывает шкаф и не видно куда тащить. */}
        {selEl && !placeMode && !drag3d && (
          <PropsPanel3D
            selEl={selEl}
            updateEl={updateEl}
            delSel={delSel}
            onClose={() => onElementClick?.(null)}
            iW={iW}
            iH={iH}
            t={t}
            D={corpus?.depth}
            isMobile={isMobile}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Fab — floating action button "+". Раскрывается веером иконок.
// ═══════════════════════════════════════════════════════════════
// Снизу-справа над canvas. Закрывается по клику на кнопку ещё раз,
// по клику в пустое место (overlay) или после выбора типа.
function Fab({ open, onToggle, onPick }) {
  // SVG-иконки 24×24 чтобы у штанги/полки/панели были разные понятные силуэты,
  // не как раньше где «━» и «⎯» выглядели одинаково.
  const Icon = ({ type }) => {
    const stroke = "#d97706";
    if (type === "shelf") {
      // Полка: горизонтальный прямоугольник
      return <svg width="22" height="22" viewBox="0 0 24 24"><rect x="3" y="10" width="18" height="4" fill={stroke} /></svg>;
    }
    if (type === "stud") {
      // Стойка: вертикальный прямоугольник
      return <svg width="22" height="22" viewBox="0 0 24 24"><rect x="10" y="3" width="4" height="18" fill={stroke} /></svg>;
    }
    if (type === "rod") {
      // Штанга: тонкая горизонтальная палка + 2 плечика снизу
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="9" x2="21" y2="9" />
          {/* Плечико 1 */}
          <path d="M8 9 L6 16 L10 16 Z" fill={stroke} />
          {/* Плечико 2 */}
          <path d="M16 9 L14 16 L18 16 Z" fill={stroke} />
        </svg>
      );
    }
    if (type === "drawers") {
      // Ящики: 3 горизонтальные линии с ручками-точками по центру
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
          <rect x="4" y="4" width="16" height="16" />
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="14" x2="20" y2="14" />
          <circle cx="12" cy="6.5" r="0.8" fill={stroke} />
          <circle cx="12" cy="11.5" r="0.8" fill={stroke} />
          <circle cx="12" cy="17" r="0.8" fill={stroke} />
        </svg>
      );
    }
    if (type === "panel") {
      // Панель: вертикальный прямоугольник средний
      return <svg width="22" height="22" viewBox="0 0 24 24"><rect x="8" y="4" width="8" height="16" fill="none" stroke={stroke} strokeWidth="2" /></svg>;
    }
    if (type === "door") {
      // Дверь: прямоугольник с ручкой-точкой справа
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2">
          <rect x="5" y="3" width="14" height="18" />
          <circle cx="16" cy="12" r="1" fill={stroke} />
        </svg>
      );
    }
    return null;
  };

  const items = [
    { type: "shelf",   label: "Полка"  },
    { type: "stud",    label: "Стойка" },
    { type: "rod",     label: "Штанга" },
    { type: "drawers", label: "Ящики"  },
    { type: "panel",   label: "Панель" },
    { type: "door",    label: "Дверь" },
  ];
  // Позиции иконок при open=true: веер вверх-влево от кнопки.
  // Радиус 130px, углы от -95° до -185° (полная четверть круга над кнопкой).
  // Это даёт достаточно места между иконками 44px чтобы они не наезжали.
  const count = items.length;
  const startA = -95;
  const endA = -185;
  return (
    <>
      {/* Прозрачный overlay для закрытия по клику вне — только когда открыт */}
      {open && (
        <div
          onClick={onToggle}
          style={{
            position: "absolute", inset: 0,
            zIndex: 11,
            background: "transparent",
          }}
        />
      )}
      {/* Иконки-лепестки */}
      {items.map((it, i) => {
        const angle = startA + (endA - startA) * (i / (count - 1));
        const rad = (angle * Math.PI) / 180;
        const r = 130;
        const dx = Math.cos(rad) * r;
        const dy = Math.sin(rad) * r;
        return (
          <button
            key={it.type}
            onClick={() => onPick(it.type)}
            title={it.label}
            style={{
              position: "absolute",
              bottom: 24, right: 24,
              width: 44, height: 44,
              borderRadius: "50%",
              border: "1px solid rgba(217,119,6,0.4)",
              background: "rgba(11,12,16,0.95)",
              color: "#d97706",
              fontSize: 16, fontWeight: 700,
              fontFamily: "'IBM Plex Mono',monospace",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              transform: open
                ? `translate(${dx}px, ${dy}px) scale(1)`
                : "translate(0, 0) scale(0.5)",
              opacity: open ? 1 : 0,
              pointerEvents: open ? "auto" : "none",
              transition: `transform 180ms cubic-bezier(.2,.8,.2,1) ${i * 25}ms, opacity 150ms ${i * 25}ms`,
              zIndex: 12,
            }}
          >
            <Icon type={it.type} />
          </button>
        );
      })}
      {/* Сам FAB "+" */}
      <button
        onClick={onToggle}
        title={open ? "Закрыть" : "Добавить элемент"}
        style={{
          position: "absolute",
          bottom: 24, right: 24,
          width: 52, height: 52,
          borderRadius: "50%",
          border: "none",
          background: "#d97706",
          color: "#000",
          fontSize: 26, fontWeight: 700,
          lineHeight: 1,
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(217,119,6,0.4), 0 2px 6px rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: open ? "rotate(45deg)" : "rotate(0)",
          transition: "transform 200ms cubic-bezier(.2,.8,.2,1)",
          zIndex: 13,
        }}
      >
        +
      </button>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// GhostDimBadge — жёлтая цифра рядом с фантомом/элементом.
// ═══════════════════════════════════════════════════════════════
// Чистый display-компонент. Позиция и текст управляются императивно через refEl
// (из updateZoneHighlight / updateEditDimLabels). Никакого input внутри —
// ввод размера теперь идёт через отдельный LockInputPopup (фикс. позиция сверху),
// чтобы не было подёргиваний от перерисовки сцены во время набора.
function GhostDimBadge({ refEl, isActive, onClick }) {
  const baseStyle = {
    position: "absolute",
    left: 0, top: 0,
    transform: "translate(-50%, -50%)",
    padding: "6px 10px",                 // больше для удобного тапа
    fontSize: 13,                        // крупнее на мобильном
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#1a1a1a",
    background: isActive ? "#fde68a" : "rgba(251,191,36,0.95)",
    border: isActive ? "2px solid #b45309" : "1px solid rgba(180,83,9,0.6)",
    borderRadius: 4,
    whiteSpace: "nowrap",
    userSelect: "none",
    display: "none",
    boxShadow: isActive ? "0 0 0 3px rgba(251,191,36,0.35)" : "0 2px 6px rgba(0,0,0,0.5)",
    zIndex: isActive ? 8 : 6,
    pointerEvents: onClick ? "auto" : "none",
    cursor: onClick ? "pointer" : "default",
    textAlign: "center",
    lineHeight: 1.2,
    minWidth: 32,
  };
  return (
    <div
      ref={refEl}
      style={baseStyle}
      onClick={onClick}
      onPointerDown={(e) => { if (onClick) e.stopPropagation(); }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════
// LockInputPopup — модальный popup для ввода точного размера.
// ═══════════════════════════════════════════════════════════════
// Фиксированная позиция сверху canvas (top-center). Не двигается, не пересчитывает сцену.
// Локальное состояние input'а (useState внутри) — родитель узнаёт значение только при Enter.
// Это полностью устраняет дёргание: сцена замороженная, пока popup открыт.
function LockInputPopup({ title, initialValue, side, onCommit, onCancel, onToggle, hint, maxValue }) {
  const [val, setVal] = useState(String(initialValue ?? ""));
  const inputRef = useRef(null);
  useEffect(() => {
    // Синхронизируем value при смене side (A/B) — читаем новый initialValue
    setVal(String(initialValue ?? ""));
  }, [initialValue, side]);
  useEffect(() => {
    // Фокус + выделение на mount / после смены стороны
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [side]);
  // Snap-кнопки. Удобно одним тапом поставить элемент:
  // - «К стенке» = 0 (вплотную с этой стороны)
  // - «В центр» = maxValue/2
  // - «К другой» = maxValue (вплотную с противоположной стороны)
  const snap = (v) => {
    const s = String(Math.max(0, Math.round(v)));
    setVal(s);
    onCommit(s);
  };
  return (
    <div style={{
      position: "absolute",
      top: 8, left: "50%", transform: "translateX(-50%)",
      maxWidth: "calc(100% - 16px)",
      minWidth: 240,
      background: "rgba(11,12,16,0.98)",
      border: "1px solid rgba(251,191,36,0.5)",
      borderRadius: 8,
      padding: "8px 10px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
      display: "flex", flexDirection: "column", gap: 5,
      zIndex: 30,
      pointerEvents: "auto",
    }}>
      <div style={{
        fontSize: 10, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.08em",
        fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
      }}>
        {title} {side && <span style={{ color: "#888", marginLeft: 6 }}>· {side === "A" ? "А" : "Б"}</span>}
      </div>

      {/* Snap-кнопки — один тап = поставить вплотную/в центр.
          Показываем только если родитель передал maxValue (т.е. знает сколько помещается). */}
      {typeof maxValue === "number" && maxValue > 0 && (
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => snap(0)}
            title="Вплотную к этой стенке"
            style={{
              flex: 1, padding: "6px 4px", fontSize: 10, fontWeight: 700,
              background: "rgba(251,191,36,0.12)", color: "#fbbf24",
              border: "1px solid rgba(251,191,36,0.4)", borderRadius: 4,
              cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
            }}
          >⊟ 0</button>
          <button
            onClick={() => snap(maxValue / 2)}
            title="В центр"
            style={{
              flex: 1, padding: "6px 4px", fontSize: 10, fontWeight: 700,
              background: "rgba(251,191,36,0.12)", color: "#fbbf24",
              border: "1px solid rgba(251,191,36,0.4)", borderRadius: 4,
              cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
            }}
          >◇ Центр</button>
          <button
            onClick={() => snap(maxValue)}
            title="Вплотную к противоположной стенке"
            style={{
              flex: 1, padding: "6px 4px", fontSize: 10, fontWeight: 700,
              background: "rgba(251,191,36,0.12)", color: "#fbbf24",
              border: "1px solid rgba(251,191,36,0.4)", borderRadius: 4,
              cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
            }}
          >{maxValue} ⊠</button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={val}
          onChange={e => setVal(e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit(val);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            } else if (e.key === " ") {
              e.preventDefault();
              onToggle?.();
            }
          }}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 16,
            fontWeight: 700,
            fontFamily: "'IBM Plex Mono',monospace",
            background: "#0b0c10",
            border: "1px solid rgba(251,191,36,0.5)",
            borderRadius: 5,
            color: "#fde68a",
            outline: "none",
            textAlign: "center",
            minWidth: 0,
          }}
        />
        <span style={{ fontSize: 11, color: "#888", fontFamily: "'IBM Plex Mono',monospace" }}>мм</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onCommit(val)}
          style={{
            flex: 1, padding: "6px 8px", fontSize: 11, fontWeight: 700,
            background: "#fbbf24", color: "#000", border: "none", borderRadius: 4,
            cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
          }}
        >OK · Enter</button>
        {onToggle && (
          <button
            onClick={onToggle}
            style={{
              padding: "6px 10px", fontSize: 11, fontWeight: 600,
              background: "rgba(96,165,250,0.15)", color: "#93c5fd",
              border: "1px solid rgba(96,165,250,0.4)", borderRadius: 4,
              cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
            }}
            title="Переключить сторону (Space)"
          >⇄</button>
        )}
        <button
          onClick={onCancel}
          style={{
            padding: "6px 10px", fontSize: 11, fontWeight: 600,
            background: "transparent", color: "#888",
            border: "1px solid #333", borderRadius: 4,
            cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
          }}
          title="Отмена (Escape)"
        >✕</button>
      </div>
      {hint && (
        <div style={{ fontSize: 9, color: "#666", fontFamily: "'IBM Plex Mono',monospace" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PropsPanel3D — панель свойств выделенного элемента, поверх 3D
// ═══════════════════════════════════════════════════════════════
// Десктоп: sidebar справа (320px), 3D сжимается по ширине.
// Мобильный: bottom sheet снизу (max 50% высоты), 3D сжимается по высоте.
// Содержит минимальный набор полей для редактирования: координаты,
// размеры, тип (для двери/панели), кнопку удаления.
// В Сессии 2 будет расширен: добавление новых элементов через click-to-place.
// DrawerHeightInput — отдельный input с локальным буфером для свободного редактирования.
// Без буфера: пользователь стирает число → значение становится 0/NaN → updateEl
// получает мусор → adjust ломает геометрию → пользователь теряет ящики/полку.
// С буфером: можно стереть всё, набрать новое, commit на blur/Enter.
function DrawerHeightInput({ index, value, onCommit }) {
  const [buf, setBuf] = useState(String(value));
  const inputRef = useRef(null);
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setBuf(String(value));
    }
  }, [value]);
  const commit = () => {
    const v = parseInt(buf);
    if (!Number.isFinite(v) || v < 50) {
      setBuf(String(value));
      return;
    }
    const clamped = Math.max(50, Math.min(500, v));
    onCommit(clamped);
    setBuf(String(clamped));
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color: "#888", minWidth: 50,
        fontFamily: "'IBM Plex Mono',monospace" }}>
        Ящик {index + 1}:
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={buf}
        onChange={e => setBuf(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            e.target.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setBuf(String(value));
            e.target.blur();
          }
        }}
        style={{
          flex: 1, padding: "4px 8px", fontSize: 11,
          background: "#0b0c10", color: "#fff",
          border: "1px solid #333", borderRadius: 3,
          fontFamily: "'IBM Plex Mono',monospace",
          outline: "none",
        }}
      />
    </div>
  );
}

function PropsPanel3D({ selEl, updateEl, delSel, onClose, iW, iH, t, D, isMobile }) {
  if (!selEl) return null;

  const baseStyle = isMobile ? {
    position: "absolute", bottom: 0, left: 0, right: 0,
    maxHeight: "50%", overflowY: "auto",
    background: "rgba(11,12,16,0.98)",
    borderTop: "1px solid rgba(96,165,250,0.3)",
    padding: "16px 20px 20px",
    boxShadow: "0 -4px 20px rgba(0,0,0,0.5)",
    zIndex: 50,
  } : {
    width: 320, minWidth: 320, flexShrink: 0,
    background: "rgba(11,12,16,0.98)",
    borderLeft: "1px solid rgba(255,255,255,0.06)",
    padding: "16px 18px",
    overflowY: "auto",
    zIndex: 50,
  };

  // Компактное числовое поле
  const NumField = ({ label, value, onChange, min, max, step = 1, color = "#60a5fa" }) => {
    // Локальный буфер для свободного редактирования (можно стереть всё чтобы напечатать
    // новое число). Реальное обновление элемента происходит на blur/Enter, а не на каждое
    // нажатие — иначе стирание превращало значение в 0 и адзаст ломал элемент.
    const [buf, setBuf] = useState(String(Math.round(value ?? 0)));
    const inputRef = useRef(null);
    // Синхронизируем буфер при внешнем изменении value (но не во время фокуса —
    // иначе пользовательский набор сбивается).
    useEffect(() => {
      if (document.activeElement !== inputRef.current) {
        setBuf(String(Math.round(value ?? 0)));
      }
    }, [value]);
    const commit = () => {
      const v = Number(buf);
      if (!Number.isFinite(v)) {
        // Невалидно — возвращаем последнее значение
        setBuf(String(Math.round(value ?? 0)));
        return;
      }
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
      onChange(clamped);
      setBuf(String(Math.round(clamped)));
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={buf}
          onChange={e => setBuf(e.target.value.replace(/[^\d-]/g, ""))}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
              e.target.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setBuf(String(Math.round(value ?? 0)));
              e.target.blur();
            }
          }}
          step={step}
          style={{
            width: "100%", padding: "6px 8px", borderRadius: 4,
            background: "rgba(30,30,40,0.7)",
            border: "1px solid rgba(60,60,70,0.6)",
            color, fontSize: 12, fontWeight: 700,
            fontFamily: "'IBM Plex Mono',monospace",
            textAlign: "center",
            outline: "none",
          }}
        />
      </div>
    );
  };

  return (
    <div style={baseStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: "#d97706",
          fontFamily: "'IBM Plex Mono',monospace",
        }}>
          {PLACE_LABELS[selEl.type] || selEl.type}
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "#666",
          fontSize: 16, cursor: "pointer", padding: "2px 8px",
        }} title="Снять выделение">✕</button>
      </div>

      {/* SHELF */}
      {selEl.type === "shelf" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <NumField label="Y, мм" value={selEl.y} min={0} max={iH}
            onChange={v => updateEl(selEl.id, { y: v, manualY: v })}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <NumField label="X, мм" value={selEl.x ?? 0} min={0} max={iW}
                onChange={v => updateEl(selEl.id, { x: v, manualX: v })}
                color="#d97706"
              />
            </div>
            <div style={{ flex: 1 }}>
              <NumField label="Ш, мм" value={selEl.w ?? iW} min={20} max={iW}
                onChange={v => updateEl(selEl.id, { w: v, manualW: v })}
                color="#d97706"
              />
            </div>
          </div>
        </div>
      )}

      {/* STUD */}
      {selEl.type === "stud" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <NumField label="X, мм" value={selEl.x} min={0} max={iW - t}
            onChange={v => updateEl(selEl.id, { x: v })}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <NumField label="Верх, мм" value={selEl.pTop ?? 0} min={0} max={iH}
                onChange={v => updateEl(selEl.id, { pTop: v, manualPTop: v })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <NumField label="Низ, мм" value={selEl.pBot ?? iH} min={0} max={iH}
                onChange={v => updateEl(selEl.id, { pBot: v, manualPBot: v })}
              />
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#666", marginTop: -4 }}>
            Высота: {Math.round((selEl.pBot ?? iH) - (selEl.pTop ?? 0))} мм
          </div>
        </div>
      )}

      {/* DOOR */}
      {selEl.type === "door" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Тип петли</div>
            <div style={{ display: "flex", gap: 0 }}>
              {["overlay", "insert"].map(ht => (
                <button key={ht}
                  onClick={() => updateEl(selEl.id, { hingeType: ht })}
                  style={{
                    flex: 1, padding: "7px 0",
                    background: selEl.hingeType === ht ? "rgba(217,119,6,0.2)" : "rgba(30,30,40,0.5)",
                    color: selEl.hingeType === ht ? "#d97706" : "#888",
                    border: "1px solid " + (selEl.hingeType === ht ? "rgba(217,119,6,0.4)" : "rgba(60,60,70,0.5)"),
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'IBM Plex Mono',monospace",
                  }}>
                  {ht === "overlay" ? "Накладная" : "Вкладная"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Петли</div>
            <div style={{ display: "flex", gap: 0 }}>
              {[
                { v: "left", l: "← Лево" },
                { v: "right", l: "Право →" },
              ].map(s => (
                <button key={s.v}
                  onClick={() => updateEl(selEl.id, { hingeSide: s.v })}
                  style={{
                    flex: 1, padding: "7px 0",
                    background: selEl.hingeSide === s.v ? "rgba(217,119,6,0.2)" : "rgba(30,30,40,0.5)",
                    color: selEl.hingeSide === s.v ? "#d97706" : "#888",
                    border: "1px solid " + (selEl.hingeSide === s.v ? "rgba(217,119,6,0.4)" : "rgba(60,60,70,0.5)"),
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'IBM Plex Mono',monospace",
                  }}>
                  {s.l}
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#666" }}>
            Границы: {Math.round(selEl.doorLeft ?? 0)}–{Math.round(selEl.doorRight ?? iW)} × {Math.round(selEl.doorTop ?? 0)}–{Math.round(selEl.doorBottom ?? iH)}
          </div>
        </div>
      )}

      {/* PANEL */}
      {selEl.type === "panel" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Тип</div>
            <div style={{ display: "flex", gap: 0 }}>
              {["overlay", "insert"].map(pt => (
                <button key={pt}
                  onClick={() => updateEl(selEl.id, { panelType: pt })}
                  style={{
                    flex: 1, padding: "7px 0",
                    background: selEl.panelType === pt ? "rgba(217,119,6,0.2)" : "rgba(30,30,40,0.5)",
                    color: selEl.panelType === pt ? "#d97706" : "#888",
                    border: "1px solid " + (selEl.panelType === pt ? "rgba(217,119,6,0.4)" : "rgba(60,60,70,0.5)"),
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'IBM Plex Mono',monospace",
                  }}>
                  {pt === "overlay" ? "Накладная" : "Вкладная"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#666" }}>
            Границы: {Math.round(selEl.panelLeft ?? 0)}–{Math.round(selEl.panelRight ?? iW)} × {Math.round(selEl.panelTop ?? 0)}–{Math.round(selEl.panelBottom ?? iH)}
          </div>
        </div>
      )}

      {/* ROD */}
      {selEl.type === "rod" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <NumField label="Y, мм" value={selEl.y} min={0} max={iH}
            onChange={v => updateEl(selEl.id, { y: v })}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <NumField label="X, мм" value={selEl.x ?? 0} min={0} max={iW}
                onChange={v => updateEl(selEl.id, { x: v })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <NumField label="Ш, мм" value={selEl.w ?? iW} min={50} max={iW}
                onChange={v => updateEl(selEl.id, { w: v })}
              />
            </div>
          </div>
        </div>
      )}

      {/* DRAWERS */}
      {selEl.type === "drawers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <NumField label="Кол-во" value={selEl.count ?? 3} min={1} max={10}
            onChange={v => updateEl(selEl.id, { count: v })}
          />
          {/* Высоты отдельных ящиков. Сумма должна равняться h блока. */}
          <div>
            <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase",
              letterSpacing: "0.05em", marginBottom: 6, fontFamily: "'IBM Plex Mono',monospace" }}>
              Высоты ящиков (мм)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(() => {
                const cnt = selEl.count ?? 3;
                const heights = selEl.drawerHeights ?? Array(cnt).fill(Math.floor((selEl.h ?? 450) / cnt));
                return heights.map((h, i) => (
                  <DrawerHeightInput
                    key={i}
                    index={i}
                    value={h}
                    onCommit={(newH) => {
                      const newHeights = [...heights];
                      newHeights[i] = newH;
                      updateEl(selEl.id, { drawerHeights: newHeights });
                    }}
                  />
                ));
              })()}
            </div>
            <div style={{ fontSize: 9, color: "#555", marginTop: 4,
              fontFamily: "'IBM Plex Mono',monospace" }}>
              Сумма: {(selEl.drawerHeights ?? []).reduce((a, b) => a + b, 0) || selEl.h} мм
            </div>
          </div>
          {/* Глубина блока — длина выдвижения ящика */}
          <NumField
            label="Глубина (мм)"
            value={selEl.depth ?? Math.round((D || 600) * 0.72)}
            min={200}
            max={Math.max(200, (D || 600) - 50)}
            onChange={v => updateEl(selEl.id, { depth: v })}
          />
          <div style={{ fontSize: 10, color: "#666" }}>
            Проём: {Math.round(selEl.x ?? 0)}..{Math.round((selEl.x ?? 0) + (selEl.w ?? iW))} × {Math.round(selEl.pTop ?? 0)}..{Math.round(selEl.pBot ?? iH)}
          </div>
        </div>
      )}

      {/* Delete button */}
      <button
        onClick={delSel}
        style={{
          marginTop: 20, width: "100%", padding: "10px 0",
          background: "rgba(239,68,68,0.1)", color: "#ef4444",
          border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4,
          fontSize: 12, fontWeight: 700, cursor: "pointer",
          fontFamily: "'IBM Plex Mono',monospace",
        }}
      >🗑 Удалить</button>
    </div>
  );
}
