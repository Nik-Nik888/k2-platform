import { X, Plus } from 'lucide-react';
import { useCalcStore } from '@store/calcStore';
import { CALC_MODE_LABELS, parseDims } from '@modules/calculator/api/calcApi';
import type { Category, OptionMaterial } from '@modules/calculator/api/calcApi';
import { NI } from '../primitives';
import { MatRow } from '../MatRow';

// Массив окон с индивидуальными размерами + суммарный расчёт скрытых
export function WindowsBlock({ tabId, cat, mats }: {
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
