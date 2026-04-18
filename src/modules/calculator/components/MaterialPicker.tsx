import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Package } from 'lucide-react';
import type { Material } from '@modules/calculator/api/calcApi';

// MaterialPicker — combobox для выбора материала из справочника.
// Заменяет "поиск + select" на один поиск с выпадающим списком.
//
// Поведение:
// - Если материал не выбран (value === null) → показывается поле поиска.
//   Пользователь печатает — снизу выпадает отфильтрованный список (макс 20),
//   клик по пункту — выбрано.
// - Если материал выбран → показывается его название и кнопка ✕ для сброса.
// - Фильтрация: по вхождению текста (регистр не важен) в name, sku, unit.
// - Esc закрывает список.
// - Клик вне компонента — закрывает список.
export function MaterialPicker({
  materials, value, onChange, placeholder = 'Поиск материала по названию или артикулу...',
}: {
  materials: Material[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = value ? materials.find((m) => m.id === value) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials.slice(0, 20);
    return materials
      .filter((m) => {
        const name = m.name.toLowerCase();
        const sku = (m.sku || '').toLowerCase();
        const unit = (m.unit || '').toLowerCase();
        return name.includes(q) || sku.includes(q) || unit.includes(q);
      })
      .slice(0, 20);
  }, [materials, query]);

  // Сброс индекса подсветки при смене запроса
  useEffect(() => {
    setHoverIdx(0);
  }, [query]);

  // Клик вне — закрываем
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setQuery('');
    setOpen(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHoverIdx((i) => Math.min(i + 1, filtered.length - 1));
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHoverIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && filtered[hoverIdx]) {
      e.preventDefault();
      pick(filtered[hoverIdx].id);
    }
  };

  // Состояние "выбрано" — показываем чип с крестиком.
  if (selected) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg">
        <Package className="w-4 h-4 text-brand-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-brand-800 truncate">{selected.name}</div>
          <div className="text-[11px] text-brand-600">
            {selected.unit}{selected.price > 0 ? ` · ${selected.price}₽` : ''}{selected.sku ? ` · ${selected.sku}` : ''}
          </div>
        </div>
        <button onClick={() => onChange(null)}
          className="text-gray-400 hover:text-red-500 p-1 rounded"
          title="Сбросить выбор">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Состояние "не выбрано" — поле поиска с выпадающим списком
  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        className="input text-sm"
        placeholder={placeholder}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        autoFocus
      />

      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-surface-200 rounded-lg shadow-lg max-h-72 overflow-y-auto z-10">
          {filtered.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(m.id)}
              onMouseEnter={() => setHoverIdx(i)}
              className={`w-full text-left px-3 py-2 transition-colors border-b border-surface-100 last:border-b-0 ${
                i === hoverIdx ? 'bg-brand-50' : 'hover:bg-surface-50'
              }`}>
              <div className="text-sm font-medium text-gray-800 truncate">{m.name}</div>
              <div className="text-[11px] text-gray-500">
                {m.unit}{m.price > 0 ? ` · ${m.price}₽` : ''}{m.sku ? ` · ${m.sku}` : ''}
              </div>
            </button>
          ))}
          {query && materials.length > filtered.length && (
            <div className="px-3 py-1.5 text-[11px] text-gray-400 bg-surface-50">
              Показано {filtered.length} из {materials.filter((m) => {
                const q = query.trim().toLowerCase();
                return m.name.toLowerCase().includes(q) || (m.sku || '').toLowerCase().includes(q);
              }).length} совпадений
            </div>
          )}
        </div>
      )}

      {open && filtered.length === 0 && query.trim() && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-surface-200 rounded-lg shadow-lg p-4 z-10 text-center text-sm text-gray-400">
          Ничего не найдено по «{query}»
        </div>
      )}
    </div>
  );
}
