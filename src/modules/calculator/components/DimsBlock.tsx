import { useCalcStore } from '@store/calcStore';
import { NI } from './primitives';

// Блок размеров (для остекления: рама, балконный блок, крыша и пр.)
export function DimsBlock({ label, tabId, dimsKey }: {
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
