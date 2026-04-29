import { useState, useEffect, useMemo } from 'react';
import { X, Trash2 } from 'lucide-react';
import {
  CONSTRUCTION_TYPE_LABELS,
} from '../../data/templates';
import type { ConstructionType, UserTemplate } from '../../api/glazingTemplatesApi';
import { ProjectThumbnail } from '../strip/ProjectThumbnail';
import type { GlazingProject } from '../../types';
import { emptyProjectConfig } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// NewProjectPopup — попап создания нового проекта остекления.
//
// Шаги:
//   1. Ввод названия
//   2. Выбор типа конструкции (4 категории) — фильтрует список шаблонов
//   3a. Выбор пользовательского шаблона из сетки (если есть)
//   3b. ИЛИ кнопка «Создать пустой проект» (если шаблонов нет / не выбран)
//
// Стандартные шаблоны убраны — есть только пользовательские, которые
// сохранены через кнопку «+ Шаблон» в тулбаре.
// ═══════════════════════════════════════════════════════════════════

interface NewProjectPopupProps {
  suggestedName?: string;
  /** Список пользовательских шаблонов (загружается из Supabase). */
  userTemplates: UserTemplate[];
  onClose: () => void;
  /** Создать пустой проект указанного типа. */
  onCreateEmpty: (constructionType: ConstructionType, projectName: string) => void;
  /** Создать проект из пользовательского шаблона. */
  onCreateFromTemplate: (templateId: string, projectName: string) => void;
  /** Удалить пользовательский шаблон. */
  onDeleteTemplate: (templateId: string) => Promise<void>;
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
  suggestedName, userTemplates, onClose,
  onCreateEmpty, onCreateFromTemplate, onDeleteTemplate,
}: NewProjectPopupProps) {
  const [type, setType] = useState<ConstructionType>('balcony');
  const [name, setName] = useState(suggestedName ?? DEFAULT_NAMES.balcony);
  const [nameTouched, setNameTouched] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // При смене типа сбрасываем выбор шаблона
  useEffect(() => {
    setSelectedTemplateId(null);
  }, [type]);

  // Дефолтное имя обновляется под тип, если пользователь не правил
  useEffect(() => {
    if (!nameTouched && !suggestedName) {
      setName(DEFAULT_NAMES[type]);
    }
  }, [type, nameTouched, suggestedName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filteredTemplates = useMemo(
    () => userTemplates.filter((t) => t.constructionType === type),
    [userTemplates, type]
  );

  const canCreate = name.trim().length > 0;

  function handleCreate() {
    if (!canCreate) return;
    if (selectedTemplateId) {
      onCreateFromTemplate(selectedTemplateId, name.trim());
    } else {
      onCreateEmpty(type, name.trim());
    }
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
              Введите название, выберите тип и опционально шаблон
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Содержимое */}
        <div className="overflow-y-auto p-5 flex-1">
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

          {/* Сетка пользовательских шаблонов или сообщение "пусто" */}
          <div className="mb-2">
            <span className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">
              Шаблон ({filteredTemplates.length})
            </span>
            {filteredTemplates.length === 0 ? (
              <div className="text-sm text-gray-500 italic py-6 text-center bg-surface-50 rounded-xl">
                Шаблонов для этого типа пока нет.<br/>
                Постройте конструкцию вручную и сохраните как шаблон через кнопку «+ Шаблон».
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredTemplates.map((tpl) => (
                  <UserTemplateCard
                    key={tpl.id}
                    template={tpl}
                    isActive={selectedTemplateId === tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    onDelete={async () => {
                      if (confirm(`Удалить шаблон «${tpl.name}»?`)) {
                        await onDeleteTemplate(tpl.id);
                        if (selectedTemplateId === tpl.id) setSelectedTemplateId(null);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Подвал */}
        <div className="border-t border-surface-200 p-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">
            Отмена
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selectedTemplateId
              ? 'Создать из шаблона'
              : 'Создать пустой проект'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Карточка пользовательского шаблона с кнопкой удаления ────────

function UserTemplateCard({ template, isActive, onClick, onDelete }: {
  template: UserTemplate;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => Promise<void>;
}) {
  const [hover, setHover] = useState(false);

  // Преобразуем геометрию шаблона в "виртуальный" GlazingProject для превью
  const previewProject: GlazingProject = useMemo(() => ({
    id: 'preview',
    name: template.name,
    constructionType: template.constructionType,
    segments: template.geometry.segments,
    corners: template.geometry.corners,
    config: emptyProjectConfig(),
  }), [template]);

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={onClick}
        className={`w-full p-3 rounded-xl border-2 flex flex-col items-stretch gap-2 transition-all text-left ${
          isActive
            ? 'border-brand-500 bg-brand-50 shadow-sm'
            : 'border-surface-200 hover:border-brand-300 bg-white'
        }`}
      >
        <div className="flex items-center justify-center bg-surface-50 rounded-lg p-2 h-20">
          <ProjectThumbnail project={previewProject} width={140} height={64} />
        </div>
        <div>
          <div className={`text-sm font-semibold truncate ${isActive ? 'text-brand-700' : 'text-gray-800'}`}>
            {template.name}
          </div>
          <div className="text-[11px] text-gray-500 leading-tight mt-0.5">
            {template.geometry.segments.length} сегмент(ов)
          </div>
        </div>
      </button>

      {/* Кнопка удаления (на ховере) */}
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-red-500
                     text-white flex items-center justify-center shadow-md hover:bg-red-600"
          title="Удалить шаблон"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
