import { useCalcStore } from '@store/calcStore';
import { CALC_MODE_LABELS, parseDims } from '@modules/calculator/api/calcApi';
import type { Category, OptionMaterial } from '@modules/calculator/api/calcApi';
import { NI } from '../primitives';
import { MatRow } from '../MatRow';

// Замена балконного блока (Дверь + Окно)
export function BBBlock({ tabId, cat, mats }: {
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
