import { useMemo } from 'react';
import { X, Plus } from 'lucide-react';
import { useCalcStore } from '@store/calcStore';
import type { FurnitureItem } from '@store/calcStore';
import type { CalcDB } from '@modules/calculator/api/calcApi';
import { Sel } from '../primitives';

// Мебель — несколько позиций, каждая с независимым выбором по категориям
export function FurnitureBlock({ tabId, db }: { tabId: string; db: CalcDB }) {
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
