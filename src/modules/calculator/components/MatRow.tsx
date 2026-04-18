import type { OptionMaterial } from '@modules/calculator/api/calcApi';

export function MatRow({ om, qty, hint, modeLabel, isHidden, isRemoved, onQtyChange, onToggleRemove }: {
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
