import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  CONSTRUCTION_TYPE_LABELS,
} from '../../data/templates';
import type { ConstructionType } from '../../api/glazingTemplatesApi';

// ═══════════════════════════════════════════════════════════════════
// SaveTemplatePopup — попап «Сохранить как шаблон».
//
// Открывается по кнопке «+ Шаблон» в тулбаре. Сохраняет геометрию
// текущего проекта (рамы, импосты, ячейки, кости, углы) в Supabase.
// Без config — он настраивается отдельно для каждого заказа.
//
// Поля:
//   • Название (по умолчанию = название текущего проекта)
//   • Тип конструкции (по умолчанию = тип текущего проекта)
// ═══════════════════════════════════════════════════════════════════

interface SaveTemplatePopupProps {
  /** Дефолтное имя — обычно имя текущего проекта. */
  defaultName: string;
  /** Дефолтный тип — обычно тип текущего проекта. */
  defaultType: ConstructionType;
  onClose: () => void;
  /** Колбэк сохранения. После успеха попап закроется. */
  onSave: (name: string, constructionType: ConstructionType) => Promise<void>;
}

const CONSTRUCTION_TYPES: ConstructionType[] = [
  'window', 'balcony', 'balcony_block', 'loggia',
];

export function SaveTemplatePopup({
  defaultName, defaultType, onClose, onSave,
}: SaveTemplatePopupProps) {
  const [name, setName] = useState(defaultName);
  const [type, setType] = useState<ConstructionType>(defaultType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSave = name.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim(), type);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить шаблон');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl flex flex-col">
        {/* Шапка */}
        <div className="flex justify-between items-start p-5 pb-3 border-b border-surface-200">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Сохранить как шаблон</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Геометрия текущего проекта будет доступна для применения к новым заказам
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Содержимое */}
        <div className="p-5 flex-1">
          <label className="block mb-4">
            <span className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">
              Название шаблона
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Балкон 4 створки"
              className="input w-full"
              autoFocus
            />
          </label>

          <div>
            <span className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">
              Тип конструкции
            </span>
            <div className="grid grid-cols-2 gap-2">
              {CONSTRUCTION_TYPES.map((t) => {
                const active = type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                      active
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-surface-200 hover:border-brand-300 text-gray-700'
                    }`}
                  >
                    {CONSTRUCTION_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-surface-200 p-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Сохранение…' : 'Сохранить шаблон'}
          </button>
        </div>
      </div>
    </div>
  );
}
