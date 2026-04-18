import { useCalcStore } from '@store/calcStore';
import { CALC_MODE_LABELS, calcByMode, calcMatQty } from '@modules/calculator/api/calcApi';
import type { Category, OptionMaterial } from '@modules/calculator/api/calcApi';
import { NI } from '../primitives';
import { MatRow } from '../MatRow';

// Крыша: размеры, чистовые материалы + скрытые с несколькими режимами расчёта
export function RoofBlock({ tabId, cat, visibleMats, hiddenMats }: {
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
              // Универсальный расчёт через calcByMode — поддерживает все режимы
              // включая step_whole, step_cross, step_whole_cross
              const r = calcByMode(base, mode, om.materials, rd.height, rd.length, 'horizontal');
              const uq = getQty(tabId, cat.id, om.material_id);
              const q = uq !== undefined ? uq : r.qty;

              return (
                <MatRow key={om.id} om={om} qty={q} hint={r.hint} modeLabel={CALC_MODE_LABELS[mode] || ''}
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
