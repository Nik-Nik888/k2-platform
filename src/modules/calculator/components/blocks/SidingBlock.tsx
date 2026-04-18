import { useCalcStore } from '@store/calcStore';
import { calcMatQty } from '@modules/calculator/api/calcApi';
import type { OptionMaterial } from '@modules/calculator/api/calcApi';
import { NI, DirToggle } from '../primitives';

// Сайдинг с размерами и направлением укладки
export function SidingBlock({ tabId, visibleMats, sidingDims, sidingDir }: {
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
