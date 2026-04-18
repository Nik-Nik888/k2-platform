import { useMemo, useState } from 'react';
import { ArrowLeft, Save, Printer, Loader2 } from 'lucide-react';
import { TABS } from '@modules/calculator/api/calcApi';
import { mergeResults } from '@modules/calculator/api/doCalc';
import type { CalcResults } from '@modules/calculator/api/doCalc';

// Экран результатов расчёта: разбивка по секциям + сводная ведомость,
// кнопки экспорта и сохранения.
export function ResultsView({ results, onBack, onExportPDF, onSave, saving }: {
  results: CalcResults;
  orderInfo: { order_number: string; address: string; phone: string };
  onBack: () => void;
  onExportPDF: (view: 'sections' | 'merged') => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [view, setView] = useState<'sections' | 'merged'>('sections');
  const merged = useMemo(() => mergeResults(results), [results]);
  const grandTotal = useMemo(() =>
    Object.values(results).flat().reduce((s, r) => s + (r.cost || 0), 0),
    [results]
  );

  return (
    <div className="space-y-4">
      {/* Итого */}
      <div className="card p-5 bg-emerald-50 border-emerald-200">
        <div className="flex justify-between items-center">
          <span className="text-sm text-emerald-700 font-medium">Общая стоимость</span>
          <span className="text-2xl font-bold font-mono text-emerald-700">
            {grandTotal.toLocaleString('ru')} ₽
          </span>
        </div>
      </div>

      {/* Переключатель вида */}
      <div className="flex gap-2">
        <button onClick={() => setView('sections')}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            view === 'sections' ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium' : 'border-surface-200 text-gray-500'
          }`}>По секциям</button>
        <button onClick={() => setView('merged')}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            view === 'merged' ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium' : 'border-surface-200 text-gray-500'
          }`}>Сводная</button>
      </div>

      {/* По секциям */}
      {view === 'sections' && TABS.map((tab) => {
        const tabItems = results[tab.id];
        if (!tabItems || tabItems.length === 0) return null;
        const tabTotal = tabItems.reduce((s, r) => s + (r.cost || 0), 0);
        return (
          <div key={tab.id} className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-surface-50 border-b border-surface-200">
              <div className="flex items-center gap-2">
                <span className="text-lg">{tab.icon}</span>
                <span className="text-sm font-bold text-gray-800">{tab.label}</span>
                <span className="text-xs text-gray-400">({tabItems.filter((i) => !i.isInfo).length})</span>
              </div>
              {tabTotal > 0 && (
                <span className="font-mono text-sm font-bold text-emerald-600">
                  {tabTotal.toLocaleString('ru')}₽
                </span>
              )}
            </div>
            <div className="divide-y divide-surface-100">
              {tabItems.map((it, i) => (
                it.isInfo ? (
                  <div key={i} className="px-4 py-2 bg-brand-50 text-xs font-semibold text-brand-700">
                    📌 {it.name}
                  </div>
                ) : (
                  <div key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
                    {it.auto && <span className="text-[10px] text-amber-500">🔒</span>}
                    <span className="flex-1 text-gray-700">{it.name}</span>
                    <span className="font-mono text-xs text-gray-500">{Math.round(it.qty * 100) / 100}</span>
                    <span className="text-[10px] text-gray-400 w-8">{it.unit}</span>
                    <span className="font-mono text-xs text-gray-400 w-14 text-right">
                      {it.price ? it.price + '₽' : '—'}
                    </span>
                    <span className="font-mono text-xs font-bold text-emerald-600 w-20 text-right">
                      {it.cost ? it.cost.toLocaleString('ru') + '₽' : '—'}
                    </span>
                  </div>
                )
              ))}
            </div>
          </div>
        );
      })}

      {/* Сводная */}
      {view === 'merged' && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 bg-surface-50 border-b border-surface-200">
            <span className="text-sm font-bold text-gray-800">Сводная ведомость (объединённая)</span>
          </div>
          <div className="divide-y divide-surface-100">
            {merged.filter((it) => !it.isInfo).map((it, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="text-xs text-gray-400 w-6 font-mono">{i + 1}</span>
                <span className="flex-1 text-gray-700">{it.name}</span>
                <span className="font-mono text-xs text-gray-500">{Math.round(it.qty * 100) / 100}</span>
                <span className="text-[10px] text-gray-400 w-8">{it.unit}</span>
                <span className="font-mono text-xs text-gray-400 w-14 text-right">
                  {it.price ? it.price + '₽' : '—'}
                </span>
                <span className="font-mono text-xs font-bold text-emerald-600 w-20 text-right">
                  {it.cost ? Math.round(it.cost).toLocaleString('ru') + '₽' : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Кнопки */}
      <div className="flex gap-3">
        <button onClick={onSave} disabled={saving}
          className="btn-primary flex-1 py-3">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Сохраняю...' : 'Сохранить заказ'}
        </button>
        <button onClick={() => onExportPDF(view)} className="btn-secondary flex-1 py-3">
          <Printer className="w-4 h-4" /> PDF / Печать
        </button>
      </div>
      <button onClick={onBack} className="btn-secondary w-full py-3">
        <ArrowLeft className="w-4 h-4" /> К редактированию
      </button>
    </div>
  );
}
