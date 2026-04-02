import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCalcStore } from '@store/calcStore';
import type { FurnitureItem, WindowItem } from '@store/calcStore';
import {
  TABS, SURFACE_IDS, CALC_MODE_LABELS,
  calcByMode, calcMatQty, calcInsulation, parseDims,
} from '@modules/calculator/api/calcApi';
import { doCalc, mergeResults, exportPDF } from '@modules/calculator/api/doCalc';
import type { CalcResults } from '@modules/calculator/api/doCalc';
import type { Category, CategoryOption, OptionMaterial, Material, CalcDB } from '@modules/calculator/api/calcApi';
import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';
import { Loader2, AlertCircle, Plus, X, ChevronDown, ArrowLeft, Save, Printer, Calculator, ClipboardList, FilePlus, Users } from 'lucide-react';
import { TreeRef } from '@modules/calculator/components/TreeRef';

// ════════════════════════════════════════════════════════
// UI-примитивы
// ════════════════════════════════════════════════════════

function NI({ label, value, onChange, unit }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block font-medium">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number" min="0" value={value || ''}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="input py-2 text-sm w-24 text-right font-mono"
        />
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
    </div>
  );
}

function Sel({ label, value, onChange, options }: {
  label: string; value: string | number;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
}) {
  return (
    <div className="mb-3">
      <label className="text-xs text-gray-500 mb-1 block font-semibold uppercase tracking-wider">{label}</label>
      <select
        value={value || ''} onChange={(e) => onChange(e.target.value)}
        className="input py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function DirToggle({ dir, onDir }: { dir: string; onDir: (d: string) => void }) {
  return (
    <div className="flex gap-2">
      {[
        { id: 'vertical', label: '↕ Вертикально' },
        { id: 'horizontal', label: '↔ Горизонтально' },
      ].map((d) => (
        <button key={d.id} onClick={() => onDir(d.id)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            dir === d.id
              ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
              : 'border-surface-200 text-gray-500 hover:border-surface-300'
          }`}
        >{d.label}</button>
      ))}
    </div>
  );
}

function DimsInfo({ hMm, wMm, label }: { hMm: number; wMm: number; label?: string }) {
  const hM = hMm / 1000, wM = wMm / 1000;
  const perimM = hM > 0 && wM > 0 ? 2 * (hM + wM) : 0;
  const area = hM * wM;
  if (hMm <= 0 && wMm <= 0) return null;
  return (
    <div className="text-xs text-brand-500 font-mono mt-1">
      {label && <span className="font-semibold mr-1">{label}:</span>}
      P={perimM.toFixed(2)}м · W={wM.toFixed(2)}м · H={hM.toFixed(2)}м · S={area.toFixed(2)}м²
    </div>
  );
}

// ════════════════════════════════════════════════════════
// MatRow — строка материала
// ════════════════════════════════════════════════════════

function MatRow({ om, qty, hint, modeLabel, isHidden, isRemoved, onQtyChange, onToggleRemove }: {
  om: OptionMaterial; qty: number; hint: string; modeLabel: string;
  isHidden: boolean; isRemoved: boolean;
  onQtyChange: (q: number) => void; onToggleRemove: () => void;
}) {
  const mat = om.materials;
  if (!mat) return null;

  if (isRemoved) {
    return (
      <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg opacity-50 ${isHidden ? 'bg-gray-50' : 'bg-surface-50'}`}>
        <span className="text-xs text-gray-400 line-through">{mat.name}</span>
        <button onClick={onToggleRemove} className="text-xs text-brand-500 hover:underline">↩</button>
      </div>
    );
  }

  const cost = mat.price > 0 && qty > 0 ? mat.price * qty : 0;

  return (
    <div className={`rounded-lg p-2.5 mb-1.5 ${isHidden ? 'bg-gray-50' : 'bg-surface-50 border border-surface-200'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`flex-1 min-w-0 truncate ${isHidden ? 'text-xs text-gray-500' : 'text-sm text-gray-700'}`}>
          {mat.name}
        </span>
        {modeLabel && (
          <span className="text-[10px] text-gray-400 bg-white px-1.5 py-0.5 rounded">{modeLabel}</span>
        )}
        {mat.price > 0 && (
          <span className="text-[11px] text-accent-500 font-mono font-semibold">{mat.price}₽</span>
        )}
        <input
          type="number" min="0"
          value={qty === 0 ? '' : qty}
          onChange={(e) => onQtyChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className={`text-right font-mono outline-none border border-surface-300 rounded-lg bg-white
            ${isHidden ? 'w-14 px-1.5 py-1 text-xs' : 'w-16 px-2 py-1.5 text-sm'}
            focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500`}
        />
        <span className="text-[10px] text-gray-400">{mat.unit || 'шт.'}</span>
        {cost > 0 && (
          <span className="text-xs text-emerald-600 font-mono font-bold">={cost.toLocaleString('ru')}₽</span>
        )}
        <button onClick={onToggleRemove} className="text-gray-300 hover:text-red-500 text-sm px-1">✕</button>
      </div>
      {hint && <div className="text-[10px] text-brand-500 mt-1 px-1">{hint}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// HiddenMats — секция скрытых материалов с calc_mode
// ════════════════════════════════════════════════════════

function HiddenMats({ mats, tabId, catId, hMm, wMm, direction }: {
  mats: OptionMaterial[]; tabId: string; catId: number;
  hMm: number; wMm: number; direction: string;
}) {
  const { getQty, setQty, isRemoved, toggleRemove } = useCalcStore();
  const activeMats = mats.filter((om) => !isRemoved(tabId, catId, om.id));

  if (mats.length === 0) return null;

  return (
    <details className="mt-2">
      <summary className="text-xs text-amber-600 cursor-pointer font-semibold py-1">
        🔒 Авто ({activeMats.length}/{mats.length})
      </summary>
      <div className="mt-1 space-y-0.5">
        {mats.map((om) => {
          const mode = om.calc_mode || 'fixed';
          const res = calcByMode(om.quantity || 0, mode, om.materials, hMm, wMm, direction);
          const userQ = getQty(tabId, catId, om.material_id);
          const qty = userQ !== undefined ? userQ : res.qty;

          return (
            <MatRow
              key={om.id} om={om} qty={qty} hint={res.hint}
              modeLabel={CALC_MODE_LABELS[mode] || ''}
              isHidden={true}
              isRemoved={isRemoved(tabId, catId, om.id)}
              onQtyChange={(q) => setQty(tabId, catId, om.material_id, q)}
              onToggleRemove={() => toggleRemove(tabId, catId, om.id)}
            />
          );
        })}
      </div>
    </details>
  );
}

// ════════════════════════════════════════════════════════
// DimsBlock — блок размеров (для остекления: рама, ББ, крыша)
// ════════════════════════════════════════════════════════

function DimsBlock({ label, tabId, dimsKey }: {
  label: string; tabId: string; dimsKey: string;
}) {
  const { getBlockDims, setBlockDim } = useCalcStore();
  const d = getBlockDims(tabId, dimsKey);
  const hM = d.height / 1000, wM = d.length / 1000;
  const perim = hM > 0 && wM > 0 ? 2 * (hM + wM) : 0;

  return (
    <div className="bg-surface-50 rounded-xl p-3 border border-surface-200 mb-3">
      <div className="text-xs font-semibold text-brand-600 mb-2">📐 Размеры: {label}</div>
      <div className="flex gap-3 flex-wrap items-end">
        <NI label="Высота (мм)" value={d.height} onChange={(v) => setBlockDim(tabId, dimsKey, 'height', v)} />
        <NI label="Ширина (мм)" value={d.length} onChange={(v) => setBlockDim(tabId, dimsKey, 'length', v)} />
        {perim > 0 && (
          <div className="bg-brand-50 text-brand-700 font-mono text-sm font-bold px-3 py-2 rounded-lg mb-1">
            P = {perim.toFixed(2)} п.м.
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// GlazingBlock — блок остекления внутри DynTab
// ════════════════════════════════════════════════════════

function GlazingBlock({ tabId, db }: { tabId: string; db: CalcDB }) {
  const store = useCalcStore();
  const { getOpt, setOpt, getQty, setQty, isRemoved, toggleRemove, setExtra, getBlockDims, setBlockDim } = store;
  const tabCats = useMemo(() => db.categories.filter((c) => c.tab_id === tabId), [db, tabId]);

  // «Что делаем» — определяем тип (балкон / лоджия)
  const whatDoCat = tabCats.find((c) => {
    const n = c.name.toLowerCase();
    return n.includes('что дел') || n === 'вариант';
  });
  const whatDoOptId = whatDoCat ? getOpt(tabId, whatDoCat.id) : null;
  const whatDoOpt = whatDoOptId ? db.options.find((o) => o.id === whatDoOptId) : null;
  const whatDoName = (whatDoOpt?.name || '').toLowerCase();
  const isBalcony = whatDoName.includes('балкон');
  const isLodzhia = whatDoName.includes('лоджи');

  // Фильтрация рамы по типу
  const filterFrameOpts = (cat: Category, opts: CategoryOption[]) => {
    const cn = cat.name.toLowerCase();
    if (cn.includes('основная рама') || cn === 'рама') {
      if (!whatDoOpt) return opts;
      if (isBalcony) return opts.filter((o) => {
        const n = o.name.toLowerCase();
        return n.includes('п-образ') || n.includes('г-образ');
      });
      if (isLodzhia) return opts.filter((o) => {
        const n = o.name.toLowerCase();
        return n.includes('прямое') || n.includes('прям');
      });
    }
    return opts;
  };

  // Категория «Основная Рама»
  const frameCat = tabCats.find((c) => {
    const n = c.name.toLowerCase();
    return n.includes('основная рама') || n === 'рама';
  });
  const frameOptId = frameCat ? getOpt(tabId, frameCat.id) : null;
  const frameOpt = frameOptId ? db.options.find((o) => o.id === frameOptId) : null;
  const frameSelected = !!frameOpt && frameOpt.name !== 'Нет' && frameOpt.name !== 'НЕТ';

  // Блоки размеров
  const glazingDims = getBlockDims(tabId, '_glazingDims');
  const bbDims = getBlockDims(tabId, '_bbDims');
  const winDims = getBlockDims(tabId, '_winDims');

  // Сайдинг
  const sidingCat = tabCats.find((c) => c.name.toLowerCase().includes('сайдинг'));
  const sidingOptId = sidingCat ? getOpt(tabId, sidingCat.id) : null;
  const sidingOpt = sidingOptId ? db.options.find((o) => o.id === sidingOptId) : null;
  const sidingName = (sidingOpt?.name || '').toLowerCase();
  const needSiding = sidingOpt && sidingName !== 'нет' && sidingName !== '' && sidingName !== '— не выбрано —';

  const sidingDims = getBlockDims(tabId, '_sidingDims');
  const sidingDir = ((store.getSel(tabId))._sidingDir as string) || 'horizontal';
  const sidingArea = (sidingDims.height / 1000) * (sidingDims.length / 1000);

  // Крыша
  const roofCat = tabCats.find((c) => c.name.toLowerCase().includes('крыш'));

  // Скрытая категория?
  const isHiddenCat = (cat: Category) => {
    const cn = cat.name.toLowerCase();
    return cn.includes('материалы для установки') || cn.includes('материалы установки');
  };

  // Определяем тип категории
  const getCatType = (cat: Category) => {
    const cn = cat.name.toLowerCase();
    if (cn.includes('что дел') || cn === 'вариант') return 'whatdo';
    if (cn.includes('основная рама') || cn === 'рама') return 'frame';
    if (cn.includes('балконн')) return 'bb';
    if (cn.includes('окно') && !cn.includes('материалы')) return 'window';
    if (cn.includes('сайдинг')) return 'siding';
    if (cn.includes('крыш')) return 'roof';
    return 'other';
  };

  return (
    <div className="space-y-4">
      {tabCats.map((cat) => {
        if (isHiddenCat(cat)) return null;

        const catType = getCatType(cat);
        const allOpts = db.options.filter((o) => o.category_id === cat.id);
        const opts = catType === 'frame' ? filterFrameOpts(cat, allOpts) : allOpts;
        const selectedId = getOpt(tabId, cat.id);
        const selectedOpt = opts.find((o) => o.id === selectedId);
        const mats = selectedOpt ? db.optionMaterials.filter((om) => om.option_id === selectedOpt.id) : [];
        const visibleMats = mats.filter((m) => m.visible);
        const hiddenMats = mats.filter((m) => !m.visible);
        const isActive = selectedOpt && selectedOpt.name !== 'Нет' && selectedOpt.name !== 'НЕТ';

        // Label
        const catLabel = catType === 'whatdo' ? 'Что делаем' : cat.name;

        return (
          <div key={cat.id} className="card p-4">
            <Sel
              label={catLabel}
              value={selectedId || ''}
              onChange={(v) => setOpt(tabId, cat.id, v ? Number(v) : null)}
              options={[
                { value: '', label: '— Не выбрано —' },
                ...opts.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />

            {/* Подсказка фильтрации рамы */}
            {catType === 'frame' && whatDoOpt && (
              <div className="text-[11px] text-gray-400 -mt-2 mb-2 px-1">
                {isBalcony ? 'Балкон → П-образное / Г-образное' : isLodzhia ? 'Лоджия → Прямое' : ''}
              </div>
            )}

            {/* ═══ Основная Рама ═══ */}
            {catType === 'frame' && frameSelected && (
              <div>
                <DimsBlock label="Основная Рама" tabId={tabId} dimsKey="_glazingDims" />
                {/* Открытые материалы */}
                {visibleMats.map((om) => {
                  if (isRemoved(tabId, cat.id, om.id)) return (
                    <MatRow key={om.id} om={om} qty={0} hint="" modeLabel="" isHidden={false}
                      isRemoved={true} onQtyChange={() => {}} onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
                  );
                  return (
                    <MatRow key={om.id} om={om}
                      qty={getQty(tabId, cat.id, om.material_id) ?? om.quantity}
                      hint="" modeLabel=""
                      isHidden={false} isRemoved={false}
                      onQtyChange={(q) => setQty(tabId, cat.id, om.material_id, q)}
                      onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)}
                    />
                  );
                })}
                {/* Скрытые с calc_mode */}
                <HiddenMats mats={hiddenMats} tabId={tabId} catId={cat.id}
                  hMm={glazingDims.height} wMm={glazingDims.length} direction="vertical" />
              </div>
            )}

            {/* ═══ Замена балконного блока ═══ */}
            {catType === 'bb' && isActive && (
              <BBBlock tabId={tabId} cat={cat} mats={mats} />
            )}

            {/* ═══ Окна (массив) ═══ */}
            {catType === 'window' && isActive && (
              <WindowsBlock tabId={tabId} cat={cat} mats={mats} />
            )}

            {/* ═══ Сайдинг ═══ */}
            {catType === 'siding' && needSiding && (
              <SidingBlock tabId={tabId} visibleMats={visibleMats} sidingDims={sidingDims} sidingDir={sidingDir} />
            )}

            {/* ═══ Крыша ═══ */}
            {catType === 'roof' && isActive && (
              <RoofBlock tabId={tabId} cat={cat} visibleMats={visibleMats} hiddenMats={hiddenMats} />
            )}

            {/* ═══ Стандартные категории (не спец-блоки) ═══ */}
            {catType === 'other' && catType !== 'whatdo' && (
              <>
                {visibleMats.map((om) => {
                  if (isRemoved(tabId, cat.id, om.id)) return (
                    <MatRow key={om.id} om={om} qty={0} hint="" modeLabel="" isHidden={false}
                      isRemoved={true} onQtyChange={() => {}} onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
                  );
                  const userQ = getQty(tabId, cat.id, om.material_id);
                  const qty = userQ !== undefined ? userQ : (om.quantity || 0);
                  return (
                    <MatRow key={om.id} om={om} qty={qty} hint="" modeLabel=""
                      isHidden={false} isRemoved={false}
                      onQtyChange={(q) => setQty(tabId, cat.id, om.material_id, q)}
                      onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
                  );
                })}
                <HiddenMats mats={hiddenMats} tabId={tabId} catId={cat.id}
                  hMm={glazingDims.height} wMm={glazingDims.length} direction="vertical" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// BBBlock — Замена балконного блока (Дверь + Окно)
// ════════════════════════════════════════════════════════

function BBBlock({ tabId, cat, mats }: {
  tabId: string; cat: Category; mats: OptionMaterial[];
}) {
  const { setExtra, getSel, getQty, setQty, isRemoved, toggleRemove } = useCalcStore();
  const ts = getSel(tabId);
  const doorH = (ts._bbDoorH as number) || 2100;
  const doorW = (ts._bbDoorW as number) || 700;
  const winH = (ts._bbWinH as number) || 1400;
  const winW = (ts._bbWinW as number) || 900;

  const doorA = (doorH / 1000) * (doorW / 1000);
  const winA = (winH / 1000) * (winW / 1000);
  const totalA = doorA + winA;
  const maxH = Math.max(doorH, winH);
  const totalP = 2 * (maxH / 1000) + (doorW / 1000) + (winW / 1000) + Math.abs(doorH - winH) / 1000;

  const hiddenMats = mats.filter((m) => !m.visible);

  return (
    <div>
      <div className="bg-surface-50 rounded-xl p-3 border border-surface-200 mb-3">
        <div className="text-xs font-semibold text-brand-600 mb-3">📐 Размеры балконного блока</div>
        <div className="flex gap-4 flex-wrap mb-3">
          <div>
            <div className="text-[11px] text-gray-400 font-semibold mb-1">🚪 Дверь</div>
            <div className="flex gap-2">
              <NI label="H мм" value={doorH} onChange={(v) => setExtra(tabId, '_bbDoorH', v)} />
              <NI label="W мм" value={doorW} onChange={(v) => setExtra(tabId, '_bbDoorW', v)} />
            </div>
          </div>
          <div>
            <div className="text-[11px] text-gray-400 font-semibold mb-1">🪟 Окно</div>
            <div className="flex gap-2">
              <NI label="H мм" value={winH} onChange={(v) => setExtra(tabId, '_bbWinH', v)} />
              <NI label="W мм" value={winW} onChange={(v) => setExtra(tabId, '_bbWinW', v)} />
            </div>
          </div>
        </div>
        <div className="flex gap-3 text-xs text-brand-600 font-mono bg-brand-50 px-3 py-2 rounded-lg">
          <span>S={totalA.toFixed(2)}м²</span>
          <span>P≈{totalP.toFixed(2)}м</span>
        </div>
      </div>

      {/* Скрытые материалы ББ */}
      {hiddenMats.length > 0 && (
        <details className="mt-2" open>
          <summary className="text-xs text-amber-600 cursor-pointer font-semibold py-1">
            🔒 Скрытые ({hiddenMats.length})
          </summary>
          <div className="mt-1 space-y-0.5">
            {hiddenMats.map((om) => {
              if (isRemoved(tabId, cat.id, om.id)) return null;
              const base = om.quantity || 0;
              const mode = om.calc_mode || 'fixed';
              const toSht = (pm: number) => {
                if (pm <= 0) return 0;
                const md = parseDims(om.materials?.description);
                return md.d > 0 ? Math.ceil(pm / (md.d / 1000)) : Math.ceil(pm);
              };
              let qty = base;
              if (mode === 'perim') qty = toSht(base * totalP);
              else if (mode === 'per_sqm') qty = Math.ceil(base * totalA);
              const uq = getQty(tabId, cat.id, om.material_id);
              const q = uq !== undefined ? uq : qty;

              return (
                <MatRow key={om.id} om={om} qty={q} hint="" modeLabel={CALC_MODE_LABELS[mode] || ''}
                  isHidden={true} isRemoved={false}
                  onQtyChange={(v) => setQty(tabId, cat.id, om.material_id, v)}
                  onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// WindowsBlock — массив окон
// ════════════════════════════════════════════════════════

function WindowsBlock({ tabId, cat, mats }: {
  tabId: string; cat: Category; mats: OptionMaterial[];
}) {
  const { getWindows, addWindow, removeWindow, updateWindow, getQty, setQty, isRemoved, toggleRemove } = useCalcStore();
  const windows = getWindows(tabId);
  const hiddenMats = mats.filter((m) => !m.visible);

  // Суммарные значения
  let totalP = 0, totalA = 0;
  windows.forEach((w) => {
    totalP += 2 * (w.h / 1000 + w.w / 1000);
    totalA += (w.h / 1000) * (w.w / 1000);
  });

  return (
    <div>
      {windows.map((w, i) => (
        <div key={i} className="bg-surface-50 rounded-xl p-3 border border-surface-200 mb-2">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-brand-600">
              🪟 Окно {windows.length > 1 ? i + 1 : ''}
            </span>
            {windows.length > 1 && (
              <button onClick={() => removeWindow(tabId, i)}
                className="text-gray-300 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex gap-3 flex-wrap items-end">
            <NI label="H мм" value={w.h} onChange={(v) => updateWindow(tabId, i, 'h', v)} />
            <NI label="W мм" value={w.w} onChange={(v) => updateWindow(tabId, i, 'w', v)} />
            <div className="bg-brand-50 text-brand-600 font-mono text-[11px] px-2.5 py-1.5 rounded-lg mb-1">
              P={(2 * (w.h / 1000 + w.w / 1000)).toFixed(2)}м S={(w.h / 1000 * w.w / 1000).toFixed(2)}м²
            </div>
          </div>
        </div>
      ))}

      <button onClick={() => addWindow(tabId)}
        className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 bg-brand-50 border border-brand-200 px-3 py-2 rounded-lg hover:bg-brand-100 transition-colors mb-2">
        <Plus className="w-3.5 h-3.5" /> Добавить окно
      </button>

      {windows.length > 0 && (
        <div className="text-[11px] text-brand-500 font-mono mb-2">
          Итого: P={totalP.toFixed(2)}м S={totalA.toFixed(2)}м² ({windows.length} шт.)
        </div>
      )}

      {/* Скрытые материалы окон */}
      {hiddenMats.length > 0 && (
        <details open>
          <summary className="text-xs text-amber-600 cursor-pointer font-semibold py-1">
            🔒 Скрытые ({hiddenMats.length})
          </summary>
          <div className="mt-1 space-y-0.5">
            {hiddenMats.map((om) => {
              if (isRemoved(tabId, cat.id, om.id)) return null;
              const base = om.quantity || 0;
              const mode = om.calc_mode || 'fixed';
              const toSht = (pm: number) => {
                if (pm <= 0) return 0;
                const md = parseDims(om.materials?.description);
                return md.d > 0 ? Math.ceil(pm / (md.d / 1000)) : Math.ceil(pm);
              };
              let qty = base;
              if (mode === 'fixed') qty = base * windows.length;
              else if (mode === 'perim') qty = toSht(base * totalP);
              else if (mode === 'per_sqm') qty = Math.ceil(base * totalA);
              else if (mode === 'width' || mode === 'width_top') {
                let tw = 0; windows.forEach((w) => tw += w.w / 1000);
                qty = toSht(base * tw);
              } else if (mode === 'height') {
                let th = 0; windows.forEach((w) => th += w.h / 1000 * 2);
                qty = toSht(base * th);
              }
              const uq = getQty(tabId, cat.id, om.material_id);
              const q = uq !== undefined ? uq : qty;

              return (
                <MatRow key={om.id} om={om} qty={q} hint="" modeLabel={CALC_MODE_LABELS[mode] || ''}
                  isHidden={true} isRemoved={false}
                  onQtyChange={(v) => setQty(tabId, cat.id, om.material_id, v)}
                  onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// SidingBlock — Сайдинг
// ════════════════════════════════════════════════════════

function SidingBlock({ tabId, visibleMats, sidingDims, sidingDir }: {
  tabId: string; visibleMats: OptionMaterial[];
  sidingDims: { height: number; length: number }; sidingDir: string;
}) {
  const { setBlockDim, setExtra } = useCalcStore();
  const sidingArea = (sidingDims.height / 1000) * (sidingDims.length / 1000);

  return (
    <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 mb-3">
      <div className="text-xs font-semibold text-amber-700 mb-2">📐 Размеры сайдинга</div>
      <div className="flex gap-3 flex-wrap items-end mb-2">
        <NI label="Высота (мм)" value={sidingDims.height} onChange={(v) => setBlockDim(tabId, '_sidingDims', 'height', v)} />
        <NI label="Ширина (мм)" value={sidingDims.length} onChange={(v) => setBlockDim(tabId, '_sidingDims', 'length', v)} />
        {sidingArea > 0 && (
          <div className="bg-brand-50 text-brand-700 font-mono text-sm font-bold px-3 py-2 rounded-lg mb-1">
            {sidingArea.toFixed(2)} м²
          </div>
        )}
      </div>
      <DirToggle dir={sidingDir} onDir={(d) => setExtra(tabId, '_sidingDir', d)} />

      {/* Чистовой расчёт */}
      {sidingArea > 0 && visibleMats.map((om) => {
        const mat = om.materials;
        if (!mat) return null;
        const autoQty = calcMatQty(sidingDims.height, sidingDims.length, mat.description, sidingDir);
        return (
          <div key={om.id} className="flex justify-between items-center text-sm mt-2">
            <span className="text-brand-700 font-medium">{mat.name}</span>
            <span className="font-mono font-bold text-emerald-600">{autoQty} шт.</span>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// RoofBlock — Крыша
// ════════════════════════════════════════════════════════

function RoofBlock({ tabId, cat, visibleMats, hiddenMats }: {
  tabId: string; cat: Category;
  visibleMats: OptionMaterial[]; hiddenMats: OptionMaterial[];
}) {
  const { getBlockDims, setBlockDim, getQty, setQty, isRemoved, toggleRemove } = useCalcStore();
  const rd = getBlockDims(tabId, '_roofDims');
  const rH = rd.height / 1000, rW = rd.length / 1000;
  const rA = rH * rW;
  const rP = rH > 0 && rW > 0 ? 2 * (rH + rW) : 0;

  return (
    <div>
      <div className="bg-surface-50 rounded-xl p-3 border border-surface-200 mb-3">
        <div className="text-xs font-semibold text-brand-600 mb-2">📐 Размеры крыши</div>
        <div className="flex gap-3 flex-wrap items-end">
          <NI label="Длина (мм)" value={rd.length} onChange={(v) => setBlockDim(tabId, '_roofDims', 'length', v)} />
          <NI label="Ширина (мм)" value={rd.height} onChange={(v) => setBlockDim(tabId, '_roofDims', 'height', v)} />
          {rA > 0 && (
            <div className="bg-brand-50 text-brand-700 font-mono text-xs px-2.5 py-2 rounded-lg mb-1">
              S={rA.toFixed(2)}м² P={rP.toFixed(2)}м
            </div>
          )}
        </div>
      </div>

      {/* Открытые */}
      {visibleMats.map((om) => {
        if (isRemoved(tabId, cat.id, om.id)) return null;
        const autoQty = rA > 0 ? calcMatQty(rd.height, rd.length, om.materials?.description, 'horizontal') : 0;
        const uq = getQty(tabId, cat.id, om.material_id);
        const qty = uq !== undefined ? uq : autoQty;
        return (
          <MatRow key={om.id} om={om} qty={qty} hint="" modeLabel=""
            isHidden={false} isRemoved={false}
            onQtyChange={(q) => setQty(tabId, cat.id, om.material_id, q)}
            onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
        );
      })}

      {/* Скрытые */}
      {hiddenMats.length > 0 && rA > 0 && (
        <details open>
          <summary className="text-xs text-amber-600 cursor-pointer font-semibold py-1">
            🔒 Скрытые ({hiddenMats.length})
          </summary>
          <div className="mt-1 space-y-0.5">
            {hiddenMats.map((om) => {
              if (isRemoved(tabId, cat.id, om.id)) return null;
              const base = om.quantity || 0;
              const mode = om.calc_mode || 'fixed';
              const toSht = (pm: number) => {
                if (pm <= 0) return 0;
                const md = parseDims(om.materials?.description);
                return md.d > 0 ? Math.ceil(pm / (md.d / 1000)) : Math.ceil(pm);
              };
              let qty = base;
              if (mode === 'perim') qty = toSht(base * rP);
              else if (mode === 'per_sqm') qty = Math.ceil(base * rA);
              else if (mode === 'width') qty = toSht(base * rW);
              else if (mode === 'height') qty = toSht(base * rH);
              else if (mode === 'step') {
                const st = Math.floor(rd.length / base) + 1;
                const sl = rd.height;
                qty = toSht(st * sl / 1000);
              } else if (mode === 'area_sheet') {
                const md = parseDims(om.materials?.description);
                const ma = md.d * md.s / 1e6;
                if (ma > 0) qty = Math.ceil(rA / ma * 1.1 * base);
              }
              const uq = getQty(tabId, cat.id, om.material_id);
              const q = uq !== undefined ? uq : qty;

              return (
                <MatRow key={om.id} om={om} qty={q} hint="" modeLabel={CALC_MODE_LABELS[mode] || ''}
                  isHidden={true} isRemoved={false}
                  onQtyChange={(v) => setQty(tabId, cat.id, om.material_id, v)}
                  onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// FurnitureBlock — Мебель с несколькими позициями
// ════════════════════════════════════════════════════════

function FurnitureBlock({ tabId, db }: { tabId: string; db: CalcDB }) {
  const store = useCalcStore();
  const { getFurniture, addFurniture, removeFurniture, updateFurnitureCat } = store;
  const tabCats = useMemo(() => db.categories.filter((c) => c.tab_id === tabId), [db, tabId]);
  const items = getFurniture(tabId);

  const getFurnitureName = (fi: FurnitureItem): string => {
    const names: string[] = [];
    tabCats.forEach((cat) => {
      const optId = fi.catSelections[cat.id];
      if (optId) {
        const opt = db.options.find((o) => o.id === optId);
        if (opt && opt.name !== 'Нет') names.push(opt.name);
      }
    });
    return names.join(' / ') || 'Не выбрано';
  };

  return (
    <div className="space-y-3">
      {items.map((fi, idx) => {
        const posName = getFurnitureName(fi);
        const totalCost = tabCats.reduce((sum, cat) => {
          const optId = fi.catSelections[cat.id];
          if (!optId) return sum;
          return sum + db.optionMaterials
            .filter((om) => om.option_id === optId)
            .reduce((s, om) => s + (om.quantity || 0) * (om.materials?.price || 0), 0);
        }, 0);

        return (
          <div key={idx} className="card p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-bold text-brand-700">🪑 {posName}</span>
              <div className="flex items-center gap-2">
                {totalCost > 0 && (
                  <span className="font-mono text-xs text-emerald-600 font-bold">
                    {totalCost.toLocaleString('ru')}₽
                  </span>
                )}
                <button onClick={() => removeFurniture(tabId, idx)}
                  className="text-gray-300 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {tabCats.map((cat) => {
              const allOpts = db.options.filter((o) => o.category_id === cat.id);
              const selOptId = fi.catSelections[cat.id] || null;
              const selOpt = allOpts.find((o) => o.id === selOptId);
              const mats = selOpt ? db.optionMaterials.filter((om) => om.option_id === selOpt.id) : [];

              return (
                <div key={cat.id} className="mb-2">
                  <Sel
                    label={cat.name}
                    value={selOptId || ''}
                    onChange={(v) => updateFurnitureCat(tabId, idx, cat.id, v ? Number(v) : null)}
                    options={[
                      { value: '', label: '— Не выбрано —' },
                      ...allOpts.map((o) => ({ value: o.id, label: o.name })),
                    ]}
                  />
                  {mats.length > 0 && (
                    <div className="space-y-0.5 -mt-1">
                      {mats.map((om) => (
                        <div key={om.id} className="flex items-center gap-2 px-3 py-1 text-xs text-gray-500">
                          <span className="flex-1">{om.materials?.name}</span>
                          <span className="font-mono text-[11px]">{om.quantity} {om.materials?.unit}</span>
                          {om.materials?.price! > 0 && (
                            <span className="text-accent-500 font-mono font-semibold">{om.materials!.price}₽</span>
                          )}
                          {om.materials?.price! > 0 && om.quantity > 0 && (
                            <span className="text-emerald-600 font-mono font-bold">
                              ={(om.materials!.price * om.quantity).toLocaleString('ru')}₽
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <button onClick={() => addFurniture(tabId)}
        className="flex items-center gap-2 w-full justify-center text-sm font-semibold text-brand-600 bg-brand-50 border border-brand-200 px-4 py-3 rounded-xl hover:bg-brand-100 transition-colors">
        <Plus className="w-4 h-4" /> Добавить мебель
      </button>

      {items.length === 0 && (
        <div className="card p-8 text-center text-gray-400 text-sm">
          Нажмите «Добавить мебель» чтобы добавить позицию
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// DynTab — вкладка с динамическим содержимым
// ════════════════════════════════════════════════════════

function DynTab({ tabId }: { tabId: string }) {
  const { db, getOpt, setOpt, getDims, setDim, getDir, setDir, getQty, setQty, isRemoved, toggleRemove, getSel, setExtra } = useCalcStore();
  if (!db) return null;

  const tabCats = useMemo(() => db.categories.filter((c) => c.tab_id === tabId), [db, tabId]);
  const isSurface = SURFACE_IDS.includes(tabId);
  const isGlazing = tabId === 'glazing';
  const isFurniture = tabId === 'furniture';
  const isFloor = tabId === 'floor';
  const isMainWall = tabId === 'main_wall';

  const dims = getDims(tabId);
  const dir = getDir(tabId);
  const hMm = dims.height;
  const wMm = dims.length;
  const hM = hMm / 1000;
  const wM = wMm / 1000;
  const rawArea = hM * wM;

  // Балконный блок на главной стене
  const ts = getSel(tabId);
  const hasWindow = isMainWall && !!ts._hasWindow;
  const bbDoorH = (ts._mwBbDoorH as number) || 2100;
  const bbDoorW = (ts._mwBbDoorW as number) || 700;
  const bbWinH = (ts._mwBbWinH as number) || 1400;
  const bbWinW = (ts._mwBbWinW as number) || 900;
  const windowArea = (bbDoorH / 1000) * (bbDoorW / 1000) + (bbWinH / 1000) * (bbWinW / 1000);
  const area = isMainWall && hasWindow ? Math.max(0, rawArea - windowArea) : rawArea;
  const perimM = hM > 0 && wM > 0 ? 2 * (hM + wM) : 0;

  // Размеры с других стен для подсказок
  const mainDims = getDims('main_wall');
  const facadeDims = getDims('facade_wall');
  const blDims = getDims('bl_wall');
  const mainH = mainDims.height;
  const mainW = mainDims.length;
  const facadeW = facadeDims.length;
  const blW = blDims.length;

  // ── Остекление ──
  if (isGlazing) return <GlazingBlock tabId={tabId} db={db} />;

  // ── Мебель ──
  if (isFurniture) return <FurnitureBlock tabId={tabId} db={db} />;

  return (
    <div className="space-y-4">
      {/* Размеры для поверхностей */}
      {isSurface && (
        <div className="card p-4">
          <div className="flex gap-3 flex-wrap items-end mb-3">
            <NI label={isFloor ? 'Длина (мм)' : 'Высота (мм)'} value={hMm} onChange={(v) => setDim(tabId, 'height', v)} />
            <NI label="Ширина (мм)" value={wMm} onChange={(v) => setDim(tabId, 'length', v)} />
            {rawArea > 0 && (
              <div className="bg-brand-50 text-brand-700 font-mono text-sm font-bold px-3 py-2 rounded-lg mb-1">
                {area.toFixed(2)} м²{isMainWall && hasWindow ? ` (−${windowArea.toFixed(2)} окно)` : ''}
              </div>
            )}
          </div>

          {/* Подсказки размеров */}
          {!isFloor && !isMainWall && !hMm && mainH > 0 && (
            <button onClick={() => setDim(tabId, 'height', mainH)}
              className="text-[11px] text-brand-600 bg-brand-50 border border-brand-200 px-2.5 py-1.5 rounded-lg hover:bg-brand-100 transition-colors mb-2 inline-block">
              💡 Высота как на главной: {mainH} мм
            </button>
          )}
          {isFloor && !hMm && (facadeW > 0 || mainW > 0) && (
            <button onClick={() => { setDim(tabId, 'height', facadeW || mainW); setDim(tabId, 'length', blW || 1000); }}
              className="text-[11px] text-brand-600 bg-brand-50 border border-brand-200 px-2.5 py-1.5 rounded-lg hover:bg-brand-100 transition-colors mb-2 inline-block">
              💡 Подставить: {facadeW || mainW} × {blW || 1000} мм
            </button>
          )}

          {/* Балконный блок на главной стене */}
          {isMainWall && (
            <div className="mb-3">
              <label className="flex items-center gap-3 cursor-pointer select-none py-2">
                <div onClick={() => setExtra(tabId, '_hasWindow', !hasWindow)}
                  className={`w-10 h-6 rounded-full flex-shrink-0 relative transition-colors cursor-pointer ${hasWindow ? 'bg-brand-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${hasWindow ? 'left-[18px]' : 'left-0.5'}`} />
                </div>
                <span className="text-sm">🪟 Есть балконный блок</span>
              </label>
              {hasWindow && (
                <div className="bg-surface-50 rounded-xl p-3 border border-surface-200 mt-2">
                  <div className="flex gap-4 flex-wrap mb-2">
                    <div>
                      <div className="text-[11px] text-gray-400 font-semibold mb-1">🚪 Дверь</div>
                      <div className="flex gap-2">
                        <NI label="H мм" value={bbDoorH} onChange={(v) => setExtra(tabId, '_mwBbDoorH', v)} />
                        <NI label="W мм" value={bbDoorW} onChange={(v) => setExtra(tabId, '_mwBbDoorW', v)} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-400 font-semibold mb-1">🪟 Окно</div>
                      <div className="flex gap-2">
                        <NI label="H мм" value={bbWinH} onChange={(v) => setExtra(tabId, '_mwBbWinH', v)} />
                        <NI label="W мм" value={bbWinW} onChange={(v) => setExtra(tabId, '_mwBbWinW', v)} />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-brand-600 font-mono bg-brand-50 px-3 py-2 rounded-lg">
                    <span>Вычет S = {windowArea.toFixed(2)} м²</span>
                    <span>({bbDoorW}+{bbWinW} = {bbDoorW + bbWinW} мм)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isFloor && <DirToggle dir={dir} onDir={(d) => setDir(tabId, d)} />}

          {(hMm > 0 || wMm > 0) && (
            <DimsInfo hMm={hMm} wMm={wMm} />
          )}
        </div>
      )}

      {/* Категории */}
      {tabCats.map((cat) => {
        const cn = cat.name.toLowerCase();
        const isHiddenCat = cn.includes('материалы для установки') || cn.includes('материалы установки');
        if (isHiddenCat) return null;

        const allOpts = db.options.filter((o) => o.category_id === cat.id);
        const selectedId = getOpt(tabId, cat.id);
        const selectedOpt = allOpts.find((o) => o.id === selectedId);
        const mats = selectedOpt ? db.optionMaterials.filter((om) => om.option_id === selectedOpt.id) : [];
        const visibleMats = mats.filter((m) => m.visible);
        const hiddenMats = mats.filter((m) => !m.visible);

        const isFinish = isSurface && cat.name === 'Вид отделки';
        const isInsul = isSurface && cn.includes('утепл');
        const isPaint = isSurface && cn.includes('покраск');

        return (
          <div key={cat.id} className="card p-4">
            <Sel
              label={cat.name}
              value={selectedId || ''}
              onChange={(v) => setOpt(tabId, cat.id, v ? Number(v) : null)}
              options={[
                { value: '', label: '— Не выбрано —' },
                ...allOpts.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />

            {/* Отделка: авторасчёт */}
            {isFinish && selectedOpt && selectedOpt.name !== 'Нет' && area > 0 && (
              <div className="space-y-2">
                {visibleMats.map((om) => {
                  if (isRemoved(tabId, cat.id, om.id)) {
                    return (
                      <MatRow key={om.id} om={om} qty={0} hint="" modeLabel="" isHidden={false}
                        isRemoved={true} onQtyChange={() => {}} onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
                    );
                  }
                  let effH = hMm, effW = wMm;
                  if (isMainWall && hasWindow && rawArea > 0) {
                    effW = Math.round(wMm * (area / rawArea));
                  }
                  const defQty = calcMatQty(effH, effW, om.materials?.description, dir);
                  const userQty = getQty(tabId, cat.id, om.material_id);
                  const qty = userQty !== undefined ? userQty : defQty;
                  const cost = (om.materials?.price || 0) * qty;

                  return (
                    <div key={om.id} className="bg-surface-50 border border-surface-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-brand-700">{om.materials?.name}</span>
                        <div className="flex items-center gap-2">
                          <input type="number" min="0" value={qty}
                            onChange={(e) => setQty(tabId, cat.id, om.material_id, e.target.value === '' ? 0 : Number(e.target.value))}
                            className="w-16 px-2 py-1.5 text-right font-mono text-sm border border-surface-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-500/20"
                          />
                          <span className="text-xs text-gray-400">шт.</span>
                          <button onClick={() => toggleRemove(tabId, cat.id, om.id)} className="text-gray-300 hover:text-red-500 px-1">✕</button>
                        </div>
                      </div>
                      {userQty !== undefined && userQty !== defQty && (
                        <div className="text-[10px] text-amber-600 mb-1">⚠ Изменено (авто: {defQty})</div>
                      )}
                      <div className="text-[10px] text-gray-400">{dir === 'vertical' ? '↕' : '↔'} • {om.materials?.description || '?'}</div>
                      {cost > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {om.materials?.price}₽ × {qty} = <span className="text-emerald-600 font-bold">{cost.toLocaleString('ru')}₽</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Утепление */}
            {isInsul && selectedOpt && selectedOpt.name !== 'Нет' && area > 0 && visibleMats.map((om) => {
              if (isRemoved(tabId, cat.id, om.id)) return null;
              const qty = calcInsulation(area);
              return (
                <div key={om.id} className="flex items-center gap-2 p-2.5 bg-surface-50 rounded-lg">
                  <span className="flex-1 text-sm text-gray-600">{om.materials?.name}</span>
                  <span className="font-mono text-sm font-bold text-emerald-600">{qty} шт.</span>
                  {om.materials?.price && om.materials.price > 0 && (
                    <span className="text-xs text-emerald-600 font-mono">={(om.materials.price * qty).toLocaleString('ru')}₽</span>
                  )}
                </div>
              );
            })}

            {/* Покраска */}
            {isPaint && selectedOpt && selectedOpt.name !== 'Нет' && area > 0 && (
              <div className="bg-surface-50 rounded-lg p-3 border border-surface-200">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-500">🎨 Краска (1л/7м²)</span>
                  <span className="font-mono font-bold text-emerald-600">{Math.round(area / 7 * 100) / 100} л.</span>
                </div>
              </div>
            )}

            {/* Стандартные открытые */}
            {!isFinish && !isInsul && !isPaint && visibleMats.map((om) => {
              if (isRemoved(tabId, cat.id, om.id)) {
                return (
                  <MatRow key={om.id} om={om} qty={0} hint="" modeLabel="" isHidden={false}
                    isRemoved={true} onQtyChange={() => {}} onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
                );
              }
              const userQ = getQty(tabId, cat.id, om.material_id);
              const qty = userQ !== undefined ? userQ : (om.quantity || 0);
              return (
                <MatRow
                  key={om.id} om={om} qty={qty} hint="" modeLabel=""
                  isHidden={false} isRemoved={false}
                  onQtyChange={(q) => setQty(tabId, cat.id, om.material_id, q)}
                  onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)}
                />
              );
            })}

            {/* Скрытые */}
            {!isFinish && (
              <HiddenMats mats={hiddenMats} tabId={tabId} catId={cat.id} hMm={hMm} wMm={wMm} direction={dir} />
            )}

            {/* Скрытые для отделки */}
            {isFinish && selectedOpt && selectedOpt.name !== 'Нет' && area > 0 && (
              <HiddenMats mats={hiddenMats} tabId={tabId} catId={cat.id}
                hMm={isMainWall && hasWindow && rawArea > 0 ? hMm : hMm}
                wMm={isMainWall && hasWindow && rawArea > 0 ? Math.round(wMm * (area / rawArea)) : wMm}
                direction={dir} />
            )}
          </div>
        );
      })}

      {tabCats.length === 0 && (
        <div className="card p-8 text-center text-gray-400 text-sm">
          Нет категорий для этой вкладки. Добавьте через Справочник.
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// ClientPicker — выбор клиента из CRM
// ════════════════════════════════════════════════════════

function ClientPicker({ onSelect, onClose }: {
  onSelect: (id: string, name: string, address?: string, phone?: string) => void;
  onClose: () => void;
}) {
  const [clients, setClients] = useState<Array<{ id: string; name: string; phone: string; address: string | null }>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const orgId = useAuthStore.getState().organization?.id;
      const { data } = await supabase.from('clients').select('id, name, phone, address')
        .eq('org_id', orgId).order('created_at', { ascending: false }).limit(100);
      setClients(data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex justify-between items-center px-5 py-4 border-b border-surface-200">
          <h3 className="text-base font-bold text-gray-900">Выбрать клиента</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-4 pt-3">
          <input className="input text-sm" placeholder="Поиск по имени или телефону..."
            value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-gray-400 py-8 text-sm">Клиенты не найдены</div>
          )}
          {filtered.map((c) => (
            <button key={c.id} onClick={() => onSelect(c.id, c.name, c.address || undefined, c.phone)}
              className="w-full text-left card p-3 hover:border-brand-300 transition-colors">
              <div className="text-sm font-semibold text-gray-800">{c.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{c.phone}{c.address ? ' · ' + c.address : ''}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// OrdersModal — список сохранённых заказов
// ════════════════════════════════════════════════════════

function OrdersModal({ onClose, onLoad, notify }: {
  onClose: () => void;
  onLoad: (order: { id: string; order_number: string; address: string; phone: string; form_data: Record<string, Record<string, unknown>> }) => void;
  notify: (msg: string) => void;
}) {
  const [orders, setOrders] = useState<Array<{
    id: string; order_number: string; address: string; phone: string;
    total_cost: number; created_at: string; form_data: Record<string, Record<string, unknown>>;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('orders')
        .select('*').order('created_at', { ascending: false }).limit(50);
      if (error) { notify('Ошибка: ' + error.message); return; }
      setOrders(data || []);
      setLoading(false);
    })();
  }, []);

  const handleDelete = async (id: string, num: string) => {
    if (!confirm('Удалить заказ №' + num + '?')) return;
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) { notify('Ошибка: ' + error.message); return; }
    setOrders((prev) => prev.filter((o) => o.id !== id));
    notify('Заказ удалён');
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex justify-between items-center px-5 py-4 border-b border-surface-200">
          <h3 className="text-base font-bold text-gray-900">📋 Заказы</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          )}
          {!loading && orders.length === 0 && (
            <div className="text-center text-gray-400 py-8 text-sm">Нет сохранённых заказов</div>
          )}
          {orders.map((o) => (
            <div key={o.id} className="card p-3 hover:border-brand-300 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-bold text-gray-800">№{o.order_number || '—'}</span>
                <span className="text-xs text-gray-400">
                  {new Date(o.created_at).toLocaleDateString('ru')}
                </span>
              </div>
              <div className="text-xs text-gray-500 mb-2 truncate">
                {o.address || '—'} · {o.phone || '—'}
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-emerald-600">
                  {o.total_cost ? Number(o.total_cost).toLocaleString('ru') + '₽' : '—'}
                </span>
                <div className="flex gap-1.5">
                  <button onClick={() => onLoad(o)}
                    className="text-xs text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg hover:bg-brand-100 font-medium">
                    Загрузить
                  </button>
                  <button onClick={() => handleDelete(o.id, o.order_number)}
                    className="text-xs text-red-500 bg-red-50 px-2.5 py-1 rounded-lg hover:bg-red-100 font-medium">
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// ResultsView — экран результатов расчёта
// ════════════════════════════════════════════════════════

function ResultsView({ results, orderInfo, onBack, onExportPDF, onSave, saving }: {
  results: CalcResults;
  orderInfo: { order_number: string; address: string; phone: string };
  onBack: () => void;
  onExportPDF: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [view, setView] = useState<'sections' | 'merged'>('sections');
  const merged = useMemo(() => mergeResults(results), [results]);
  const grandTotal = useMemo(() =>
    Object.values(results).flat().reduce((s, r) => s + (r.cost || 0), 0),
    [results]
  );

  return (
    <div className="space-y-4">
      {/* Итого */}
      <div className="card p-5 bg-emerald-50 border-emerald-200">
        <div className="flex justify-between items-center">
          <span className="text-sm text-emerald-700 font-medium">Общая стоимость</span>
          <span className="text-2xl font-bold font-mono text-emerald-700">
            {grandTotal.toLocaleString('ru')} ₽
          </span>
        </div>
      </div>

      {/* Переключатель вида */}
      <div className="flex gap-2">
        <button onClick={() => setView('sections')}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            view === 'sections' ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium' : 'border-surface-200 text-gray-500'
          }`}>По секциям</button>
        <button onClick={() => setView('merged')}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            view === 'merged' ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium' : 'border-surface-200 text-gray-500'
          }`}>Сводная</button>
      </div>

      {/* По секциям */}
      {view === 'sections' && TABS.map((tab) => {
        const tabItems = results[tab.id];
        if (!tabItems || tabItems.length === 0) return null;
        const tabTotal = tabItems.reduce((s, r) => s + (r.cost || 0), 0);
        return (
          <div key={tab.id} className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-surface-50 border-b border-surface-200">
              <div className="flex items-center gap-2">
                <span className="text-lg">{tab.icon}</span>
                <span className="text-sm font-bold text-gray-800">{tab.label}</span>
                <span className="text-xs text-gray-400">({tabItems.filter((i) => !i.isInfo).length})</span>
              </div>
              {tabTotal > 0 && (
                <span className="font-mono text-sm font-bold text-emerald-600">
                  {tabTotal.toLocaleString('ru')}₽
                </span>
              )}
            </div>
            <div className="divide-y divide-surface-100">
              {tabItems.map((it, i) => (
                it.isInfo ? (
                  <div key={i} className="px-4 py-2 bg-brand-50 text-xs font-semibold text-brand-700">
                    📌 {it.name}
                  </div>
                ) : (
                  <div key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
                    {it.auto && <span className="text-[10px] text-amber-500">🔒</span>}
                    <span className="flex-1 text-gray-700">{it.name}</span>
                    <span className="font-mono text-xs text-gray-500">{Math.round(it.qty * 100) / 100}</span>
                    <span className="text-[10px] text-gray-400 w-8">{it.unit}</span>
                    <span className="font-mono text-xs text-gray-400 w-14 text-right">
                      {it.price ? it.price + '₽' : '—'}
                    </span>
                    <span className="font-mono text-xs font-bold text-emerald-600 w-20 text-right">
                      {it.cost ? it.cost.toLocaleString('ru') + '₽' : '—'}
                    </span>
                  </div>
                )
              ))}
            </div>
          </div>
        );
      })}

      {/* Сводная */}
      {view === 'merged' && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 bg-surface-50 border-b border-surface-200">
            <span className="text-sm font-bold text-gray-800">Сводная ведомость (объединённая)</span>
          </div>
          <div className="divide-y divide-surface-100">
            {merged.filter((it) => !it.isInfo).map((it, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="text-xs text-gray-400 w-6 font-mono">{i + 1}</span>
                <span className="flex-1 text-gray-700">{it.name}</span>
                <span className="font-mono text-xs text-gray-500">{Math.round(it.qty * 100) / 100}</span>
                <span className="text-[10px] text-gray-400 w-8">{it.unit}</span>
                <span className="font-mono text-xs text-gray-400 w-14 text-right">
                  {it.price ? it.price + '₽' : '—'}
                </span>
                <span className="font-mono text-xs font-bold text-emerald-600 w-20 text-right">
                  {it.cost ? Math.round(it.cost).toLocaleString('ru') + '₽' : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Кнопки */}
      <div className="flex gap-3">
        <button onClick={onSave} disabled={saving}
          className="btn-primary flex-1 py-3">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Сохраняю...' : 'Сохранить заказ'}
        </button>
        <button onClick={onExportPDF} className="btn-secondary flex-1 py-3">
          <Printer className="w-4 h-4" /> PDF / Печать
        </button>
      </div>
      <button onClick={onBack} className="btn-secondary w-full py-3">
        <ArrowLeft className="w-4 h-4" /> К редактированию
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// Главная страница калькулятора
// ════════════════════════════════════════════════════════

const LS_KEY = 'k2_calc_sel';

export function CalculatorPage() {
  const store = useCalcStore();
  const { db, isLoading, error, activeTab, setActiveTab, loadData, sel } = store;
  const { orderId: urlOrderId } = useParams<{ orderId?: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<CalcResults | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orderInfo, setOrderInfo] = useState({ order_number: '', address: '', phone: '' });
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [toast, setToast] = useState('');

  // Загрузка данных
  useEffect(() => { loadData(); }, [loadData]);

  // Загрузка заказа по orderId из URL (из CRM)
  useEffect(() => {
    if (!urlOrderId) return;
    (async () => {
      try {
        const { data: order } = await supabase.from('orders').select('*').eq('id', urlOrderId).single();
        if (!order) return;
        // Загружаем form_data в стор
        if (order.form_data && typeof order.form_data === 'object') {
          Object.entries(order.form_data as Record<string, Record<string, unknown>>).forEach(([tabId, tabSel]) => {
            if (tabSel && typeof tabSel === 'object') {
              Object.entries(tabSel).forEach(([k, v]) => {
                store.setExtra(tabId, k, v);
              });
            }
          });
        }
        setOrderInfo({
          order_number: order.order_number || '',
          address: order.address || '',
          phone: order.phone || '',
        });
        setEditingOrderId(order.id);
        setClientId(order.client_id || null);
        // Загружаем имя клиента
        if (order.client_id) {
          const { data: client } = await supabase.from('clients').select('name').eq('id', order.client_id).single();
          if (client) setClientName(client.name);
        }
        notify('Заказ загружен из CRM');
      } catch {}
    })();
  }, [urlOrderId]);

  // Автонумерация заказа (только если нет urlOrderId)
  useEffect(() => {
    if (urlOrderId) return;
    (async () => {
      try {
        const { data } = await supabase.from('orders').select('order_number').order('created_at', { ascending: false }).limit(1);
        const last = data?.[0]?.order_number || '';
        const num = parseInt(last.replace(/\D/g, '')) || 0;
        setOrderInfo((p) => ({ ...p, order_number: String(num + 1) }));
      } catch {}
    })();
  }, [urlOrderId]);

  // localStorage — сохранение
  useEffect(() => {
    if (Object.keys(sel).length > 0) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(sel)); } catch {}
    }
  }, [sel]);

  // localStorage — загрузка
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([tabId, tabSel]) => {
            if (tabSel && typeof tabSel === 'object') {
              Object.entries(tabSel as Record<string, unknown>).forEach(([k, v]) => {
                store.setExtra(tabId, k, v);
              });
            }
          });
        }
      }
    } catch {}
  }, []);

  // Показать тост
  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Расчёт
  const handleCalc = () => {
    if (!db) return;
    const r = doCalc(sel, db);
    setResults(r);
    setShowResults(true);
    notify('Расчёт выполнен!');
  };

  // Сохранение заказа
  const handleSave = async () => {
    if (!results) return;
    setSaving(true);
    try {
      const total = Object.values(results).flat().reduce((s, r) => s + (r.cost || 0), 0);
      const orgId = useAuthStore.getState().organization?.id;
      const data: Record<string, unknown> = {
        org_id: orgId,
        status: 'lead' as const,
        order_number: orderInfo.order_number,
        address: orderInfo.address,
        phone: orderInfo.phone,
        form_data: sel,
        results,
        total_cost: total,
      };
      if (clientId) data.client_id = clientId;

      if (editingOrderId) {
        if (!confirm('Перезаписать заказ №' + orderInfo.order_number + '?')) { setSaving(false); return; }
        // При обновлении не меняем org_id и status
        const { org_id: _, status: __, ...updateData } = data;
        const { error: saveErr } = await supabase.from('orders').update(updateData).eq('id', editingOrderId);
        if (saveErr) throw saveErr;
        notify('Заказ №' + orderInfo.order_number + ' обновлён!');
      } else {
        const { error: saveErr } = await supabase.from('orders').insert(data);
        if (saveErr) throw saveErr;
        notify('Новый заказ сохранён!');
      }

      // Сброс после сохранения
      handleReset();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения';
      notify('Ошибка: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  // Сброс формы
  const handleReset = () => {
    Object.keys(sel).forEach((tabId) => {
      Object.keys(sel[tabId] || {}).forEach((k) => {
        store.setExtra(tabId, k, undefined);
      });
    });
    setResults(null);
    setShowResults(false);
    setEditingOrderId(null);
    setClientId(null);
    setClientName(null);
    localStorage.removeItem(LS_KEY);
    const num = parseInt(String(orderInfo.order_number).replace(/\D/g, '')) || 0;
    setOrderInfo({ order_number: String(num + 1), address: '', phone: '' });
    // Если пришли с /calculator/:orderId — вернуть на /calculator
    if (urlOrderId) navigate('/calculator');
  };

  // Загрузка заказа для редактирования
  const handleLoadOrder = (order: { id: string; order_number: string; address: string; phone: string; form_data: Record<string, Record<string, unknown>> }) => {
    // Загружаем form_data в стор
    if (order.form_data && typeof order.form_data === 'object') {
      Object.entries(order.form_data).forEach(([tabId, tabSel]) => {
        if (tabSel && typeof tabSel === 'object') {
          Object.entries(tabSel as Record<string, unknown>).forEach(([k, v]) => {
            store.setExtra(tabId, k, v);
          });
        }
      });
    }
    setOrderInfo({ order_number: order.order_number || '', address: order.address || '', phone: order.phone || '' });
    setEditingOrderId(order.id);
    setResults(null);
    setShowResults(false);
    setShowOrders(false);
    notify('Заказ №' + order.order_number + ' загружен');
  };

  // PDF
  const handlePDF = () => {
    if (results) exportPDF(results, orderInfo);
  };

  // Итого (для отображения в хедере)
  const grandTotal = useMemo(() => {
    if (!results) return 0;
    return Object.values(results).flat().reduce((s, r) => s + (r.cost || 0), 0);
  }, [results]);

  if (isLoading && !db) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <span className="ml-3 text-gray-500">Загрузка калькулятора...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        <AlertCircle className="w-4 h-4 shrink-0" />
        {error}
      </div>
    );
  }

  const activeTabInfo = TABS.find((t) => t.id === activeTab);

  return (
    <div className="space-y-4 pb-24">
      {/* Тост */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-pulse">
          {toast}
        </div>
      )}

      {/* Заголовок + Информация о заказе */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">К2 Калькулятор</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {db ? `${db.materials.length} мат. · ${db.categories.length} кат.` : ''}
              {editingOrderId && <span className="text-brand-500 ml-1">· ред. №{orderInfo.order_number}</span>}
            </p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {showResults && (
              <button onClick={() => setShowResults(false)} className="btn-secondary text-xs py-1.5 px-2.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Назад
              </button>
            )}
            {!showResults && (
              <>
                <button onClick={() => setShowOrders(true)} className="btn-secondary text-xs py-1.5 px-2.5">
                  <ClipboardList className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Заказы</span>
                </button>
                {(editingOrderId || Object.keys(sel).length > 0) && (
                  <button onClick={() => { if (confirm('Очистить форму и начать новый заказ?')) handleReset(); }}
                    className="btn-secondary text-xs py-1.5 px-2.5">
                    <FilePlus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Новый</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input placeholder="№ заказа" value={orderInfo.order_number}
            onChange={(e) => setOrderInfo((p) => ({ ...p, order_number: e.target.value }))}
            className="input py-2 text-sm flex-1 min-w-[80px]" />
          <input placeholder="Адрес" value={orderInfo.address}
            onChange={(e) => setOrderInfo((p) => ({ ...p, address: e.target.value }))}
            className="input py-2 text-sm flex-1 min-w-[100px]" />
          <input placeholder="Телефон" value={orderInfo.phone}
            onChange={(e) => setOrderInfo((p) => ({ ...p, phone: e.target.value }))}
            className="input py-2 text-sm flex-1 min-w-[100px]" />
        </div>
        {/* Привязка к клиенту */}
        <div className="flex items-center gap-2 mt-2">
          {clientId && clientName ? (
            <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg px-3 py-1.5 text-sm flex-1">
              <Users className="w-3.5 h-3.5 text-brand-500" />
              <span className="text-brand-700 font-medium truncate">{clientName}</span>
              <button onClick={() => { setClientId(null); setClientName(null); }}
                className="text-brand-400 hover:text-red-500 ml-auto"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => setShowClientPicker(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 bg-surface-50 border border-surface-200 rounded-lg px-3 py-1.5 hover:border-brand-300 hover:text-brand-600 transition-colors">
              <Users className="w-3.5 h-3.5" /> Привязать клиента
            </button>
          )}
        </div>
        {grandTotal > 0 && (
          <div className="mt-3 flex justify-between items-center bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
            <span className="text-sm text-emerald-700">Общая стоимость</span>
            <span className="text-lg font-bold font-mono text-emerald-700">{grandTotal.toLocaleString('ru')} ₽</span>
          </div>
        )}
      </div>

      {/* Экран результатов */}
      {showResults && results ? (
        <ResultsView
          results={results}
          orderInfo={orderInfo}
          onBack={() => setShowResults(false)}
          onExportPDF={handlePDF}
          onSave={handleSave}
          saving={saving}
        />
      ) : (
        <>
          {/* Вкладки */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 lg:-mx-6 lg:px-6">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const tabCats = db?.categories.filter((c) => c.tab_id === tab.id) || [];
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all
                    ${isActive
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'bg-white border border-surface-200 text-gray-600 hover:border-brand-300 hover:text-brand-600'
                    }`}
                >
                  <span>{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tabCats.length > 0 && !isActive && (
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                      {tabCats.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Заголовок */}
          {activeTabInfo && (
            <div className="flex items-center gap-2">
              <span className="text-xl">{activeTabInfo.icon}</span>
              <h2 className="text-lg font-bold text-gray-900">{activeTabInfo.label}</h2>
            </div>
          )}

          {/* Содержимое вкладки */}
          <DynTab tabId={activeTab} />

          {/* Разделитель */}
          <div className="border-t border-dashed border-surface-200 my-4" />

          {/* Справочник */}
          <details className="card overflow-hidden">
            <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-surface-50 transition-colors select-none">
              <span className="text-lg">📖</span>
              <span className="text-sm font-bold text-gray-800 flex-1">Справочник</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </summary>
            <div className="px-4 pb-4">
              {db && <TreeRef db={db} refresh={loadData} notify={notify} />}
            </div>
          </details>
        </>
      )}

      {/* Плавающая кнопка Рассчитать */}
      {!showResults && db && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <button onClick={handleCalc}
            className="flex items-center gap-3 bg-brand-500 text-white px-5 sm:px-6 py-3 sm:py-3.5 rounded-2xl text-sm font-bold shadow-lg shadow-brand-500/30 hover:bg-brand-600 transition-colors">
            <Calculator className="w-5 h-5" />
            Рассчитать
            {grandTotal > 0 && (
              <span className="font-mono">{grandTotal.toLocaleString('ru')} ₽</span>
            )}
          </button>
        </div>
      )}

      {/* Модалка заказов */}
      {showOrders && (
        <OrdersModal
          onClose={() => setShowOrders(false)}
          onLoad={handleLoadOrder}
          notify={notify}
        />
      )}

      {/* Модалка выбора клиента */}
      {showClientPicker && (
        <ClientPicker
          onClose={() => setShowClientPicker(false)}
          onSelect={(id, name, address, phone) => {
            setClientId(id);
            setClientName(name);
            if (address && !orderInfo.address) setOrderInfo((p) => ({ ...p, address }));
            if (phone && !orderInfo.phone) setOrderInfo((p) => ({ ...p, phone }));
            setShowClientPicker(false);
            notify('Клиент привязан: ' + name);
          }}
        />
      )}
    </div>
  );
}