// Общие UI-примитивы калькулятора
// Используются во всех вкладках и блоках

import { useState, useEffect, useRef } from 'react';

// NI — числовой инпут с локальным строковым буфером.
// Решает проблему "остающегося 0 впереди" при вводе: браузер не может
// клеить старое значение к новому, потому что value привязано к строке,
// а не к числу.
export function NI({ label, value, onChange, unit }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => (value ? String(value) : ''));

  // Если value меняется снаружи (подсказка "Подставить X", загрузка заказа),
  // подтягиваем буфер — но только пока инпут не в фокусе, чтобы не перебить
  // пользовательский ввод.
  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    const external = value ? String(value) : '';
    if (external !== text) setText(external);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setText(v);
    if (v === '') {
      onChange(0);
    } else {
      const n = Number(v);
      if (!Number.isNaN(n) && n >= 0) onChange(n);
    }
  };

  // При уходе фокуса нормализуем ведущие нули / лишние символы.
  const handleBlur = () => {
    if (text === '') return;
    const n = Number(text);
    if (!Number.isNaN(n) && n >= 0) {
      setText(String(n));
      onChange(n);
    } else {
      setText(value ? String(value) : '');
    }
  };

  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block font-medium">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="number" min="0"
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={(e) => e.target.select()}
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

// NumberInput — универсальный числовой инпут без обвязки.
// Используется в модалках справочника, MaterialsPage и т.п.
// Та же логика что в NI: локальный строковый буфер избегает "0" впереди,
// фокус выделяет всё содержимое.
export function NumberInput({
  value, onChange, className, placeholder, allowFloat = false,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
  allowFloat?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => (value ? String(value) : ''));

  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    const external = value ? String(value) : '';
    if (external !== text) setText(external);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const parse = (s: string): number | null => {
    if (s === '') return 0;
    const n = allowFloat ? parseFloat(s) : Number(s);
    return Number.isNaN(n) || n < 0 ? null : n;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setText(v);
    const n = parse(v);
    if (n !== null) onChange(n);
  };

  const handleBlur = () => {
    if (text === '') return;
    const n = parse(text);
    if (n !== null) {
      setText(String(n));
      onChange(n);
    } else {
      setText(value ? String(value) : '');
    }
  };

  return (
    <input
      ref={inputRef}
      type="number" min="0"
      step={allowFloat ? 'any' : 1}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={(e) => e.target.select()}
      className={className || 'input text-sm'}
      placeholder={placeholder}
    />
  );
}
