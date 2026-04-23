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
  corpus, elements, corpusTexture, facadeTexture,
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
  // Показывать ли общие размеры (габариты, между-стоечные/полочные)
  const [showDims, setShowDims] = useState(true);

  // ═══ Ghost-dim input state (Этап 1: стойка) ═══
  // Когда пользователь кликает на жёлтую цифру — она превращается в input.
  // lockedDim: "A" | "B" | null — какая цифра сейчас в режиме ввода
  // lockedValue: число в мм — что введено в input (может быть "" пока пользователь печатает)
  // niche: {niL, niR, niT, niB, axis} — границы ниши, в которой идёт ввод (нужно чтобы пересчитать фантом)
  const [lockedDim, setLockedDim] = useState(null);
  const [lockedValue, setLockedValue] = useState("");
  const [lockedNiche, setLockedNiche] = useState(null);
  const lockedInputRef = useRef(null);

  // Ref для актуальных props placement — handlers внутри Three.js не пересоздаются
  // при изменении props (build пересоздавать дорого), поэтому читаем свежие значения через ref.
  const propsRef = useRef({
    placeMode, setPlaceMode, findDoorBounds, placeInZone,
    iW, iH, t,
    showDims,
    elements,
    lockedDim, lockedValue, lockedNiche,
  });
  useEffect(() => {
    propsRef.current = {
      placeMode, setPlaceMode, findDoorBounds, placeInZone, iW, iH, t, showDims, elements,
      lockedDim, lockedValue, lockedNiche,
    };
  });

  // Когда вошли в lock-режим — ставим фокус и выделяем текст
  useEffect(() => {
    if (lockedDim && lockedInputRef.current) {
      lockedInputRef.current.focus();
      lockedInputRef.current.select();
    }
  }, [lockedDim]);

  // Сброс lock-режима когда placeMode изменился (пользователь выбрал другой элемент или отменил)
  useEffect(() => {
    setLockedDim(null);
    setLockedValue("");
    setLockedNiche(null);
  }, [placeMode]);

  // При изменении введённого значения в input — пересчитать фантом в реальном времени.
  // Используем координаты последней позиции курсора (или центр canvas если мышь не двигалась).
  useEffect(() => {
    if (lockedDim === null) return;
    const fn = stateRef.current.updateZoneHighlight;
    if (!fn) return;
    let mx = stateRef.current.lastMouseX;
    let my = stateRef.current.lastMouseY;
    if (mx == null || my == null) {
      // Fallback — центр canvas
      const rect = mountRef.current?.getBoundingClientRect();
      if (rect) {
        mx = rect.left + rect.width / 2;
        my = rect.top + rect.height / 2;
      } else {
        return;
      }
    }
    fn(mx, my);
  }, [lockedValue, lockedDim]);

  // ═══ Клавиатура для click-to-edit ═══
  // Space: активирует ввод активной цифры (A → B → A циклически).
  // Enter: commit (обрабатывается в input onKeyDown).
  // Escape: cancel.
  // Работает только при placeMode === "stud" (на Этапе 1).
  const toggleLockedSide = () => {
    const { lockedDim: lD } = propsRef.current;
    const niche = stateRef.current.lastNiche;
    if (!niche) return; // курсор не над шкафом — ничего не делаем
    if (lD === null) {
      const txt = ghostDimARef.current?.textContent ?? "";
      setLockedNiche(niche);
      setLockedDim("A");
      setLockedValue(txt.trim());
    } else if (lD === "A") {
      const txt = ghostDimBRef.current?.textContent ?? "";
      setLockedDim("B");
      setLockedValue(txt.trim());
    } else if (lD === "B") {
      const txt = ghostDimARef.current?.textContent ?? "";
      setLockedDim("A");
      setLockedValue(txt.trim());
    }
  };
  const cancelLocked = () => {
    setLockedDim(null);
    setLockedValue("");
    setLockedNiche(null);
  };

  useEffect(() => {
    if (placeMode !== "stud") return;
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

  // Callback: применить зафиксированное значение — ставит элемент точно.
  // Вызывается при Enter в input.
  const commitLockedPlacement = () => {
    const parsed = parseFloat(lockedValue);
    if (!Number.isFinite(parsed) || parsed < 0 || !lockedNiche || !placeInZone) {
      // Невалидное значение — отменяем ввод, не ставим элемент
      setLockedDim(null);
      setLockedValue("");
      setLockedNiche(null);
      return;
    }
    const { niL, niR, niT, niB } = lockedNiche;
    // Среднее Y ниши (для stud не критично, важен только X)
    const midY = (niT + niB) / 2;
    let clickX;
    if (placeMode === "stud") {
      // Пересчёт: где надо кликнуть чтобы stud встал по нужной цифре.
      // A (левая колонка = lockedValue): studX = niL + lockedValue → clickX = niL + lockedValue + t/2
      // B (правая колонка = lockedValue): studX = niR - lockedValue - t → clickX = niR - lockedValue - t/2
      if (lockedDim === "A") {
        clickX = niL + parsed + t / 2;
      } else {
        clickX = niR - parsed - t / 2;
      }
      // Кламп чтобы не вылезло за пределы ниши
      clickX = Math.max(niL + t / 2, Math.min(niR - t / 2, clickX));
      placeInZone(null, clickX, midY);
    }
    // Сбрасываем lock после постановки
    setLockedDim(null);
    setLockedValue("");
    setLockedNiche(null);
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
    // Смещения в метрах: насколько размерная линия отстоит от шкафа
    const OFF_NEAR = 0.05;  // ближняя линия (колонки/полки)
    const OFF_FAR = 0.13;   // дальняя (общие габариты)
    // Z-координата передней грани
    const zFront = halfD;

    const dims = [];

    // ── Общая ширина (дальняя линия сверху) ──
    dims.push({
      key: "total-w", text: `${W}`, axis: "h",
      p1: { x: -halfW, y: halfH, z: zFront },
      p2: { x:  halfW, y: halfH, z: zFront },
      offset3d: { x: 0, y:  OFF_FAR, z: 0 },
    });

    // ── Общая высота (справа снаружи) ──
    dims.push({
      key: "total-h", text: `${H}`, axis: "v",
      p1: { x: halfW, y:  halfH, z: zFront },
      p2: { x: halfW, y: -halfH, z: zFront },
      offset3d: { x: OFF_FAR, y: 0, z: 0 },
    });

    // ── Глубина (справа-снизу, отводим вправо по X) ──
    dims.push({
      key: "total-d", text: `${D}`, axis: "d",
      p1: { x: halfW, y: -halfH, z:  halfD },
      p2: { x: halfW, y: -halfH, z: -halfD },
      offset3d: { x: OFF_NEAR, y: -OFF_NEAR, z: 0 },
    });

    // ── Ширины колонок (ближняя линия сверху) ──
    const studs = elements
      .filter(e => e.kind === "stud")
      .map(e => ({ x: e.x, w: e.w ?? t }))
      .sort((a, b) => a.x - b.x);
    const vBoundaries = [0, ...studs.flatMap(s => [s.x, s.x + s.w]), iWmm];
    const vBoundsUniq = Array.from(new Set(vBoundaries)).sort((a, b) => a - b);
    for (let i = 0; i < vBoundsUniq.length - 1; i++) {
      const x1mm = vBoundsUniq[i], x2mm = vBoundsUniq[i + 1];
      const colW = x2mm - x1mm;
      if (colW < 20) continue;
      const x1 = (x1mm - iWmm / 2) * S;
      const x2 = (x2mm - iWmm / 2) * S;
      dims.push({
        key: `col-${i}`, text: `${colW}`, axis: "h",
        p1: { x: x1, y: halfH, z: zFront },
        p2: { x: x2, y: halfH, z: zFront },
        offset3d: { x: 0, y: OFF_NEAR, z: 0 },
      });
    }

    // ── Высоты проёмов (ближняя линия слева) ──
    const shelves = elements
      .filter(e => e.kind === "shelf")
      .map(e => ({ y: e.y, h: e.h ?? t }))
      .sort((a, b) => a.y - b.y);
    const hBoundaries = [0, ...shelves.flatMap(s => [s.y, s.y + s.h]), iHmm];
    const hBoundsUniq = Array.from(new Set(hBoundaries)).sort((a, b) => a - b);
    for (let i = 0; i < hBoundsUniq.length - 1; i++) {
      const y1mm = hBoundsUniq[i], y2mm = hBoundsUniq[i + 1];
      const rowH = y2mm - y1mm;
      if (rowH < 20) continue;
      const y1 = (iHmm / 2 - y1mm) * S;
      const y2 = (iHmm / 2 - y2mm) * S;
      dims.push({
        key: `row-${i}`, text: `${rowH}`, axis: "v",
        p1: { x: -halfW, y: y1, z: zFront },
        p2: { x: -halfW, y: y2, z: zFront },
        offset3d: { x: -OFF_NEAR, y: 0, z: 0 },
      });
    }

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
      const iWm = (showCorpus ? W - 2 * T : W) * S;
      const iHm = (showCorpus ? H - 2 * T : H) * S;
      const planeGeo = new THREE.PlaneGeometry(iWm, iHm);
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
        const DRAWER_DEPTH = d * 0.72;  // drawer box depth

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

        // Chrome tube — 25mm diameter
        const rodGeo = new THREE.CylinderGeometry(12.5 * S, 12.5 * S, rw, 24);
        rodGeo.rotateZ(Math.PI / 2);
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.position.set(sx, sy, 0);
        rod.castShadow = true;
        group.add(rod);

        // Rod holders (фланцы) — detailed bracket
        [-rw / 2 - 3 * S, rw / 2 + 3 * S].forEach(ox => {
          // Vertical plate screwed to side/stud
          addBox(3 * S, 20 * S, 30 * S, sx + ox, sy + 2 * S, 0, metalMat);
          // U-bracket holding the tube
          addBox(8 * S, 4 * S, 28 * S, sx + ox, sy + 12 * S, 0, metalMat);
          // Screws
          [{ dy: 6, dz: 8 }, { dy: 6, dz: -8 }, { dy: -6, dz: 8 }, { dy: -6, dz: -8 }].forEach(s => {
            const screwGeo = new THREE.CylinderGeometry(1.5 * S, 1.5 * S, 4 * S, 6);
            screwGeo.rotateZ(Math.PI / 2);
            const screw = new THREE.Mesh(screwGeo, metalMat);
            screw.position.set(sx + ox + (ox > 0 ? 2 : -2) * S, sy + s.dy * S, s.dz * S);
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
        const hasCustomOffset = typeof el.depthOffset === "number" && el.depthOffset > 0;

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

    return { scene, camera, renderer, dist, elementMeshes, group, placeProjPlane, zoneHighlight, S, d };
  }, [corpus, elements, corpusTexture, facadeTexture, showDoors, showCorpus, showRoom]);

  useEffect(() => {
    if (!mountRef.current) return;
    let cancelled = false;

    build().then(({ scene, camera, renderer, dist, elementMeshes, group, placeProjPlane, zoneHighlight, S, d }) => {
      if (cancelled) return;

      let isDragging = false, prevX = 0, prevY = 0, rotY = 0.35, rotX = 0.12, zoom = 1;

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
      // Начальная подсветка (если selId уже задан)
      updateOutline(selId);

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
        const clickX = point.x / S + cW / 2;
        const clickY = cH / 2 - point.y / S;
        // Клик должен быть внутри [0, iW] × [0, iH]
        if (clickX < 0 || clickX > cW || clickY < 0 || clickY > cH) return null;
        return { clickX, clickY };
      };

      // ── Helper: обновить подсветку силуэта элемента под курсором ──
      // Для placeMode рассчитываем где именно встанет элемент (а не всю нишу),
      // и рисуем жёлтый прямоугольник его реального размера.
      const hideZone = () => {
        zoneHighlight.visible = false;
        if (ghostDimARef.current) ghostDimARef.current.style.display = "none";
        if (ghostDimBRef.current) ghostDimBRef.current.style.display = "none";
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
            studX = Math.round(proj.clickX - ct / 2);
          }
          // Кламп
          studX = Math.max(effNiL, Math.min(effNiR - ct, studX));
          x1 = studX; x2 = studX + ct;
          y1 = effNiT;   y2 = effNiB;
        } else if (pm === "shelf") {
          // Полка — горизонтальная полоска высотой t на полную ширину ниши.
          // Smart-Y: близко к верху → толщина вниз, близко к низу → вверх, иначе по центру.
          const shY = Math.round(proj.clickY);
          if (shY < niT + 5) { y1 = niT; y2 = niT + ct; }
          else if (shY > niB - 5) { y1 = niB - ct; y2 = niB; }
          else { y1 = shY - ct / 2; y2 = shY + ct / 2; }
          x1 = niL; x2 = niR;
        } else if (pm === "rod") {
          // Штанга — тонкая (~25мм) горизонтальная палка по середине высоты ниши.
          const rodY = Math.round(proj.clickY);
          y1 = rodY - 12; y2 = rodY + 12;
          x1 = niL;       x2 = niR;
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

          if (posA3D) {
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
          } else {
            ghostA.style.display = "none";
          }
          if (posB3D) {
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
          } else {
            ghostB.style.display = "none";
          }
        }
      };

      const onPointerDown = e => {
        // На тач-устройствах предотвращаем скролл страницы
        if (e.pointerType === 'touch') e.preventDefault();
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
      };
      const onPointerMove = e => {
        const { placeMode: pm } = propsRef.current;
        // Если идёт drag (мышь зажата и движется) — крутим сцену.
        // Иначе (просто hover в placeMode) — обновляем подсветку зоны.
        if (isDragging) {
          // Различаем «настоящий drag» от «дёрнул мышью при клике» по порогу:
          // если переместились дальше CLICK_THRESHOLD_PX — это уже точно drag
          const dx = e.clientX - downX;
          const dy = e.clientY - downY;
          const totalDist = Math.sqrt(dx * dx + dy * dy);
          if (totalDist >= CLICK_THRESHOLD_PX) {
            // Это вращение
            rotY += (e.clientX - prevX) * 0.004;
            rotX = Math.max(-1.0, Math.min(1.0, rotX + (e.clientY - prevY) * 0.004));
            prevX = e.clientX;
            prevY = e.clientY;
            // В placeMode при настоящем drag скрываем подсветку (мы крутим, не выбираем)
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
        isDragging = false;
        const { placeMode: pm, placeInZone: piz, setPlaceMode: spm } = propsRef.current;
        // Короткий клик (не drag)?
        const dx = (e?.clientX ?? 0) - downX;
        const dy = (e?.clientY ?? 0) - downY;
        const dt = Date.now() - downTime;
        const isClick = Math.sqrt(dx * dx + dy * dy) < CLICK_THRESHOLD_PX && dt < CLICK_THRESHOLD_MS;
        if (!isClick) return;

        // Сначала всегда проверяем — попал ли клик ПО ЭЛЕМЕНТУ.
        // Если да — выделяем (даже в placeMode!), и если был placeMode — сбрасываем его.
        // Это решает проблему: после постановки стойки её нельзя было выделить,
        // потому что placeMode оставался активным и клик считался постановкой.
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(group, true);
        const hit = hits.find(h => h.object?.userData?.elementId);

        if (hit && onElementClick) {
          // Клик попал на существующий элемент → выделяем
          if (pm && spm) spm(null);   // выходим из placeMode
          hideZone();
          onElementClick(hit.object.userData.elementId);
          return;
        }

        // Клик в пустое место
        if (pm && piz) {
          // ─── Режим постановки: проекция → placeInZone ───
          const proj = screenToCabinetMm(e.clientX, e.clientY);
          if (proj) {
            piz(null, proj.clickX, proj.clickY);
            hideZone();
          }
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

      const animate = () => {
        stateRef.current.animId = requestAnimationFrame(animate);
        if (!isDragging) {} // no auto-rotation — manual only
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
        if (dimFrameSkip === 0) updateDimLabels();
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
        renderer.dispose();
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

        {/* Toolbar — добавить элементы (открывает placeMode в 2D, затем клик в зону) */}
        {onAddElement && (
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            flex: isMobile ? "0 0 auto" : "initial",
          }}>
            {[
              { type: "shelf",   icon: "━", label: "Полка"  },
              { type: "stud",    icon: "┃", label: "Стойка" },
              { type: "drawers", icon: "☰", label: "Ящики"  },
              { type: "rod",     icon: "⎯", label: "Штанга" },
              { type: "door",    icon: "🚪", label: "Дверь"  },
              { type: "panel",   icon: "▯", label: "Панель" },
            ].map(it => (
              <button
                key={it.type}
                onClick={() => onAddElement(it.type)}
                style={{
                  padding: "6px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", border: "1px solid rgba(217,119,6,0.3)",
                  background: "rgba(217,119,6,0.08)", color: "#d97706",
                  fontFamily: "'IBM Plex Mono',monospace",
                  whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 4,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(217,119,6,0.2)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(217,119,6,0.08)"; }}
                title={`Добавить: ${it.label}`}
              >
                <span style={{ fontSize: 13 }}>{it.icon}</span>
                {!isMobile && <span>+ {it.label}</span>}
              </button>
            ))}
          </div>
        )}

        <button onClick={onClose} style={{
          padding: "6px 16px", borderRadius: 6, fontSize: 12, fontWeight: 700,
          cursor: "pointer",
          border: "1px solid rgba(96,165,250,0.3)",
          background: "rgba(96,165,250,0.08)",
          color: "#60a5fa",
          fontFamily: "'IBM Plex Mono',monospace",
          transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.target.style.background = "rgba(96,165,250,0.2)"; }}
          onMouseLeave={e => { e.target.style.background = "rgba(96,165,250,0.08)"; }}
          title="Переключиться на классический 2D-редактор"
        >📐 2D</button>
      </div>

      {/* BODY: 3D canvas + right panel (desktop) или bottom sheet (mobile) */}
      <div style={{
        flex: 1, display: "flex",
        flexDirection: isMobile ? "column" : "row",
        minHeight: 0,
      }}>
        {/* 3D canvas + индикатор placeMode сверху */}
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
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
            {dimsData.map(d => (
              <g key={d.key} data-dim-key={d.key} style={{ display: "none" }}>
                {/* Выносные линии (extension lines) — от точки шкафа до размерной линии */}
                <line data-ext="1" stroke="#94a3b8" strokeWidth="1" opacity="0.7" />
                <line data-ext="2" stroke="#94a3b8" strokeWidth="1" opacity="0.7" />
                {/* Размерная линия с рисками */}
                <line data-dim-line="1" stroke="#cbd5e1" strokeWidth="1.3" markerStart="url(#dim-tick)" markerEnd="url(#dim-tick)" />
                {/* Текст (число) поверх линии */}
                <text data-dim-text="1" fill="#e2e8f0" fontSize="13" fontFamily="'IBM Plex Mono', monospace" fontWeight="700" textAnchor="middle" dominantBaseline="central" stroke="#08090c" strokeWidth="3" paintOrder="stroke" />
              </g>
            ))}
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
          <GhostDimBadge
            refEl={ghostDimARef}
            isLocked={lockedDim === "A"}
            lockedValue={lockedValue}
            setLockedValue={setLockedValue}
            onCommit={() => commitLockedPlacement()}
            onCancel={cancelLocked}
            onToggle={toggleLockedSide}
            inputRef={lockedDim === "A" ? lockedInputRef : undefined}
          />
          <GhostDimBadge
            refEl={ghostDimBRef}
            isLocked={lockedDim === "B"}
            lockedValue={lockedValue}
            setLockedValue={setLockedValue}
            onCommit={() => commitLockedPlacement()}
            onCancel={cancelLocked}
            onToggle={toggleLockedSide}
            inputRef={lockedDim === "B" ? lockedInputRef : undefined}
          />

          {/* Кнопка toggle размеров — справа внизу canvas */}
          <button
            onClick={() => setShowDims(v => !v)}
            title={showDims ? "Скрыть размеры" : "Показать размеры"}
            style={{
              position: "absolute", bottom: 12, right: 12,
              padding: "6px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
              cursor: "pointer",
              border: "1px solid " + (showDims ? "rgba(96,165,250,0.4)" : "rgba(100,100,110,0.3)"),
              background: showDims ? "rgba(96,165,250,0.15)" : "rgba(30,30,40,0.8)",
              color: showDims ? "#60a5fa" : "#888",
              fontFamily: "'IBM Plex Mono', monospace",
              zIndex: 9,
              pointerEvents: "auto",
            }}
          >📏 {showDims ? "Размеры" : "Размеры off"}</button>

          {/* Индикатор активного placeMode — поверх 3D, сверху */}
          {placeMode && (
            <div style={{
              position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
              padding: "8px 16px", borderRadius: 6,
              background: lockedDim ? "rgba(251,191,36,0.95)" : "rgba(34,197,94,0.92)",
              color: "#000",
              fontSize: 12, fontWeight: 700,
              fontFamily: "'IBM Plex Mono',monospace",
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              zIndex: 10,
              pointerEvents: "auto",
            }}>
              <span>+ {PLACE_LABELS[placeMode] || placeMode}</span>
              <span style={{ opacity: 0.7, fontSize: 10 }}>
                {lockedDim
                  ? `· вводим ${lockedDim === "A" ? "←" : "→"} · Space=сменить · Enter=OK · Esc=отмена`
                  : placeMode === "stud"
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
                }}
                title="Отменить постановку"
              >✕</button>
            </div>
          )}
        </div>

        {/* Панель свойств — появляется при выделении элемента.
            В placeMode скрыта чтобы не загораживать подсветку зоны постановки. */}
        {selEl && !placeMode && (
          <PropsPanel3D
            selEl={selEl}
            updateEl={updateEl}
            delSel={delSel}
            onClose={() => onElementClick?.(null)}
            iW={iW}
            iH={iH}
            t={t}
            isMobile={isMobile}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// GhostDimBadge — жёлтая цифра рядом с фантомом при placeMode.
// ═══════════════════════════════════════════════════════════════
// Позиция обновляется императивно из updateZoneHighlight через refEl (ref на контейнер).
// Внутри — либо текст (отображаемый режим), либо <input> (режим ввода).
//
// Активация режима ввода — по клавише Space (глобальный listener в Wardrobe3D).
// Когда input сфокусирован — window-handler игнорирует Space, а input сам вызывает
// onToggle (переключить A ↔ B) / onCommit (Enter) / onCancel (Escape).
function GhostDimBadge({
  refEl,
  isLocked,
  lockedValue,
  setLockedValue,
  onCommit,
  onCancel,
  onToggle,
  inputRef,
}) {
  const baseStyle = {
    position: "absolute",
    left: 0, top: 0,
    transform: "translate(-50%, -50%)",
    padding: isLocked ? "1px 4px" : "2px 6px",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#1a1a1a",
    background: isLocked ? "#fde68a" : "rgba(251,191,36,0.92)",
    border: isLocked ? "1px solid #b45309" : "1px solid rgba(180,83,9,0.5)",
    borderRadius: 2,
    whiteSpace: "nowrap",
    userSelect: "none",
    display: "none",
    boxShadow: isLocked ? "0 0 0 2px rgba(251,191,36,0.3)" : "0 1px 3px rgba(0,0,0,0.3)",
    zIndex: isLocked ? 8 : 6,
    pointerEvents: "none",
    textAlign: "center",
    lineHeight: 1.2,
  };

  if (isLocked) {
    return (
      <div ref={refEl} style={{ ...baseStyle, pointerEvents: "auto" }}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={lockedValue}
          onChange={e => {
            const v = e.target.value.replace(/[^\d]/g, "");
            setLockedValue(v);
          }}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            } else if (e.key === " ") {
              // Space внутри input → переключаем сторону (не даём пробелу вставиться)
              e.preventDefault();
              onToggle?.();
            }
          }}
          style={{
            width: 45,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "'IBM Plex Mono', monospace",
            color: "#1a1a1a",
            textAlign: "center",
            padding: 0,
            margin: 0,
            lineHeight: 1.2,
          }}
        />
      </div>
    );
  }

  return <div ref={refEl} style={baseStyle} />;
}

// ═══════════════════════════════════════════════════════════════
// PropsPanel3D — панель свойств выделенного элемента, поверх 3D
// ═══════════════════════════════════════════════════════════════
// Десктоп: sidebar справа (320px), 3D сжимается по ширине.
// Мобильный: bottom sheet снизу (max 50% высоты), 3D сжимается по высоте.
// Содержит минимальный набор полей для редактирования: координаты,
// размеры, тип (для двери/панели), кнопку удаления.
// В Сессии 2 будет расширен: добавление новых элементов через click-to-place.
function PropsPanel3D({ selEl, updateEl, delSel, onClose, iW, iH, t, isMobile }) {
  if (!selEl) return null;

  const baseStyle = isMobile ? {
    position: "absolute", bottom: 0, left: 0, right: 0,
    maxHeight: "50%", overflowY: "auto",
    background: "rgba(11,12,16,0.98)",
    borderTop: "1px solid rgba(96,165,250,0.3)",
    padding: "16px 20px 20px",
    boxShadow: "0 -4px 20px rgba(0,0,0,0.5)",
  } : {
    width: 320, minWidth: 320, flexShrink: 0,
    background: "rgba(11,12,16,0.98)",
    borderLeft: "1px solid rgba(50,50,60,0.4)",
    padding: "16px 18px",
    overflowY: "auto",
  };

  // Компактное числовое поле
  const NumField = ({ label, value, onChange, min, max, step = 1, color = "#60a5fa" }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <input
        type="number"
        value={Math.round(value ?? 0)}
        onChange={e => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v)) return;
          const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
          onChange(clamped);
        }}
        step={step}
        style={{
          width: "100%", padding: "6px 8px", borderRadius: 4,
          background: "rgba(30,30,40,0.7)",
          border: "1px solid rgba(60,60,70,0.6)",
          color, fontSize: 12, fontWeight: 700,
          fontFamily: "'IBM Plex Mono',monospace",
          textAlign: "center",
        }}
      />
    </div>
  );

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
