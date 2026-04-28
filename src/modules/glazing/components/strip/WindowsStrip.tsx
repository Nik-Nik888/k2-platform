import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { GlazingProject } from '../../types';
import { ProjectThumbnail } from './ProjectThumbnail';
import { calcProjectMetrics } from '../../api/doGlazing';

// ═══════════════════════════════════════════════════════════════════
// WindowsStrip — горизонтальная лента проектов в одном CRM-заказе.
//
// Как PVC Studio: каждое окно (балкон / кухня / зал) — отдельная карточка
// с превью, нумерацией и размерами. Активная карточка подсвечена.
//
// Управление:
//   • Тап на карточку → активировать проект (показать в канвасе)
//   • Тап на × в углу карточки (на ховере / длинный тап) → удалить
//   • Тап на «+» в начале → открыть NewProjectPopup (создание нового)
//
// При множестве проектов лента прокручивается горизонтально.
// ═══════════════════════════════════════════════════════════════════

interface WindowsStripProps {
  projects: GlazingProject[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onAddProject: () => void;            // открыть NewProjectPopup
  onDeleteProject: (projectId: string) => void;
}

export function WindowsStrip({
  projects, activeProjectId, onSelectProject, onAddProject, onDeleteProject,
}: WindowsStripProps) {
  return (
    <div className="card p-2 overflow-hidden">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {/* Кнопка «+ добавить проект» */}
        <button
          onClick={onAddProject}
          className="flex-shrink-0 w-32 h-24 rounded-xl border-2 border-dashed border-brand-300
                     hover:border-brand-500 hover:bg-brand-50 flex flex-col items-center
                     justify-center gap-1 text-brand-600 transition-all"
          title="Добавить новое окно проекта"
        >
          <Plus className="w-7 h-7" />
          <span className="text-xs font-semibold">Добавить</span>
        </button>

        {/* Карточки проектов */}
        {projects.map((project, idx) => (
          <ProjectCard
            key={project.id}
            project={project}
            index={projects.length - idx}
            isActive={project.id === activeProjectId}
            canDelete={projects.length > 1}
            onClick={() => onSelectProject(project.id)}
            onDelete={() => onDeleteProject(project.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Карточка одного проекта ───────────────────────────────────────

interface ProjectCardProps {
  project: GlazingProject;
  index: number;
  isActive: boolean;
  canDelete: boolean;
  onClick: () => void;
  onDelete: () => void;
}

function ProjectCard({ project, index, isActive, canDelete, onClick, onDelete }: ProjectCardProps) {
  const [hover, setHover] = useState(false);

  // Размеры для подписи под карточкой
  const metrics = calcProjectMetrics(project);
  const sizeText = metrics.areaM2 > 0 ? `${metrics.areaM2} м²` : '—';

  return (
    <div
      className="flex-shrink-0 relative group"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Сама карточка */}
      <button
        onClick={onClick}
        className={`w-32 h-24 rounded-xl border-2 overflow-hidden flex flex-col items-stretch
                   transition-all ${
          isActive
            ? 'border-pink-500 bg-pink-50 shadow-md'
            : 'border-surface-200 bg-white hover:border-brand-300 hover:shadow-sm'
        }`}
      >
        {/* Верхняя часть — превью */}
        <div className="flex-1 flex items-center justify-center p-1.5 min-h-0">
          <ProjectThumbnail project={project} width={108} height={50} />
        </div>
        {/* Нижняя — название + размер */}
        <div className={`px-1.5 py-1 text-[11px] leading-tight border-t ${
          isActive ? 'border-pink-300 bg-pink-100' : 'border-surface-200 bg-surface-50'
        }`}>
          <div className="font-semibold truncate">{index}. {project.name}</div>
          <div className="text-gray-500 text-[10px]">{sizeText}</div>
        </div>
      </button>

      {/* Кнопка удаления (показывается на ховере) */}
      {canDelete && hover && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Удалить проект «${project.name}»?`)) {
              onDelete();
            }
          }}
          className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500
                     text-white flex items-center justify-center shadow-md hover:bg-red-600"
          title="Удалить проект"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
