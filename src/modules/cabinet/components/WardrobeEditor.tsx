import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import Wardrobe3D from "./Wardrobe3D";
import { TexturePicker, getTextureInfo } from "./TexturePicker";

const SC = 0.28, MIN_S = 100, SNAP = 5;
const TOOLS = [
  { type: "shelf",   label: "Полка",   icon: "━", key: "S" },
  { type: "stud",    label: "Стойка",  icon: "┃", key: "P" },
  { type: "drawers", label: "Ящики",   icon: "☰", key: "D" },
  { type: "rod",     label: "Штанга",  icon: "⎯", key: "R" },
  { type: "door",    label: "Дверь",   icon: "🚪", key: "F" },
];
const GUIDES = [
  { id: "roller", label: "Роликовые", p: 120 },
  { id: "ball",   label: "Шариковые", p: 280 },
  { id: "tandem", label: "Тандембокс", p: 950 },
];
const HINGES = [
  { id: "overlay", label: "Накладная" },
  { id: "insert",  label: "Вкладная" },
];
let _id = 0; const uid = () => "e" + ++_id;

/* ═══ ZONE COMPUTATION ═══
   Zones are per-column, per-band rectangles.
   Key fix: A shelf only creates a Y-break in columns it actually covers. */
function computeZones(els, iW, iH, t) {
  const shelves = els.filter(e => e.type === "shelf").sort((a, b) => a.y - b.y);
  const studs = els.filter(e => e.type === "stud");

  // Step 1: Determine vertical columns from studs (global, not band-dependent for simplicity)
  // We use studs at their full declared height to establish columns
  const studXs = studs.map(st => st.x).sort((a, b) => a - b);
  const colBreaks = [0, ...studXs, iW];
  const uniqueColX = [...new Set(colBreaks)].sort((a, b) => a - b);

  const zones = [];

  // Step 2: For each column, determine its own Y-breaks from shelves that span it
  for (let ci = 0; ci < uniqueColX.length - 1; ci++) {
    const colLeft = uniqueColX[ci];
    const colRight = uniqueColX[ci + 1];
    const colMid = (colLeft + colRight) / 2;

    // Find shelves that actually cover this column
    const colShelves = shelves.filter(sh => {
      const shLeft = sh.x || 0;
      const shRight = shLeft + (sh.w || iW);
      // Shelf covers this column if it spans across any part of it
      return shRight > colLeft + 5 && shLeft < colRight - 5;
    });

    // Y-breaks for this column only
    const yBreaks = [0, ...colShelves.map(s => s.y), iH];
    const uniqueY = [...new Set(yBreaks)].sort((a, b) => a - b);

    // Check which studs are active in each Y-band of this column
    for (let yi = 0; yi < uniqueY.length - 1; yi++) {
      const bandTop = uniqueY[yi];
      const bandBot = uniqueY[yi + 1];

      // Only studs that span this Y-band AND are at the column boundaries
      const isLeftStud = ci > 0 && studs.some(st =>
        Math.abs(st.x - colLeft) < 5 && (st.pTop ?? 0) <= bandTop + 5 && (st.pBot ?? iH) >= bandBot - 5
      );

      const zLeft = colLeft + (isLeftStud ? t : (ci > 0 ? t : 0));
      const zRight = colRight;

      zones.push({
        left: colLeft, right: colRight,
        sl: colLeft + (ci > 0 ? t : 0), sw: colRight - colLeft - (ci > 0 ? t : 0),
        top: bandTop, bot: bandBot,
        bandIdx: yi, colIdx: ci,
        id: `z_${ci}_${yi}`,
      });
    }
  }
  return zones;
}

function findZone(zones, x, y) {
  return zones.find(z => x >= z.sl - 10 && x < z.right + 10 && y >= z.top - 5 && y < z.bot + 5) || zones[0];
}

/* ═══ HARDWARE ═══ */
function calcHW(c, els) {
  const hw = [];
  hw.push({ n: "Конфирмат 5×50", i: "🔩", q: 8, r: "Корпус" });
  hw.push({ n: "Шкант 8×30", i: "🪵", q: 8, r: "Усиление" });
  const np = els.filter(e => e.type === "stud").length;
  if (np) hw.push({ n: "Конфирмат", i: "🔩", q: np * 4, r: `Стойки: ${np}` });
  const ns = els.filter(e => e.type === "shelf").length;
  if (ns) hw.push({ n: "Полкодерж.", i: "📌", q: ns * 4, r: `Полки: ${ns}` });
  els.filter(e => e.type === "drawers").forEach(dr => {
    const cnt = dr.count || 3;
    const gt = GUIDES.find(g => g.id === (dr.guideType || "roller")) || GUIDES[0];
    hw.push({ n: gt.label, i: "↔️", q: cnt * 2, r: `Ящ×${cnt}` });
    hw.push({ n: "Конф.(ящики)", i: "🔩", q: cnt * 8, r: `Ящ×${cnt}` });
  });
  const nr = els.filter(e => e.type === "rod").length;
  if (nr) hw.push({ n: "Штангодерж.", i: "🪝", q: nr * 2, r: `Шт: ${nr}` });
  els.filter(e => e.type === "door").forEach(d => {
    const hn = (d.h || 600) > 1800 ? 4 : (d.h || 600) > 1200 ? 3 : 2;
    hw.push({ n: (d.hingeType || "overlay") === "insert" ? "Петля вкладн." : "Петля накл.", i: "🚪", q: hn, r: "Дв" });
    hw.push({ n: "Евровинт", i: "🔧", q: hn * 2, r: "Планки" });
  });
  hw.push({ n: "Гвоздь", i: "📍", q: Math.ceil(2 * (c.width + c.height) / 200), r: "Задн." });
  hw.push({ n: "Опора", i: "🦿", q: c.width > 800 ? 6 : 4, r: "Опоры" });
  return hw;
}

function calcParts(c, els) {
  const { width: W, height: H, depth: D, thickness: tt } = c; const p = [];
  p.push({ n: "Боковина", q: 2, l: H, w: D });
  p.push({ n: "Крыша", q: 1, l: W - 2 * tt, w: D });
  p.push({ n: "Дно", q: 1, l: W - 2 * tt, w: D });
  p.push({ n: "Задн.ст", q: 1, l: H - 4, w: W - 4, m: 1 });
  els.filter(e => e.type === "stud").forEach((st, i) => p.push({ n: `Стойка${i + 1}`, q: 1, l: Math.round((st.pBot || H) - (st.pTop || 0)), w: D - 4 }));
  els.filter(e => e.type === "shelf").forEach((s, i) => p.push({ n: `Полка${i + 1}`, q: 1, l: Math.round(s.w), w: D - 4 }));
  els.filter(e => e.type === "door").forEach((d, i) => p.push({ n: `Дверь${i + 1}`, q: 1, l: Math.round(d.doorH || d.h || 0), w: Math.round(d.doorW || d.w || 0) }));
  els.filter(e => e.type === "drawers").forEach((dr, i) => {
    const cnt = dr.count || 3, heights = dr.drawerHeights || [];
    for (let j = 0; j < cnt; j++) { const dH = heights[j] || Math.floor((dr.h || 450) / cnt); p.push({ n: `Фас.ящ${i + 1}.${j + 1}`, q: 1, l: dH - 6, w: Math.round(dr.w || 400) - 4 }); p.push({ n: `Бок.ящ${i + 1}.${j + 1}`, q: 2, l: D - 50, w: dH - 36 }); }
  });
  return p;
}

/* ═══ SVG INPUT ═══ */
function SvgInput({ x, y, width, value, onChange, color = "#d97706", anchor = "middle", fontSize = 9 }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const ref = useRef(null);
  useEffect(() => { if (!editing) setText(String(value)); }, [value, editing]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  const commit = () => { setEditing(false); const n = parseInt(text); if (!isNaN(n) && n > 0 && n < 5000) onChange(n); else setText(String(value)); };
  const foW = Math.max(width, 42), foX = anchor === "middle" ? x - foW / 2 : x;
  if (!editing) return <text x={x} y={y} textAnchor={anchor} fontSize={fontSize} fill={color} fontWeight="bold" style={{ cursor: "pointer" }} onClick={e => { e.stopPropagation(); setEditing(true); }} fontFamily="'IBM Plex Mono',monospace">{Math.round(value)}</text>;
  return <foreignObject x={foX} y={y - 12} width={foW} height={18}>
    <input ref={ref} type="text" value={text} onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setText(String(value)); } if (e.key === "Tab") { e.preventDefault(); commit(); } }}
      onClick={e => e.stopPropagation()} style={{ width: "100%", height: "100%", padding: "0 2px", fontSize: fontSize + 1, fontFamily: "'IBM Plex Mono',monospace", background: "#111318", border: `1.5px solid ${color}`, borderRadius: 3, color, outline: "none", textAlign: "center", boxSizing: "border-box" }} />
  </foreignObject>;
}

function NumInput({ value, onChange, min = 0, max = 5000, color = "#d97706", width = "100%", label }) {
  const [text, setText] = useState(String(value));
  const [ed, setEd] = useState(false);
  useEffect(() => { if (!ed) setText(String(value)); }, [value, ed]);
  const commit = () => { setEd(false); const n = parseInt(text); if (!isNaN(n) && n >= min && n <= max) onChange(n); else setText(String(value)); };
  return <div>
    {label && <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>{label}</div>}
    <input type="text" value={ed ? text : String(value)} onFocus={() => setEd(true)} onChange={e => { setEd(true); setText(e.target.value); }}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { commit(); e.target.blur(); } if (e.key === "Escape") { setEd(false); setText(String(value)); e.target.blur(); } }}
      style={{ width, padding: "3px 6px", fontSize: 12, background: "#111318", border: `1px solid ${color}44`, borderRadius: 4, color, outline: "none", textAlign: "center", fontFamily: "'IBM Plex Mono',monospace" }} />
  </div>;
}

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
  const [corpusTextureId, setCorpusTextureId] = useState("egger-h1137");
  const [facadeTextureId, setFacadeTextureId] = useState("egger-w1100");
  const [customTextures, setCustomTextures] = useState([]);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [dimDirOverrides, setDimDirOverrides] = useState({});
  const [show3d, setShow3d] = useState(false);
  /* Unified placement: click tool → highlight zones → click zone → place element
     For doors: special mode where user picks 4 boundaries */
  const [placeMode, setPlaceMode] = useState(null); // null | "shelf" | "stud" | "drawers" | "rod" | "door"

  const orderRef = useRef(1);
  const svgRef = useRef(null);

  const t = corpus.thickness, iW = corpus.width - 2 * t, iH = corpus.height - 2 * t;
  const selEl = elements.find(e => e.id === selId) || null;
  const corpusTexInfo = getTextureInfo(corpusTextureId, customTextures);
  const facadeTexInfo = getTextureInfo(facadeTextureId, customTextures);

  /* ═══ MUTUAL BOUNDS WITH ORDER PRIORITY ═══
     Rule: The element placed FIRST goes full span. The element placed LATER stops at it.
     - Shelf placed before stud → shelf full width, stud stops at shelf
     - Stud placed before shelf → stud full height, shelf stops at stud
     _order: lower = placed earlier = wins */

  const computeStudBounds = useCallback((stud, allEls) => {
    const shelves = allEls.filter(e => e.type === "shelf");
    const sx = stud.x || 0;
    const anchorY = stud.anchorY ?? iH / 2;
    const studOrder = stud._order || 0;
    // Only shelves placed BEFORE this stud can truncate it
    // AND the shelf must span across the stud's X position
    const bounding = shelves.filter(sh => {
      const shOrder = sh._order || 0;
      if (shOrder >= studOrder) return false; // shelf placed after stud → doesn't truncate
      const shLeft = sh.x || 0;
      const shRight = shLeft + (sh.w || iW);
      return sx >= shLeft - 5 && sx <= shRight + 5;
    });
    let pTop = 0, pBot = iH;
    bounding.forEach(sh => {
      if (sh.y <= anchorY && sh.y > pTop) pTop = sh.y;
      if (sh.y > anchorY && sh.y < pBot) pBot = sh.y;
    });
    return { pTop, pBot };
  }, [iH, iW]);

  const computeShelfSpan = useCallback((shelf, allEls) => {
    const studs = allEls.filter(e => e.type === "stud");
    const sy = shelf.y || 0;
    const shelfOrder = shelf._order || 0;
    // Only studs placed BEFORE this shelf can block it
    const blocking = studs.filter(st => {
      const stOrder = st._order || 0;
      if (stOrder >= shelfOrder) return false; // stud placed after shelf → doesn't block
      const sx = st.x || 0;
      // Stud must span across shelf's Y position
      // Compute stud's vertical range using shelves placed before the stud
      const anchorY = st.anchorY ?? iH / 2;
      const earlierShelves = allEls.filter(e => e.type === "shelf" && e.id !== shelf.id && (e._order || 0) < stOrder);
      let sTop = 0, sBot = iH;
      earlierShelves.forEach(sh => {
        const shLeft = sh.x || 0;
        const shRight = shLeft + (sh.w || iW);
        if (sx >= shLeft - 5 && sx <= shRight + 5) {
          if (sh.y < anchorY && sh.y > sTop) sTop = sh.y;
          if (sh.y > anchorY && sh.y < sBot) sBot = sh.y;
        }
      });
      return sy >= sTop && sy <= sBot;
    });
    if (blocking.length === 0) return { x: 0, w: iW };
    const anchor = shelf.anchorX ?? ((shelf.x || 0) + (shelf.w || iW) / 2);
    const xBreaks = [0, ...blocking.map(st => st.x).sort((a, b) => a - b), iW];
    for (let i = 0; i < xBreaks.length - 1; i++) {
      const left = xBreaks[i], right = xBreaks[i + 1];
      if (anchor >= left && anchor < right) {
        const sl = left + (i > 0 ? t : 0);
        return { x: sl, w: right - sl };
      }
    }
    const lastLeft = xBreaks[xBreaks.length - 2];
    const lastIdx = xBreaks.length - 2;
    const sl = lastLeft + (lastIdx > 0 ? t : 0);
    return { x: sl, w: iW - sl };
  }, [iW, iH, t]);

  /* ═══ ADJUST ALL ELEMENTS ═══ */
  const adjust = useCallback((els) => {
    // Pass 1: compute stud bounds (studs stop at shelves)
    let result = els.map(el => {
      if (el.type !== "stud") return el;
      const { pTop, pBot } = computeStudBounds(el, els);
      return { ...el, pTop, pBot };
    });

    // Pass 2: compute shelf spans (shelves stop at studs)
    result = result.map(el => {
      if (el.type !== "shelf") return el;
      const { x, w } = computeShelfSpan(el, result);
      // Update anchorX to center of computed span so shelf stays in its segment
      return { ...el, x, w, anchorX: x + w / 2 };
    });

    // Recompute stud bounds with updated shelf spans
    result = result.map(el => {
      if (el.type !== "stud") return el;
      const { pTop, pBot } = computeStudBounds(el, result);
      return { ...el, pTop, pBot };
    });

    const zones = computeZones(result, iW, iH, t);

    // Snap drawers/rods/doors
    result = result.map(el => {
      if (el.type === "drawers" || el.type === "rod") {
        // During drag, use _dragX to find new horizontal bounds
        if (el._dragX !== undefined) {
          const elY = el.y || 0;
          const elH = el.type === "drawers" ? (el.h || 450) : 20;
          const elMidY = elY + elH / 2;
          const shelves = result.filter(e => e.type === "shelf");
          const vBounds = [
            { x: 0 },
            ...result.filter(e => e.type === "stud").filter(st => {
              // Compute real stud Y-range using ALL shelves
              const sx = st.x || 0;
              const anchorY = st.anchorY ?? iH / 2;
              const spanning = shelves.filter(sh => (sh.x || 0) < sx - 5 && (sh.x || 0) + (sh.w || iW) > sx + t + 5);
              let sTop = 0, sBot = iH;
              spanning.forEach(sh => { if (sh.y <= anchorY && sh.y > sTop) sTop = sh.y; if (sh.y > anchorY && sh.y < sBot) sBot = sh.y; });
              return elMidY >= sTop - 5 && elMidY <= sBot + 5;
            }).map(st => ({ x: st.x })),
            { x: iW },
          ].sort((a, b) => a.x - b.x);
          const cx = el._dragX;
          let left = vBounds[0];
          for (const v of vBounds) { if (v.x <= cx + 5) left = v; else break; }
          let right = vBounds[vBounds.length - 1];
          for (let i = vBounds.length - 1; i >= 0; i--) { if (vBounds[i].x >= cx - 5) right = vBounds[i]; else break; }
          if (left.x >= right.x) { const li = vBounds.indexOf(left); if (li > 0) left = vBounds[li - 1]; }
          const innerLeft = left.x + (left.x > 0 ? t : 0);
          const innerW = right.x - innerLeft;
          if (el.type === "drawers") return { ...el, x: innerLeft, w: innerW };
          if (el.type === "rod") return { ...el, x: innerLeft + 20, w: innerW - 40 };
        }
        return el; // keep placed dimensions
      }
      if (el.type === "door") {
        // If door has manual width/height override, preserve it
        if (el.manualW || el.manualH) {
          return el; // skip auto-calculation, keep manual dimensions
        }
        // Doors with stored boundaries (new system)
        if (el.doorLeft !== undefined) {
          const OC = 14, OS = 7;
          const ht = el.hingeType || "overlay";
          const innerLeft = el.doorLeft + (el.doorLeft > 0 ? t : 0);
          const innerW = el.doorRight - innerLeft;
          if (ht === "overlay") {
            const lo = el.doorLeftIsWall ? OC : OS;
            const ro = el.doorRightIsWall ? OC : OS;
            const to = el.doorTopIsWall ? OC : OS;
            const bo = el.doorBottomIsWall ? OC : OS;
            const dX = innerLeft - lo, dW = innerW + lo + ro;
            const dY = el.doorTop - to, dH = (el.doorBottom - el.doorTop) + to + bo;
            return { ...el, x: dX, w: dW, h: dH, doorW: dW, doorH: dH, y: dY };
          } else {
            const gap = 2;
            return { ...el, x: innerLeft + gap, w: innerW - gap * 2, h: (el.doorBottom - el.doorTop) - gap * 2, doorW: innerW - gap * 2, doorH: (el.doorBottom - el.doorTop) - gap * 2, y: el.doorTop + gap };
          }
        }
        // Legacy zone-based doors (backward compat)
        const targetId = el.doorTarget;
        let z = targetId ? zones.find(zz => zz.id === targetId) : null;
        if (!z) { const cx = (el.x || 0) + (el.w || 0) / 2; z = findZone(zones, cx, iH / 2); }
        const ht = el.hingeType || "overlay";
        if (ht === "overlay") {
          const OC = 14, OS = 7;
          const isLW = z.left <= 0, isRW = z.right >= iW;
          const lo = isLW ? OC : OS, ro = isRW ? OC : OS;
          const to = z.top <= 0 ? OC : OS, bo = z.bot >= iH ? OC : OS;
          const dX = z.sl - lo, dW = z.sw + lo + ro;
          const dY = z.top - to, dH = (z.bot - z.top) + to + bo;
          return { ...el, x: dX, w: dW, h: dH, doorW: dW, doorH: dH, y: dY, zoneId: z.id, doorTarget: z.id };
        } else {
          const gap = 2;
          const dW = z.sw - gap * 2, dH = (z.bot - z.top) - gap * 2;
          return { ...el, x: z.sl + gap, w: dW, h: dH, doorW: dW, doorH: dH, y: z.top + gap, zoneId: z.id, doorTarget: z.id };
        }
      }
      return el;
    });

    // Constrain drawers — group by overlapping X ranges (not zones)
    const drawerEls = result.filter(el => el.type === "drawers");
    if (drawerEls.length > 1) {
      // Group drawers that overlap in X
      const groups = [];
      drawerEls.forEach(dr => {
        const dx1 = dr.x || 0, dx2 = dx1 + (dr.w || 400);
        const existing = groups.find(g => g.some(d => {
          const gx1 = d.x || 0, gx2 = gx1 + (d.w || 400);
          return dx1 < gx2 - 5 && dx2 > gx1 + 5; // X overlap
        }));
        if (existing) existing.push(dr);
        else groups.push([dr]);
      });
      const updates = {};
      groups.forEach(group => {
        if (group.length < 2) return;
        group.sort((a, b) => (a.y || 0) - (b.y || 0));
        for (let i = 1; i < group.length; i++) {
          const prev = group[i - 1];
          const prevY = updates[prev.id]?.y ?? prev.y ?? 0;
          const prevBot = prevY + (prev.h || 450);
          const cur = group[i];
          let curY = cur.y || 0;
          if (curY < prevBot) curY = prevBot;
          updates[cur.id] = { y: curY };
        }
      });
      if (Object.keys(updates).length > 0) {
        result = result.map(el => updates[el.id] ? { ...el, ...updates[el.id] } : el);
      }
    }

    /* ═══ DOOR OVERLAP PREVENTION ═══
       Between any two overlay doors that overlap, add 2mm gap.
       Doors are shrunk symmetrically at their shared edge. */
    const doors = result.filter(e => e.type === "door");
    if (doors.length > 1) {
      const doorUpdates = {};
      for (let i = 0; i < doors.length; i++) {
        for (let j = i + 1; j < doors.length; j++) {
          const a = doorUpdates[doors[i].id] ? { ...doors[i], ...doorUpdates[doors[i].id] } : doors[i];
          const b = doorUpdates[doors[j].id] ? { ...doors[j], ...doorUpdates[doors[j].id] } : doors[j];
          const ax1 = a.x, ax2 = a.x + a.w, ay1 = a.y, ay2 = a.y + a.h;
          const bx1 = b.x, bx2 = b.x + b.w, by1 = b.y, by2 = b.y + b.h;

          // Check if they overlap
          const overlapX = ax1 < bx2 && ax2 > bx1;
          const overlapY = ay1 < by2 && ay2 > by1;
          if (!overlapX || !overlapY) continue;

          const GAP = 2;
          // Determine shared edge direction
          const overlapW = Math.min(ax2, bx2) - Math.max(ax1, bx1);
          const overlapH = Math.min(ay2, by2) - Math.max(ay1, by1);

          if (overlapW < overlapH) {
            // Horizontal overlap — doors are side by side, fix X
            if (a.x < b.x) {
              // A is left, B is right — shrink A's right and B's left
              const mid = (ax2 + bx1) / 2;
              doorUpdates[doors[i].id] = { ...doorUpdates[doors[i].id], w: mid - GAP / 2 - a.x, doorW: mid - GAP / 2 - a.x };
              doorUpdates[doors[j].id] = { ...doorUpdates[doors[j].id], x: mid + GAP / 2, w: bx2 - (mid + GAP / 2), doorW: bx2 - (mid + GAP / 2) };
            } else {
              const mid = (bx2 + ax1) / 2;
              doorUpdates[doors[j].id] = { ...doorUpdates[doors[j].id], w: mid - GAP / 2 - b.x, doorW: mid - GAP / 2 - b.x };
              doorUpdates[doors[i].id] = { ...doorUpdates[doors[i].id], x: mid + GAP / 2, w: ax2 - (mid + GAP / 2), doorW: ax2 - (mid + GAP / 2) };
            }
          } else {
            // Vertical overlap — doors are top/bottom, fix Y
            if (a.y < b.y) {
              const mid = (ay2 + by1) / 2;
              doorUpdates[doors[i].id] = { ...doorUpdates[doors[i].id], h: mid - GAP / 2 - a.y, doorH: mid - GAP / 2 - a.y };
              doorUpdates[doors[j].id] = { ...doorUpdates[doors[j].id], y: mid + GAP / 2, h: by2 - (mid + GAP / 2), doorH: by2 - (mid + GAP / 2) };
            } else {
              const mid = (by2 + ay1) / 2;
              doorUpdates[doors[j].id] = { ...doorUpdates[doors[j].id], h: mid - GAP / 2 - b.y, doorH: mid - GAP / 2 - b.y };
              doorUpdates[doors[i].id] = { ...doorUpdates[doors[i].id], y: mid + GAP / 2, h: ay2 - (mid + GAP / 2), doorH: ay2 - (mid + GAP / 2) };
            }
          }
        }
      }
      if (Object.keys(doorUpdates).length > 0) {
        result = result.map(el => doorUpdates[el.id] ? { ...el, ...doorUpdates[el.id] } : el);
      }
    }

    return result;
  }, [iW, iH, t, computeStudBounds, computeShelfSpan]);

  const zones = useMemo(() => computeZones(elements, iW, iH, t), [elements, iW, iH, t]);

  /* ═══ UNIFIED ADD ═══ */
  const addEl = useCallback((type) => {
    setPlaceMode(prev => prev === type ? null : type);
    
  }, []);

  /* Find 4 nearest boundaries around a click point */
  const findDoorBounds = useCallback((clickX, clickY) => {
    // Compute real stud Y-ranges using ALL shelves (ignoring _order)
    // This determines if a stud actually exists at the click Y level
    const allShelves = elements.filter(e => e.type === "shelf");
    const allStuds = elements.filter(e => e.type === "stud");

    const getStudRealRange = (stud) => {
      const sx = stud.x || 0;
      const anchorY = stud.anchorY ?? iH / 2;
      // A shelf limits this stud ONLY if it passes THROUGH the stud's X position
      // (shelf spans from before stud to after stud, not just touches it)
      const spanning = allShelves.filter(sh => {
        const shLeft = sh.x || 0;
        const shRight = shLeft + (sh.w || iW);
        // Shelf must extend PAST the stud on both sides (or from wall through stud)
        return shLeft < sx - 5 && shRight > sx + t + 5;
      });
      let sTop = 0, sBot = iH;
      spanning.forEach(sh => {
        if (sh.y <= anchorY && sh.y > sTop) sTop = sh.y;
        if (sh.y > anchorY && sh.y < sBot) sBot = sh.y;
      });
      return { sTop, sBot };
    };

    // Vertical boundaries: walls + studs that ACTUALLY span this Y level
    const vBounds = [
      { x: 0, isWall: true },
      ...allStuds.filter(st => {
        const { sTop, sBot } = getStudRealRange(st);
        return clickY >= sTop - 5 && clickY <= sBot + 5;
      }).map(st => ({ x: st.x, isWall: false })),
      { x: iW, isWall: true },
    ].sort((a, b) => a.x - b.x);

    // Horizontal boundaries: top/bottom walls + shelves that span this X level
    const hBounds = [
      { y: 0, isWall: true },
      ...allShelves.filter(sh => {
        const shLeft = sh.x || 0, shRight = shLeft + (sh.w || iW);
        return clickX >= shLeft - 5 && clickX <= shRight + 5;
      }).map(sh => ({ y: sh.y, isWall: false, xLeft: sh.x || 0, xRight: (sh.x || 0) + (sh.w || iW) })),
      { y: iH, isWall: true },
    ].sort((a, b) => a.y - b.y);

    // Find LEFT: rightmost V boundary that is to the left of click
    let left = vBounds[0];
    for (const v of vBounds) { if (v.x <= clickX + 5) left = v; else break; }
    // Find RIGHT: leftmost V boundary to the right of click
    let right = vBounds[vBounds.length - 1];
    for (let i = vBounds.length - 1; i >= 0; i--) { if (vBounds[i].x >= clickX - 5) right = vBounds[i]; else break; }
    // Ensure left < right
    if (left.x >= right.x) {
      const li = vBounds.indexOf(left);
      if (li > 0) left = vBounds[li - 1];
      else if (li < vBounds.length - 1) right = vBounds[li + 1];
    }

    // Find TOP: lowest H boundary above click (only shelves that span this X range)
    let top = hBounds[0];
    for (const h of hBounds) {
      if (h.y > clickY - 5) break;
      // Check if this shelf spans across the click X (or is a wall)
      if (h.isWall || (h.xLeft !== undefined && clickX >= h.xLeft - 5 && clickX <= h.xRight + 5)) {
        top = h;
      }
    }
    // Find BOTTOM: highest H boundary below click
    let bottom = hBounds[hBounds.length - 1];
    for (let i = hBounds.length - 1; i >= 0; i--) {
      if (hBounds[i].y < clickY + 5) break;
      if (hBounds[i].isWall || (hBounds[i].xLeft !== undefined && clickX >= hBounds[i].xLeft - 5 && clickX <= hBounds[i].xRight + 5)) {
        bottom = hBounds[i];
      }
    }
    if (top.y >= bottom.y) {
      const ti = hBounds.indexOf(top);
      if (ti < hBounds.length - 1) bottom = hBounds[ti + 1];
      else if (ti > 0) top = hBounds[ti - 1];
    }

    return { left, right, top, bottom };
  }, [elements, iW, iH]);

  /* Place element into clicked zone */
  const placeInZone = useCallback((zone, clickX, clickY) => {
    if (!placeMode) return;
    const id = uid();
    const _order = orderRef.current++;
    let el;

    if (placeMode === "shelf") {
      const y = Math.max(20, Math.min(iH - 20, Math.round(clickY)));
      el = { id, type: "shelf", x: 0, y, w: iW, anchorX: zone.sl + zone.sw / 2, _order };
    } else if (placeMode === "stud") {
      const x = Math.round(zone.sl + zone.sw / 2);
      el = { id, type: "stud", x, anchorY: Math.round((zone.top + zone.bot) / 2), pTop: zone.top, pBot: zone.bot, _order };
    } else if (placeMode === "drawers") {
      /* Use smart boundary detection for width (same as doors) */
      const bounds = findDoorBounds(clickX, clickY);
      const innerLeft = bounds.left.x + (bounds.left.x > 0 ? t : 0);
      const innerW = bounds.right.x - innerLeft;
      el = { id, type: "drawers", x: innerLeft, y: Math.max(bounds.top.y, bounds.bottom.y - 450), w: innerW, h: 450, count: 3, guideType: "roller", drawerHeights: [150, 150, 150], _order };
    } else if (placeMode === "rod") {
      const bounds = findDoorBounds(clickX, clickY);
      const innerLeft = bounds.left.x + (bounds.left.x > 0 ? t : 0);
      const innerW = bounds.right.x - innerLeft;
      el = { id, type: "rod", x: innerLeft + 20, y: Math.round(clickY), w: innerW - 40, _order };
    } else if (placeMode === "door") {
      /* SMART DOOR: one click — find 4 nearest boundaries */
      const bounds = findDoorBounds(clickX, clickY);
      const OC = 14, OS = 7;
      const lo = bounds.left.isWall ? OC : OS;
      const ro = bounds.right.isWall ? OC : OS;
      const to = bounds.top.isWall ? OC : OS;
      const bo = bounds.bottom.isWall ? OC : OS;

      const innerLeft = bounds.left.x + (bounds.left.x > 0 ? t : 0);
      const innerW = bounds.right.x - innerLeft;
      const hingeType = "overlay";

      let dX, dW, dY, dH;
      if (hingeType === "overlay") {
        dX = innerLeft - lo;
        dW = innerW + lo + ro;
        dY = bounds.top.y - to;
        dH = (bounds.bottom.y - bounds.top.y) + to + bo;
      } else {
        const gap = 2;
        dX = innerLeft + gap;
        dW = innerW - gap * 2;
        dY = bounds.top.y + gap;
        dH = (bounds.bottom.y - bounds.top.y) - gap * 2;
      }

      el = {
        id, type: "door", x: dX, y: dY, w: dW, h: dH, doorW: dW, doorH: dH,
        hingeSide: "left", hingeType,
        doorLeft: bounds.left.x, doorRight: bounds.right.x, doorTop: bounds.top.y, doorBottom: bounds.bottom.y,
        doorLeftIsWall: bounds.left.isWall, doorRightIsWall: bounds.right.isWall,
        doorTopIsWall: bounds.top.isWall, doorBottomIsWall: bounds.bottom.isWall,
        _order,
      };
    } else return;

    setElements(prev => adjust([...prev, el]));
    setSelId(id);
    setPlaceMode(null);
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

  const toSvg = useCallback((e) => { const svg = svgRef.current; if (!svg) return { x: 0, y: 0 }; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const s = pt.matrixTransform(svg.getScreenCTM().inverse()); return { x: s.x / SC - t, y: s.y / SC - t }; }, [t]);

  /* SVG click — place element in zone, or deselect */
  const onSvgClick = useCallback((e) => {
    if (placeMode) {
      const c = toSvg(e);
      const z = findZone(zones, c.x, c.y);
      if (z) placeInZone(z, c.x, c.y);
      return;
    }
    setSelId(null);
  }, [placeMode, toSvg, zones, placeInZone]);

  const onDown = useCallback((e, el) => {
    if (placeMode) return;
    e.stopPropagation(); setSelId(el.id); const c = toSvg(e); setDrag({ id: el.id, ox: c.x - (el.x || 0), oy: c.y - (el.y || 0), type: el.type });
  }, [toSvg, placeMode]);

  /* Door resize: drag handle on edge to expand/shrink to nearest boundary */
  const onDoorEdgeDrag = useCallback((e, doorEl, edge) => {
    if (placeMode) return;
    e.stopPropagation();
    setSelId(doorEl.id);
    const c = toSvg(e);
    setDrag({ id: doorEl.id, type: "door-resize", edge, startX: c.x, startY: c.y });
  }, [toSvg, placeMode]);

  /* Build sorted boundary lists for door resize snapping */
  const doorSnapTargets = useMemo(() => {
    const vTargets = [
      { pos: 0, isWall: true },
      ...elements.filter(e => e.type === "stud").map(st => ({ pos: st.x, isWall: false })),
      { pos: iW, isWall: true },
    ].sort((a, b) => a.pos - b.pos);
    const hTargets = [
      { pos: 0, isWall: true },
      ...elements.filter(e => e.type === "shelf").map(sh => ({ pos: sh.y, isWall: false, xLeft: sh.x || 0, xRight: (sh.x || 0) + (sh.w || iW) })),
      { pos: iH, isWall: true },
    ].sort((a, b) => a.pos - b.pos);
    return { vTargets, hTargets };
  }, [elements, iW, iH]);

  const onMove = useCallback((e) => {
    if (!drag) return; const c = toSvg(e);

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
        if (drag.type === "stud") { let nx = Math.round((c.x - drag.ox) / SNAP) * SNAP; nx = Math.max(MIN_S, Math.min(iW - MIN_S, nx)); return { ...el, x: nx, anchorY: Math.max(0, Math.min(iH, Math.round(c.y))) }; }
        if (drag.type === "shelf") { return { ...el, y: Math.max(20, Math.min(iH - 20, Math.round(c.y - drag.oy))) }; }
        const ny = Math.max(0, Math.min(iH - (drag.type === "drawers" ? (el.h || 450) : 20), Math.round(c.y - drag.oy)));
        return { ...el, y: ny, _dragX: c.x };
      });
      next = adjust(next);
      next = next.map(el => { const { _dragX, ...rest } = el; return rest; });
      return next;
    });
  }, [drag, toSvg, iW, iH, adjust]);

  const onUp = useCallback(() => setDrag(null), []);

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

  const hw = useMemo(() => calcHW(corpus, elements), [corpus, elements]);
  const pts = useMemo(() => calcParts(corpus, elements), [corpus, elements]);
  const area = useMemo(() => pts.filter(p => !p.m).reduce((s, p) => s + p.q * p.l * p.w / 1e6, 0).toFixed(3), [pts]);

  const topLevelCols = useMemo(() => {
    const studs = elements.filter(e => e.type === "stud").sort((a, b) => a.x - b.x);
    const xs = [0, ...studs.map(s => s.x), iW];
    return xs.slice(0, -1).map((left, i) => ({ left, right: xs[i + 1], sl: left + (i > 0 ? t : 0), sw: xs[i + 1] - left - (i > 0 ? t : 0) }));
  }, [elements, iW, t]);

  const dims = useMemo(() => {
    const res = [];
    topLevelCols.forEach((col, i) => res.push({ t: "w", x: col.sl, w: col.sw, si: i }));
    topLevelCols.forEach((col, ci) => {
      const breaks = [{ y: 0 }];
      elements.forEach(el => {
        if (el.type === "stud" || el.type === "door") return;
        if (el.type === "shelf") { breaks.push({ y: el.y }); return; }
        const cx = (el.x || 0) + (el.w || 0) / 2;
        if (cx < col.sl - 5 || cx > col.sl + col.sw + 5) return;
        if (el.type === "drawers") { breaks.push({ y: el.y }); breaks.push({ y: el.y + (el.h || 450) }); }
        if (el.type === "rod") breaks.push({ y: el.y });
      });
      breaks.push({ y: iH }); const sorted = [...new Set(breaks.map(b => b.y))].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) { const h = sorted[i + 1] - sorted[i]; if (h > 25) res.push({ t: "h", x: col.sl, y: sorted[i], h, si: ci, topY: sorted[i] }); }
    });
    return res;
  }, [elements, topLevelCols, iH]);

  const getDimDir = (i) => dimDirOverrides[i] || (dims[i]?.t === "w" ? "left" : "top");
  const toggleDimDir = useCallback((i) => { setDimDirOverrides(p => ({ ...p, [i]: getDimDir(i) === "left" || getDimDir(i) === "top" ? (dims[i].t === "w" ? "right" : "bottom") : (dims[i].t === "w" ? "left" : "top") })); }, [dims, dimDirOverrides]);

  const changeHorizDim = useCallback((d, v, dir) => {
    const studs = elements.filter(e => e.type === "stud").sort((a, b) => a.x - b.x);
    if (topLevelCols.length <= 1) { setCorpus(c => ({ ...c, width: Math.max(300, Math.min(2400, v + 2 * t)) })); return; }
    if (dir === "left" && d.si < studs.length) { const st = studs[d.si]; const nx = topLevelCols[d.si].sl + v; if (nx >= MIN_S && nx <= iW - MIN_S) updateEl(st.id, { x: nx }); }
    else if (dir === "right" && d.si > 0) { const st = studs[d.si - 1]; const nx = topLevelCols[d.si].sl + topLevelCols[d.si].sw - v; if (nx >= MIN_S && nx <= iW - MIN_S) updateEl(st.id, { x: nx }); }
  }, [topLevelCols, elements, t, iW, updateEl]);

  const changeVertDim = useCallback((d, v, dir) => {
    const col = topLevelCols[d.si]; if (!col) return;
    const secEls = elements.filter(e => e.type !== "stud" && e.type !== "door").filter(e => {
      if (e.type === "shelf") return true;
      const cx = (e.x || 0) + (e.w || 0) / 2; return cx >= col.sl - 5 && cx <= col.sl + col.sw + 5;
    }).sort((a, b) => (a.y || 0) - (b.y || 0));
    const gT = d.topY, gB = d.topY + d.h;
    if (dir === "top") { const tgt = secEls.find(e => Math.abs((e.y || 0) - gB) < 8); if (tgt) updateEl(tgt.id, { y: Math.max(0, Math.min(iH - 20, gT + v)) }); }
    else { const tgt = secEls.find(e => Math.abs((e.y || 0) - gT) < 8 && gT > 5); if (tgt) updateEl(tgt.id, { y: Math.max(0, Math.min(iH - 20, gB - v)) }); }
  }, [topLevelCols, elements, iH, updateEl]);

  const svgW = corpus.width * SC + 120, svgH = corpus.height * SC + 60;

  return (
    <div style={{ minHeight: "100vh", color: "#e5e7eb", userSelect: "none", background: "#0b0c10", fontFamily: "'IBM Plex Mono',monospace" }} onMouseMove={onMove} onMouseUp={onUp}>
      {/* HEADER */}
      <div style={{ borderBottom: "1px solid rgba(50,50,60,0.4)", padding: "8px 16px", background: "rgba(11,12,16,0.97)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#d97706", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 900, fontSize: 11 }}>К2</div>
          <div><h1 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#d1d5db", margin: 0 }}>Редактор шкафа</h1>
            <p style={{ fontSize: 11, color: "#555", margin: 0 }}>{corpus.width}×{corpus.height}×{corpus.depth} · {t}мм</p></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* #3: Door placement indicator */}
          {placeMode && <div style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>{{ shelf: "━ Полка", stud: "┃ Стойка", drawers: "☰ Ящики", rod: "⎯ Штанга", door: "🚪 Дверь" }[placeMode]} → кликни внутрь проёма <button onClick={() => { setPlaceMode(null);  }} style={{ marginLeft: 6, background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✕</button></div>}
          {/* #2: Eye icon for doors toggle */}
          <button onClick={() => setShowDoors(p => !p)} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid", background: showDoors ? "rgba(217,119,6,0.12)" : "rgba(100,100,100,0.12)", color: showDoors ? "#d97706" : "#888", borderColor: showDoors ? "rgba(217,119,6,0.3)" : "#444" }}>🚪 Двери {showDoors ? "👁" : "👁‍🗨"}</button>
          <button onClick={() => setShow3d(true)} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(96,165,250,0.3)", background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}>🧊 3D</button>
        </div>
      </div>

      <div style={{ display: "flex", maxWidth: 1600, margin: "0 auto" }}>
        {/* LEFT PANEL */}
        <div style={{ width: leftOpen ? 200 : 0, overflow: leftOpen ? "auto" : "hidden", transition: "width 0.2s", borderRight: "1px solid rgba(50,50,60,0.3)", flexShrink: 0, maxHeight: "calc(100vh - 46px)", position: "relative" }}>
          {leftOpen && <div style={{ padding: 10 }}>
            <button onClick={() => setLeftOpen(false)} style={{ position: "absolute", top: 4, right: 4, background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16 }}>◀</button>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 6 }}>Корпус</div>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {[{ k: "width", l: "Ш", mn: 300, mx: 2400 }, { k: "height", l: "В", mn: 400, mx: 2700 }, { k: "depth", l: "Г", mn: 250, mx: 700 }].map(p => <NumInput key={p.k} label={p.l} value={corpus[p.k]} onChange={v => setCorpus(c => ({ ...c, [p.k]: v }))} min={p.mn} max={p.mx} />)}
              </div>
              <div style={{ display: "flex", gap: 3 }}>{[16, 18, 22].map(th => <button key={th} onClick={() => setCorpus(c => ({ ...c, thickness: th }))} style={{ flex: 1, padding: "3px 0", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", background: corpus.thickness === th ? "#d97706" : "rgba(30,30,40,0.5)", color: corpus.thickness === th ? "#000" : "#6b7280" }}>{th}</button>)}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 6 }}>Добавить</div>
              {TOOLS.map(it => <button key={it.type} onClick={() => addEl(it.type)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "5px 8px", borderRadius: 4, marginBottom: 2, cursor: "pointer", background: placeMode === it.type ? "rgba(34,197,94,0.15)" : "rgba(30,30,40,0.3)", border: placeMode === it.type ? "1px solid rgba(34,197,94,0.3)" : "1px solid transparent", color: placeMode === it.type ? "#22c55e" : "#d1d5db", fontSize: 11 }}>
                <span style={{ fontSize: 14, width: 20, textAlign: "center", opacity: 0.5 }}>{it.icon}</span><span style={{ flex: 1 }}>{it.label}</span><span style={{ color: "#444", fontSize: 10 }}>{it.key}</span></button>)}
            </div>
            <div style={{ marginBottom: 12 }}>
              <TexturePicker corpusTextureId={corpusTextureId} facadeTextureId={facadeTextureId} onCorpusChange={setCorpusTextureId} onFacadeChange={setFacadeTextureId} customTextures={customTextures} onAddCustom={(tex) => setCustomTextures(prev => [...prev, tex])} />
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
              {selEl.type === "stud" && <div style={{ fontSize: 10, color: "#555" }}>X: {Math.round(selEl.x)}мм · {Math.round(selEl.pTop || 0)}→{Math.round(selEl.pBot || iH)}мм</div>}
              {selEl.type === "shelf" && <div style={{ fontSize: 10, color: "#555" }}>X: {Math.round(selEl.x)} Ш: {Math.round(selEl.w)} · Y: {Math.round(selEl.y)}мм</div>}
              <button onClick={delSel} style={{ width: "100%", padding: "5px 0", borderRadius: 4, marginTop: 8, background: "rgba(220,38,38,0.12)", color: "#ef4444", fontSize: 11, fontWeight: 700, border: "1px solid rgba(220,38,38,0.2)", cursor: "pointer" }}>✕ Удалить</button>
            </div> : <div style={{ fontSize: 11, color: "#555", fontStyle: "italic" }}>Кликни элемент</div>}
          </div>}
        </div>
        {!leftOpen && <button onClick={() => setLeftOpen(true)} style={{ position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 30, width: 24, height: 60, borderRadius: "0 6px 6px 0", background: "#1a1b22", border: "1px solid #333", borderLeft: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>▶</button>}

        {/* SVG */}
        <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", minHeight: "calc(100vh - 46px)" }}>
          <svg ref={svgRef} width={svgW} height={svgH} viewBox={`-50 -16 ${corpus.width * SC + 120} ${corpus.height * SC + 60}`} style={{ cursor: placeMode ? "crosshair" : "default", filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5))" }} onClick={onSvgClick}>
            <defs><pattern id="g" width={100 * SC} height={100 * SC} patternUnits="userSpaceOnUse"><path d={`M ${100 * SC} 0 L 0 0 0 ${100 * SC}`} fill="none" stroke="#161720" strokeWidth={0.5} /></pattern></defs>
            <rect x={0} y={0} width={corpus.width * SC} height={corpus.height * SC} fill="url(#g)" stroke="#4a3f35" strokeWidth={t * SC} />

            {/* Zone highlights */}
            {zones.map((z, i) => {
              const zoneMode = !!placeMode;
              const isOccupied = zoneMode && (
                (placeMode === "drawers" && elements.some(e => e.type === "drawers" && e.zoneId === z.id))
              );
              return <rect key={`z${i}`} x={(z.sl + t) * SC} y={(z.top + t) * SC} width={z.sw * SC} height={(z.bot - z.top) * SC}
                fill={zoneMode ? (isOccupied ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)") : "rgba(25,23,20,0.3)"}
                stroke={zoneMode ? (isOccupied ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)") : "rgba(217,119,6,0.06)"}
                strokeWidth={zoneMode ? 1 : 0.5} strokeDasharray={zoneMode ? "4 2" : "2 2"}
                style={zoneMode && !isOccupied ? { cursor: "pointer" } : {}} />;
            })}

            {elements.map(el => {
              const sel = el.id === selId;
              const sx = ((el.x || 0) + t) * SC, sy = ((el.y || 0) + t) * SC;
              const noPointer = !!placeMode; // disable element interactions during door boundary picking

              if (el.type === "shelf") return <g key={el.id} onMouseDown={noPointer ? undefined : e => onDown(e, el)} style={{ cursor: noPointer ? "default" : "ns-resize", pointerEvents: noPointer ? "none" : "auto" }}>
                <rect x={sx} y={sy - t * SC * 0.4} width={(el.w || iW) * SC} height={t * SC * 0.8} fill={sel ? "#d97706" : "#8b7355"} stroke={sel ? "#fbbf24" : "#6b5a45"} strokeWidth={sel ? 1.5 : 0.5} rx={1} />
              </g>;

              if (el.type === "stud") {
                const studLeft = ((el.x || 0) + t) * SC; // left edge of stud in SVG
                const studW = t * SC; // stud width = ЛДСП thickness
                const pTopPx = ((el.pTop || 0) + t) * SC, pH = ((el.pBot || iH) - (el.pTop || 0)) * SC;
                return <g key={el.id} onMouseDown={e => onDown(e, el)} style={{ cursor: "ew-resize" }}>
                  <rect x={studLeft} y={pTopPx} width={studW} height={pH} fill={sel ? "#3b82f6" : "#7a6b5a"} stroke={sel ? "#60a5fa" : "#5a4d3f"} strokeWidth={sel ? 1.5 : 0.5} />
                  <line x1={studLeft - 4} y1={pTopPx + 1} x2={studLeft + studW + 4} y2={pTopPx + 1} stroke={sel ? "#60a5fa" : "#5a4d3f"} strokeWidth={0.5} />
                  <line x1={studLeft - 4} y1={pTopPx + pH - 1} x2={studLeft + studW + 4} y2={pTopPx + pH - 1} stroke={sel ? "#60a5fa" : "#5a4d3f"} strokeWidth={0.5} />
                </g>;
              }

              if (el.type === "drawers") {
                const cnt = el.count || 3, heights = el.drawerHeights || Array(cnt).fill(Math.floor((el.h || 450) / cnt));
                const gc = (el.guideType || "roller") === "tandem" ? "#f59e0b" : (el.guideType || "roller") === "ball" ? "#60a5fa" : "#22c55e";
                let accY = 0;
                return <g key={el.id} onMouseDown={e => onDown(e, el)} style={{ cursor: "move" }}>
                  {Array.from({ length: cnt }, (_, i) => { const dH = (heights[i] || 150) * SC, dy = sy + accY * SC; accY += heights[i] || 150; return <g key={i}>
                    <rect x={sx + 2} y={dy + 1} width={(el.w || 100) * SC - 4} height={dH - 2} fill={sel ? `${gc}15` : "rgba(70,60,45,0.05)"} stroke={sel ? gc : "#4a3f35"} strokeWidth={sel ? 1.2 : 0.5} rx={1} />
                    <rect x={sx + (el.w || 100) * SC / 2 - 10} y={dy + dH / 2 - 1} width={20} height={2.5} fill={sel ? gc : "#555"} rx={1} />
                    <text x={sx + (el.w || 100) * SC - 8} y={dy + dH / 2 + 3} textAnchor="end" fontSize={6} fill={sel ? gc : "#444"} fontFamily="'IBM Plex Mono',monospace">{heights[i] || 150}</text>
                  </g>; })}
                </g>;
              }

              if (el.type === "rod") return <g key={el.id} onMouseDown={e => onDown(e, el)} style={{ cursor: "move" }}>
                <line x1={sx} y1={sy} x2={sx + (el.w || 100) * SC} y2={sy} stroke={sel ? "#a855f7" : "#777"} strokeWidth={2.5} strokeLinecap="round" />
                <circle cx={sx} cy={sy} r={3} fill={sel ? "#a855f7" : "#555"} /><circle cx={sx + (el.w || 100) * SC} cy={sy} r={3} fill={sel ? "#a855f7" : "#555"} />
              </g>;

              if (el.type === "door" && showDoors) {
                const dw = (el.w || 100) * SC, dh = (el.h || iH) * SC, isL = el.hingeSide === "left";
                const hn = (el.h || 600) > 1800 ? 4 : (el.h || 600) > 1200 ? 3 : 2;
                const hps = Array.from({ length: hn }, (_, i) => i === 0 ? 0.08 : i === hn - 1 ? 0.92 : i / (hn - 1));
                const fHex = facadeTexInfo.hex;
                const isDark = parseInt(fHex.replace('#',''), 16) < 0x666666;
                const HANDLE = 6;
                return <g key={el.id} onMouseDown={e => { e.stopPropagation(); setSelId(el.id); }} style={{ cursor: "pointer" }}>
                  <rect x={sx} y={sy} width={dw} height={dh} fill={fHex} fillOpacity={0.85} stroke={sel ? "#fbbf24" : isDark ? "#5a4a3a" : "#bbb"} strokeWidth={sel ? 1.5 : 0.7} rx={1} />
                  <circle cx={isL ? sx + dw - 8 : sx + 8} cy={sy + dh / 2} r={2.5} fill={isDark ? "#aaa" : "#555"} />
                  {hps.map((p, hi) => <rect key={hi} x={isL ? sx - 1 : sx + dw - 3} y={sy + dh * p - 4} width={4} height={8} rx={1} fill={isDark ? "#888" : "#555"} />)}
                  <text x={sx + dw / 2} y={sy + dh / 2 + 3} textAnchor="middle" fontSize={7} fill={isDark ? "#ccc" : "#555"} fontFamily="'IBM Plex Mono',monospace" opacity={0.6}>{facadeTexInfo.name}</text>
                  {sel && <>
                    {/* Resize handles */}
                    <rect x={sx + dw / 2 - 12} y={sy - HANDLE / 2} width={24} height={HANDLE} rx={2} fill="#d97706" opacity={0.9} style={{ cursor: "ns-resize" }}
                      onMouseDown={e => onDoorEdgeDrag(e, el, "top")} />
                    <rect x={sx + dw / 2 - 12} y={sy + dh - HANDLE / 2} width={24} height={HANDLE} rx={2} fill="#d97706" opacity={0.9} style={{ cursor: "ns-resize" }}
                      onMouseDown={e => onDoorEdgeDrag(e, el, "bottom")} />
                    <rect x={sx - HANDLE / 2} y={sy + dh / 2 - 12} width={HANDLE} height={24} rx={2} fill="#d97706" opacity={0.9} style={{ cursor: "ew-resize" }}
                      onMouseDown={e => onDoorEdgeDrag(e, el, "left")} />
                    <rect x={sx + dw - HANDLE / 2} y={sy + dh / 2 - 12} width={HANDLE} height={24} rx={2} fill="#d97706" opacity={0.9} style={{ cursor: "ew-resize" }}
                      onMouseDown={e => onDoorEdgeDrag(e, el, "right")} />

                    {/* Width input — below door, centered */}
                    <line x1={sx + 1} y1={sy + dh + 6} x2={sx + dw - 1} y2={sy + dh + 6} stroke="rgba(217,119,6,0.4)" strokeWidth={0.5} />
                    <line x1={sx} y1={sy + dh + 3} x2={sx} y2={sy + dh + 9} stroke="rgba(217,119,6,0.4)" strokeWidth={0.4} />
                    <line x1={sx + dw} y1={sy + dh + 3} x2={sx + dw} y2={sy + dh + 9} stroke="rgba(217,119,6,0.4)" strokeWidth={0.4} />
                    <SvgInput x={sx + dw / 2} y={sy + dh + 16} width={50} value={Math.round(el.doorW || el.w)} color="#d97706" fontSize={9}
                      onChange={v => {
                        // Grow from anchored side: if left is wall → x stays, grow right. If right is wall → right stays, grow left.
                        const oldX = el.x || 0;
                        const oldW = Math.round(el.doorW || el.w);
                        let newX = oldX;
                        if (el.doorRightIsWall && !el.doorLeftIsWall) {
                          // Anchored right → grow left
                          newX = oldX + oldW - v;
                        } else if (!el.doorLeftIsWall && !el.doorRightIsWall) {
                          // Both studs → grow from center
                          newX = oldX - (v - oldW) / 2;
                        }
                        // doorLeftIsWall → x stays (default), grow right
                        updateEl(el.id, { w: v, doorW: v, x: newX, manualW: v });
                      }} />

                    {/* Height input — left of door, centered vertically */}
                    <line x1={sx - 6} y1={sy + 1} x2={sx - 6} y2={sy + dh - 1} stroke="rgba(96,165,250,0.4)" strokeWidth={0.5} />
                    <line x1={sx - 9} y1={sy} x2={sx - 3} y2={sy} stroke="rgba(96,165,250,0.4)" strokeWidth={0.4} />
                    <line x1={sx - 9} y1={sy + dh} x2={sx - 3} y2={sy + dh} stroke="rgba(96,165,250,0.4)" strokeWidth={0.4} />
                    <SvgInput x={sx - 10} y={sy + dh / 2 + 3} width={40} value={Math.round(el.doorH || el.h)} color="#5a8fd4" fontSize={8}
                      onChange={v => {
                        // Grow from anchored side: if top is wall → y stays, grow down. If bottom is wall → bottom stays, grow up.
                        const oldY = el.y || 0;
                        const oldH = Math.round(el.doorH || el.h);
                        let newY = oldY;
                        if (el.doorBottomIsWall && !el.doorTopIsWall) {
                          // Anchored bottom → grow up
                          newY = oldY + oldH - v;
                        } else if (!el.doorTopIsWall && !el.doorBottomIsWall) {
                          // Both shelves → grow from center
                          newY = oldY - (v - oldH) / 2;
                        }
                        // doorTopIsWall → y stays (default), grow down
                        updateEl(el.id, { h: v, doorH: v, y: newY, manualH: v });
                      }} />
                  </>}
                </g>;
              }
              return null;
            })}

            {/* DIMS */}
            {dims.map((d, i) => {
              const dir = getDimDir(i);
              if (d.t === "w") { const dx = (d.x + t) * SC, dy = (iH + t) * SC + 16, dw = d.w * SC; return <g key={`w${i}`}>
                <line x1={dx + 1} y1={dy} x2={dx + dw - 1} y2={dy} stroke="rgba(217,119,6,0.3)" strokeWidth={0.6} />
                <line x1={dx} y1={dy - 3} x2={dx} y2={dy + 3} stroke="rgba(217,119,6,0.3)" strokeWidth={0.4} />
                <line x1={dx + dw} y1={dy - 3} x2={dx + dw} y2={dy + 3} stroke="rgba(217,119,6,0.3)" strokeWidth={0.4} />
                <text x={dx + dw / 2 + 24} y={dy + 4} textAnchor="middle" fontSize={6} fill="#d9770644" style={{ cursor: "pointer" }} onClick={e => { e.stopPropagation(); toggleDimDir(i); }}>{dir === "left" ? "→" : "←"}</text>
                <SvgInput x={dx + dw / 2} y={dy + 12} width={dw} value={Math.round(d.w)} color="#b87a20" fontSize={9} onChange={v => changeHorizDim(d, v, dir)} />
              </g>; }
              if (d.t === "h") { const dx = (d.x + t) * SC - 22, dy1 = (d.y + t) * SC, dy2 = (d.y + d.h + t) * SC, mid = (dy1 + dy2) / 2; return <g key={`h${i}`}>
                <line x1={dx} y1={dy1 + 1} x2={dx} y2={dy2 - 1} stroke="rgba(96,165,250,0.3)" strokeWidth={0.6} />
                <line x1={dx - 3} y1={dy1} x2={dx + 3} y2={dy1} stroke="rgba(96,165,250,0.3)" strokeWidth={0.4} />
                <line x1={dx - 3} y1={dy2} x2={dx + 3} y2={dy2} stroke="rgba(96,165,250,0.3)" strokeWidth={0.4} />
                <text x={dx} y={mid + 16} textAnchor="middle" fontSize={6} fill="#60a5fa44" style={{ cursor: "pointer" }} onClick={e => { e.stopPropagation(); toggleDimDir(i); }}>{dir === "top" ? "↓" : "↑"}</text>
                <SvgInput x={dx - 3} y={mid + 3} width={40} value={Math.round(d.h)} color="#5a8fd4" fontSize={8} onChange={v => changeVertDim(d, v, dir)} />
              </g>; }
              return null;
            })}
            <SvgInput x={corpus.width * SC / 2} y={corpus.height * SC + 38} width={60} value={corpus.width} color="#777" fontSize={10} onChange={v => setCorpus(c => ({ ...c, width: Math.max(300, Math.min(2400, v)) }))} />
            <text x={corpus.width * SC / 2 - 32} y={corpus.height * SC + 38} textAnchor="middle" fontSize={8} fill="#444">←</text>
            <text x={corpus.width * SC / 2 + 32} y={corpus.height * SC + 38} textAnchor="middle" fontSize={8} fill="#444">→</text>
            <SvgInput x={-32} y={corpus.height * SC / 2 + 3} width={40} value={corpus.height} color="#777" fontSize={10} onChange={v => setCorpus(c => ({ ...c, height: Math.max(400, Math.min(2700, v)) }))} />
          </svg>
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
      {show3d && <Wardrobe3D corpus={corpus} elements={elements} corpusTexture={corpusTexInfo} facadeTexture={facadeTexInfo} showDoors={showDoors} onClose={() => setShow3d(false)} />}
    </div>
  );
}
