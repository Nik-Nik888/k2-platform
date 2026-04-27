import type { ModuleScope } from '../api/referenceApi';
import { SCOPE_LABELS } from '../api/referenceApi';
import { Calculator, PanelTop, Layers } from 'lucide-react';

const SCOPE_ICONS: Record<ModuleScope, typeof Calculator> = {
  calc: Calculator,
  glazing: PanelTop,
  both: Layers,
};

const SCOPE_ORDER: ModuleScope[] = ['calc', 'glazing', 'both'];

interface ScopeTabsProps {
  active: ModuleScope;
  onChange: (scope: ModuleScope) => void;
  counts?: Partial<Record<ModuleScope, number>>;
}

export function ScopeTabs({ active, onChange, counts }: ScopeTabsProps) {
  return (
    <div className="flex gap-1 p-1 bg-surface-100 rounded-xl">
      {SCOPE_ORDER.map((scope) => {
        const Icon = SCOPE_ICONS[scope];
        const isActive = active === scope;
        const count = counts?.[scope];

        return (
          <button
            key={scope}
            onClick={() => onChange(scope)}
            className={`
              flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg
              text-sm font-medium transition-all duration-150
              ${isActive
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }
            `}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{SCOPE_LABELS[scope]}</span>
            {typeof count === 'number' && (
              <span className={`
                ml-1 text-xs px-1.5 py-0.5 rounded-full
                ${isActive ? 'bg-brand-100 text-brand-700' : 'bg-surface-200 text-gray-500'}
              `}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
