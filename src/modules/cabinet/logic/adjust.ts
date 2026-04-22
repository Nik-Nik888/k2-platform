/**
 * Чистая логика пересчёта зависимостей элементов.
 * Правила:
 * - Приоритет по порядку: элемент с МЕНЬШИМ _order (размещён РАНЬШЕ) получает полный размер.
 *   Позже размещённые элементы упираются в более ранние.
 * - Авто-пересчёт при каждом изменении: когда меняется рамка или двигаются элементы,
 *   размеры обновляются чтобы соответствовать текущему состоянию.
 * - Manual overrides (manualX/manualW/manualPTop/manualPBot) игнорируют авто-пересчёт.
 */
import { computeZones, findZone } from "./zones";
import { computeDoorDimensions, computePanelDimensions } from "./placement";

export function computeStudBounds(
  stud: any, allEls: any[],
  iW: number, iH: number, t: number,
): { pTop: number; pBot: number } {
  const shelves = allEls.filter(e => e.type === "shelf");
  const sx = stud.x || 0;
  const anchorY = stud.anchorY ?? iH / 2;
  const studOrder = stud._order || 0;
  // Полки размещённые РАНЬШЕ этой стойки обрезают её (меньший _order = раньше)
  const bounding = shelves.filter(sh => {
    const shOrder = sh._order || 0;
    if (shOrder >= studOrder) return false;
    const shLeft = sh.x || 0;
    const shRight = shLeft + (sh.w || iW);
    return sx + t > shLeft - 5 && sx < shRight + 5;
  });
  let pTop = 0, pBot = iH;
  bounding.forEach(sh => {
    // Физический размер полки: y=0 → [0, t], y=iH → [iH-t, iH], middle → [y-t/2, y+t/2]
    let shTop: number, shBot: number;
    if (sh.y <= 1) { shTop = 0; shBot = t; }
    else if (sh.y >= iH - 1) { shTop = iH - t; shBot = iH; }
    else { shTop = sh.y - t / 2; shBot = sh.y + t / 2; }
    if (shBot <= anchorY && shBot > pTop) pTop = shBot;
    if (shTop >= anchorY && shTop < pBot) pBot = shTop;
  });
  return { pTop, pBot };
}

export function computeShelfSpan(
  shelf: any, allEls: any[],
  iW: number, iH: number, t: number,
): { x: number; w: number } {
  const studs = allEls.filter(e => e.type === "stud");
  const sy = shelf.y || 0;
  const shelfOrder = shelf._order || 0;
  // Только стойки размещённые РАНЬШЕ этой полки могут её блокировать
  const blocking = studs.filter(st => {
    const stOrder = st._order || 0;
    if (stOrder >= shelfOrder) return false;
    const sx = st.x || 0;
    // Вертикальный диапазон стойки с учётом полок размещённых раньше неё
    const anchorY = st.anchorY ?? iH / 2;
    const earlierShelves = allEls.filter(e =>
      e.type === "shelf" && e.id !== shelf.id && (e._order || 0) < stOrder,
    );
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
  const xBreaks = [0, ...blocking.map(st => st.x).sort((a: number, b: number) => a - b), iW];
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
}

/**
 * Основной пересчёт всех элементов.
 * Применяется после любого изменения (добавление/удаление/перемещение).
 */
export function adjust(els: any[], iW: number, iH: number, t: number): any[] {
  // Шаг 0: клампим позиции к текущим границам рамки
  let result = els.map(el => {
    if (el.type === "stud") {
      const x = Math.max(0, Math.min(iW - t, el.x || 0));
      const pTop = Math.max(0, Math.min(iH, el.pTop ?? 0));
      const pBot = Math.max(0, Math.min(iH, el.pBot ?? iH));
      return { ...el, x, pTop, pBot };
    }
    if (el.type === "shelf") {
      const y = Math.max(0, Math.min(iH, el.y || 0));
      const x = Math.max(0, Math.min(iW, el.x || 0));
      const w = Math.max(20, Math.min(iW - x, el.w || iW));
      return { ...el, y, x, w };
    }
    if (el.type === "drawers" || el.type === "rod" || el.type === "door" || el.type === "panel") {
      const x = Math.max(0, Math.min(iW, el.x || 0));
      const y = Math.max(0, Math.min(iH, el.y || 0));
      const w = Math.max(20, Math.min(iW - x, el.w || 100));
      // h клампим для door/drawers/panel (у rod высота 0)
      if (el.type === "door" || el.type === "drawers" || el.type === "panel") {
        const h = Math.max(20, Math.min(iH - y, el.h || 100));
        return { ...el, x, y, w, h };
      }
      return { ...el, x, y, w };
    }
    return el;
  });

  // Шаг 1: pTop/pBot стоек с учётом ранних полок
  result = result.map(el => {
    if (el.type !== "stud") return el;
    if (el.manualPTop !== undefined || el.manualPBot !== undefined) return el;
    const { pTop, pBot } = computeStudBounds(el, result, iW, iH, t);
    return { ...el, pTop, pBot };
  });

  // Шаг 2: x/w полок с учётом ранних стоек
  result = result.map(el => {
    if (el.type !== "shelf") return el;
    if (el.manualX !== undefined || el.manualW !== undefined) return el;
    const { x, w } = computeShelfSpan(el, result, iW, iH, t);
    return { ...el, x, w, anchorX: x + w / 2 };
  });

  // Шаг 3: снова стойки — с учётом обновлённых span'ов полок
  result = result.map(el => {
    if (el.type !== "stud") return el;
    if (el.manualPTop !== undefined || el.manualPBot !== undefined) return el;
    const { pTop, pBot } = computeStudBounds(el, result, iW, iH, t);
    return { ...el, pTop, pBot };
  });

  const zones = computeZones(result, iW, iH, t);

  // Snap ящиков / штанг / дверей
  result = result.map(el => {
    if (el.type === "drawers" || el.type === "rod") {
      // Во время drag используем _dragX для определения новых горизонтальных границ
      if (el._dragX !== undefined) {
        const elY = el.y || 0;
        const elH = el.type === "drawers" ? (el.h || 450) : 20;
        const elMidY = elY + elH / 2;
        const shelves = result.filter(e => e.type === "shelf");
        const studs = result.filter(e => e.type === "stud");
        const studNearLeft = studs.some(st => st.x < t + 2);
        const studNearRight = studs.some(st => st.x > iW - 2 * t - 2);
        const shelfNearTop = shelves.some(sh => sh.y < t + 2);
        const shelfNearBot = shelves.some(sh => sh.y > iH - t - 2);

        const vBounds = [
          ...(studNearLeft ? [] : [{ x: 0, isWall: true }]),
          ...studs.filter(st => {
            const sx = st.x || 0;
            const anchorY = st.anchorY ?? iH / 2;
            const spanning = shelves.filter(sh =>
              (sh.x || 0) < sx - 5 && (sh.x || 0) + (sh.w || iW) > sx + t + 5,
            );
            let sTop = 0, sBot = iH;
            spanning.forEach(sh => {
              if (sh.y <= anchorY && sh.y > sTop) sTop = sh.y;
              if (sh.y > anchorY && sh.y < sBot) sBot = sh.y;
            });
            return elMidY >= sTop - 5 && elMidY <= sBot + 5;
          }).map(st => ({ x: st.x, isWall: false })),
          ...(studNearRight ? [] : [{ x: iW, isWall: true }]),
        ].sort((a, b) => a.x - b.x);

        const cx = el._dragX;
        const minCx = studNearLeft ? t + 2 : 0;
        const maxCx = studNearRight ? iW - t - 2 : iW;
        const clampedCx = Math.max(minCx, Math.min(maxCx, cx));

        let left = vBounds[0];
        for (const v of vBounds) { if (v.x <= clampedCx + 5) left = v; else break; }
        let right = vBounds[vBounds.length - 1];
        for (let i = vBounds.length - 1; i >= 0; i--) {
          if (vBounds[i].x >= clampedCx - 5) right = vBounds[i]; else break;
        }
        if (left.x >= right.x) { const li = vBounds.indexOf(left); if (li > 0) left = vBounds[li - 1]; }

        let innerLeft = left.x + (left.isWall ? 0 : t);
        let innerRight = right.x;
        if (studNearLeft) innerLeft = Math.max(innerLeft, t);
        if (studNearRight) innerRight = Math.min(innerRight, iW - t);
        innerLeft = Math.max(0, innerLeft);
        innerRight = Math.min(iW, innerRight);
        const innerW = Math.max(60, innerRight - innerLeft);

        // Для ящиков — также вертикальные границы
        if (el.type === "drawers") {
          const colShelves = shelves.filter(sh => {
            const shLeft = sh.x || 0, shRight = shLeft + (sh.w || iW);
            return shLeft <= innerLeft + 5 && shRight >= innerRight - 5;
          });
          let topBound = shelfNearTop ? t : 0;
          let botBound = shelfNearBot ? iH - t : iH;
          colShelves.forEach(sh => {
            let shTop: number, shBot: number;
            if (sh.y <= 1) { shTop = 0; shBot = t; }
            else if (sh.y >= iH - 1) { shTop = iH - t; shBot = iH; }
            else { shTop = sh.y - t / 2; shBot = sh.y + t / 2; }
            if (shBot <= elMidY && shBot > topBound) topBound = shBot;
            if (shTop >= elMidY && shTop < botBound) botBound = shTop;
          });
          const availH = botBound - topBound;
          const newH = Math.max(60, Math.min(elH, availH));
          let newY = el.y || 0;
          if (newY < topBound) newY = topBound;
          if (newY + newH > botBound) newY = botBound - newH;
          const oldTotal = elH;
          const scale = newH / oldTotal;
          const oldHeights = el.drawerHeights || [];
          const newHeights = oldHeights.map((h: number) => Math.max(60, Math.floor(h * scale)));
          const heightSum = newHeights.reduce((a: number, b: number) => a + b, 0);
          if (newHeights.length > 0) newHeights[newHeights.length - 1] += newH - heightSum;
          return {
            ...el,
            x: innerLeft, w: innerW,
            y: newY, h: newH,
            drawerHeights: newHeights.length ? newHeights : el.drawerHeights,
          };
        }
        return { ...el, x: innerLeft + 20, w: innerW - 40 };
      }
      // Не drag — но всё равно клампим к рамке
      const elX = el.x || 0;
      const elW = el.w || (el.type === "drawers" ? 400 : 100);
      if (elX + elW > iW || elX < 0) {
        const clampedX = Math.max(0, Math.min(iW - 60, elX));
        const clampedW = Math.min(elW, iW - clampedX);
        return { ...el, x: clampedX, w: clampedW };
      }
      return el;
    }
    if (el.type === "door") {
      if (el.manualW || el.manualH) return el;
      // Двери с сохранёнными границами (новая система).
      // Используем computeDoorDimensions из placement.ts — единая формула с правильным
      // учётом Smart-Y полок, физического [x,x+t] стоек и актуального INSERT_GAP.
      if (el.doorLeft !== undefined) {
        const ht = el.hingeType || "overlay";
        const d = computeDoorDimensions(
          el.doorLeft, el.doorRight,
          el.doorTop ?? 0, el.doorBottom ?? iH,
          el.doorLeftIsWall ?? true, el.doorRightIsWall ?? true,
          el.doorTopIsWall ?? true, el.doorBottomIsWall ?? true,
          ht as "overlay" | "insert",
          iW, iH, t,
        );
        return { ...el, x: d.x, y: d.y, w: d.w, h: d.h, doorW: d.doorW, doorH: d.doorH };
      }
      // Legacy zone-based двери (backward compat)
      const targetId = el.doorTarget;
      let z = targetId ? zones.find(zz => zz.id === targetId) : null;
      if (!z) {
        const cx = (el.x || 0) + (el.w || 0) / 2;
        z = findZone(zones, cx, iH / 2);
      }
      const ht = el.hingeType || "overlay";
      if (ht === "overlay") {
        const OC = 14, OS = 7;
        const isLW = z.left <= 0, isRW = z.right >= iW;
        const lo = isLW ? OC : OS, ro = isRW ? OC : OS;
        const to = z.top <= 0 ? OC : OS, bo = z.bot >= iH ? OC : OS;
        let dX = z.sl - lo, dW = z.sw + lo + ro;
        let dY = z.top - to, dH = (z.bot - z.top) + to + bo;
        // Clamp к границам рамки
        if (dX < 0) { dW += dX; dX = 0; }
        if (dX + dW > iW) dW = iW - dX;
        if (dY < 0) { dH += dY; dY = 0; }
        if (dY + dH > iH) dH = iH - dY;
        return { ...el, x: dX, w: dW, h: dH, doorW: dW, doorH: dH, y: dY, zoneId: z.id, doorTarget: z.id };
      } else {
        const gap = 3;
        const dW = z.sw - gap * 2, dH = (z.bot - z.top) - gap * 2;
        return { ...el, x: z.sl + gap, w: dW, h: dH, doorW: dW, doorH: dH, y: z.top + gap, zoneId: z.id, doorTarget: z.id };
      }
    }
    return el;
  });

  // Constrain ящиков — группы по перекрывающимся X диапазонам (не по зонам)
  const drawerEls = result.filter(el => el.type === "drawers");
  if (drawerEls.length > 1) {
    const groups: any[][] = [];
    drawerEls.forEach(dr => {
      const dx1 = dr.x || 0, dx2 = dx1 + (dr.w || 400);
      const existing = groups.find(g => g.some(d => {
        const gx1 = d.x || 0, gx2 = gx1 + (d.w || 400);
        return dx1 < gx2 - 5 && dx2 > gx1 + 5;
      }));
      if (existing) existing.push(dr);
      else groups.push([dr]);
    });
    const updates: Record<string, any> = {};
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

  // Door overlap prevention — 2mm зазор между перекрывающимися дверьми
  const doors = result.filter(e => e.type === "door");
  if (doors.length > 1) {
    const doorUpdates: Record<string, any> = {};
    for (let i = 0; i < doors.length; i++) {
      for (let j = i + 1; j < doors.length; j++) {
        const a = doorUpdates[doors[i].id] ? { ...doors[i], ...doorUpdates[doors[i].id] } : doors[i];
        const b = doorUpdates[doors[j].id] ? { ...doors[j], ...doorUpdates[doors[j].id] } : doors[j];
        const ax1 = a.x, ax2 = a.x + a.w, ay1 = a.y, ay2 = a.y + a.h;
        const bx1 = b.x, bx2 = b.x + b.w, by1 = b.y, by2 = b.y + b.h;
        const overlapX = ax1 < bx2 && ax2 > bx1;
        const overlapY = ay1 < by2 && ay2 > by1;
        if (!overlapX || !overlapY) continue;

        const GAP = 2;
        const overlapW = Math.min(ax2, bx2) - Math.max(ax1, bx1);
        const overlapH = Math.min(ay2, by2) - Math.max(ay1, by1);

        if (overlapW < overlapH) {
          if (a.x < b.x) {
            const mid = (ax2 + bx1) / 2;
            doorUpdates[doors[i].id] = { ...doorUpdates[doors[i].id], w: mid - GAP / 2 - a.x, doorW: mid - GAP / 2 - a.x };
            doorUpdates[doors[j].id] = { ...doorUpdates[doors[j].id], x: mid + GAP / 2, w: bx2 - (mid + GAP / 2), doorW: bx2 - (mid + GAP / 2) };
          } else {
            const mid = (bx2 + ax1) / 2;
            doorUpdates[doors[j].id] = { ...doorUpdates[doors[j].id], w: mid - GAP / 2 - b.x, doorW: mid - GAP / 2 - b.x };
            doorUpdates[doors[i].id] = { ...doorUpdates[doors[i].id], x: mid + GAP / 2, w: ax2 - (mid + GAP / 2), doorW: ax2 - (mid + GAP / 2) };
          }
        } else {
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
}
