// Общие UI-примитивы калькулятора
// Используются во всех вкладках и блоках

export function NI({ label, value, onChange, unit }: {
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

export function Sel({ label, value, onChange, options }: {
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

export function DirToggle({ dir, onDir }: { dir: string; onDir: (d: string) => void }) {
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

export function DimsInfo({ hMm, wMm, label }: { hMm: number; wMm: number; label?: string }) {
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
