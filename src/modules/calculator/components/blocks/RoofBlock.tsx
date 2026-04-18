import { useCalcStore } from '@store/calcStore';
import { CALC_MODE_LABELS, calcMatQty, parseDims } from '@modules/calculator/api/calcApi';
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
