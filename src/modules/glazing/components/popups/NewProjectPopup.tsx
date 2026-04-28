import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import {
  PROJECT_TEMPLATES, CONSTRUCTION_TYPE_LABELS,
  type ConstructionType, type ProjectTemplate,
} from '../../data/templates';
import { ProjectThumbnail } from '../strip/ProjectThumbnail';

// ═══════════════════════════════════════════════════════════════════
// NewProjectPopup — попап создания нового проекта остекления.
//
// Шаги:
//   1. Ввод названия (по умолчанию подставляется «Балкон» / «Окно» / ...)
//   2. Выбор типа конструкции (4 категории) — фильтрует список шаблонов
//   3. Выбор конкретного шаблона из сетки превью
//   4. Кнопка «Создать»
//
// Шаблоны определены в data/templates.ts. После применения шаблона
// пользователь может всё перенастроить вручную в канвасе.
// ═══════════════════════════════════════════════════════════════════

interface NewProjectPopupProps {
  /** Подсказываемое название (например «Балкон 2», если уже есть «Балкон 1»). */
  suggestedName?: string;
  onClose: () => void;
  onCreate: (templateId: string, projectName: string) => void;
}

const CONSTRUCTION_TYPES: ConstructionType[] = [
  'window', 'balcony', 'balcony_block', 'loggia',
];

const DEFAULT_NAMES: Record<ConstructionType, string> = {
  window:        'Окно',
  balcony:       'Балкон',
  balcony_block: 'Балконный блок',
  loggia:        'Лоджия',
};

export function NewProjectPopup({
  suggestedName, onClose, onCreate,
}: NewProjectPopupProps) {
  const [type, setType] = useState<ConstructionType>('balcony');
  const [name, setName] = useState(suggestedName ?? DEFAULT_NAMES.balcony);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Если поменяли тип конструкции — очищаем выбор шаблона
  useEffect(() => {
    setSelectedTemplateId(null);
  }, [type]);

  // Если пользователь не редактировал имя — обновляем дефолт под тип
  const [nameTouched, setNameTouched] = useState(false);
  useEffect(() => {
    if (!nameTouched && !suggestedName) {
      setName(DEFAULT_NAMES[type]);
    }
  }, [type, nameTouched, suggestedName]);

  // Esc → закрыть
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filteredTemplates = useMemo(
    () => PROJECT_TEMPLATES.filter((t) => t.constructionType === type),
    [type]
  );

  const canCreate = !!selectedTemplateId && name.trim().length > 0;

  function handleCreate() {
    if (!canCreate) return;
    onCreate(selectedTemplateId!, name.trim());
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
        {/* Шапка */}
        <div className="flex justify-between items-start p-5 pb-3 border-b border-surface-200">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Новый проект остекления</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Выберите тип конструкции и шаблон — потом всё можно изменить
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Содержимое (скроллится) */}
        <div className="overflow-y-auto p-5 flex-1">

          {/* Название */}
          <label className="block mb-4">
            <span className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">
              Название проекта
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
              placeholder="Например: Балкон 1"
              className="input w-full"
              autoFocus
            />
          </label>

          {/* Тип конструкции */}
          <div className="mb-4">
            <span className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">
              Тип конструкции
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

          {/* Шаблоны */}
          <div className="mb-2">
            <span className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">
              Шаблон ({filteredTemplates.length})
            </span>
            {filteredTemplates.length === 0 ? (
              <div className="text-sm text-gray-500 italic py-6 text-center bg-surface-50 rounded-xl">
                Шаблонов для этого типа пока нет. Можно создать пустой проект.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredTemplates.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    template={tpl}
                    isActive={selectedTemplateId === tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Подвал с кнопками */}
        <div className="border-t border-surface-200 p-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">
            Отмена
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Создать проект
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Карточка шаблона ──────────────────────────────────────────────

function TemplateCard({ template, isActive, onClick }: {
  template: ProjectTemplate; isActive: boolean; onClick: () => void;
}) {
  // Генерируем превью один раз — рендерим объект-шаблон через ProjectThumbnail.
  // build() — лёгкая операция, можно вызывать прямо в рендере.
  const sample = useMemo(() => template.build('preview'), [template]);

  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-xl border-2 flex flex-col items-stretch gap-2 transition-all text-left ${
        isActive
          ? 'border-brand-500 bg-brand-50 shadow-sm'
          : 'border-surface-200 hover:border-brand-300 bg-white'
      }`}
    >
      <div className="flex items-center justify-center bg-surface-50 rounded-lg p-2 h-20">
        <ProjectThumbnail project={sample} width={140} height={64} />
      </div>
      <div>
        <div className={`text-sm font-semibold ${isActive ? 'text-brand-700' : 'text-gray-800'}`}>
          {template.name}
        </div>
        <div className="text-[11px] text-gray-500 leading-tight mt-0.5">
          {template.description}
        </div>
      </div>
    </button>
  );
}
