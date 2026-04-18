import { useCalcStore } from '@store/calcStore';
import { CALC_MODE_LABELS, calcByMode } from '@modules/calculator/api/calcApi';
import type { OptionMaterial } from '@modules/calculator/api/calcApi';
import { MatRow } from './MatRow';

// Секция скрытых (авто-рассчитываемых) материалов с поддержкой всех calc_mode
export function HiddenMats({ mats, tabId, catId, hMm, wMm, direction }: {
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
