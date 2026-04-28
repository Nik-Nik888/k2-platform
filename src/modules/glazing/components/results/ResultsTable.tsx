import type { GlazingFormData, ProjectMetrics } from '../../types';
import { calcProjectMetrics } from '../../api/doGlazing';

// ═══════════════════════════════════════════════════════════════════
// ResultsTable — таблица сметы в формате PVC Studio v44.4 (фото 1, 2).
//
// Структура (4 строки):
//   • окно — метрики и стоимость текущего активного окна
//   • цена — стоимость единицы (сумма строк сметы / quantity)
//   • все окна — агрегат всех окон проекта (сумма метрик)
//   • стоимость — общая стоимость всех окон
//
// Столбцы: позиция / площадь / рамы / импосты / штапики / уплотн. /
//          створки / двер.створки / стёкла / сэнд / всего
//
// Двер.створки и сэнд показываются как «–» (Этап 5 — двери и сэндвич-панели).
// ═══════════════════════════════════════════════════════════════════

interface ResultsTableProps {
  data: GlazingFormData;
  /** Итоги расчёта (если посчитаны) для столбца "всего ₽". */
  projectTotals?: Record<string, number>;
  /** Активный проект — для колонок «окно» / «цена». */
  activeProjectId: string | null;
}

export function ResultsTable({ data, projectTotals = {}, activeProjectId }: ResultsTableProps) {
  // Метрики текущего активного окна
  const active = data.projects.find((p) => p.id === activeProjectId);
  const activeMetrics = active ? calcProjectMetrics(active) : zeroMetrics();
  const activeTotal = active ? (projectTotals[active.id] ?? 0) : 0;
  const activeQty = active?.config.quantity ?? 1;
  const activePerUnit = activeQty > 0 ? activeTotal / activeQty : 0;

  // Агрегат всех окон (сумма метрик с учётом quantity)
  const allMetrics = aggregateMetrics(data);
  const allTotal = data.projects.reduce(
    (acc, p) => acc + (projectTotals[p.id] ?? 0),
    0
  );
  // Скидка/наценка от customPrice — пока выводим 0% (без сложной логики)
  const discountText = '0.00 (-0%)';

  return (
    <div className="card p-2 overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="text-gray-500 border-b border-surface-200">
            <th className="text-left font-semibold pb-1 px-1.5">позиция</th>
            <th className="text-right font-semibold pb-1 px-1.5">площадь</th>
            <th className="text-right font-semibold pb-1 px-1.5">рамы</th>
            <th className="text-right font-semibold pb-1 px-1.5">импосты</th>
            <th className="text-right font-semibold pb-1 px-1.5">штапики</th>
            <th className="text-right font-semibold pb-1 px-1.5">уплотн.</th>
            <th className="text-right font-semibold pb-1 px-1.5">створки</th>
            <th className="text-right font-semibold pb-1 px-1.5">двер.створки</th>
            <th className="text-right font-semibold pb-1 px-1.5">стёкла</th>
            <th className="text-right font-semibold pb-1 px-1.5">сэнд</th>
            <th className="text-right font-bold pb-1 px-1.5 text-red-600">всего</th>
          </tr>
        </thead>
        <tbody>
          {/* Окно — текущее активное */}
          <tr>
            <td className="text-blue-700 px-1.5 py-1">окно</td>
            <td className="text-right px-1.5 py-1">{fmtArea(activeMetrics.areaM2)}</td>
            <td className="text-right px-1.5 py-1">{fmtMeters(activeMetrics.framesPerimeterM)}</td>
            <td className="text-right px-1.5 py-1">{fmtMeters(activeMetrics.impostsM)}</td>
            <td className="text-right px-1.5 py-1">{fmtMeters(activeMetrics.beadingM)}</td>
            <td className="text-right px-1.5 py-1">{fmtMeters(activeMetrics.sealM)}</td>
            <td className="text-right px-1.5 py-1">{fmtMeters(activeMetrics.framesPerimeterM * 0.6)}</td>
            <td className="text-right px-1.5 py-1 text-gray-400">–</td>
            <td className="text-right px-1.5 py-1">{fmtArea(activeMetrics.glassAreaM2)}</td>
            <td className="text-right px-1.5 py-1 text-gray-400">–</td>
            <td className="text-right px-1.5 py-1 text-blue-700 font-bold">{fmtMoney(activePerUnit)}</td>
          </tr>
          {/* Цена */}
          <tr className="border-t border-surface-100">
            <td className="text-pink-600 px-1.5 py-1">цена</td>
            <td colSpan={9} />
            <td className="text-right px-1.5 py-1 text-blue-700">▸ {discountText}</td>
          </tr>
          {/* Все окна — агрегат */}
          <tr className="border-t border-surface-200">
            <td className="text-blue-700 px-1.5 py-1">все окна</td>
            <td className="text-right px-1.5 py-1">{fmtArea(allMetrics.areaM2)}</td>
            <td className="text-right px-1.5 py-1">{fmtMeters(allMetrics.framesPerimeterM)}</td>
            <td className="text-right px-1.5 py-1">{fmtMeters(allMetrics.impostsM)}</td>
            <td className="text-right px-1.5 py-1">{fmtMeters(allMetrics.beadingM)}</td>
            <td className="text-right px-1.5 py-1">{fmtMeters(allMetrics.sealM)}</td>
            <td className="text-right px-1.5 py-1">{fmtMeters(allMetrics.framesPerimeterM * 0.6)}</td>
            <td className="text-right px-1.5 py-1 text-gray-400">–</td>
            <td className="text-right px-1.5 py-1">{fmtArea(allMetrics.glassAreaM2)}</td>
            <td className="text-right px-1.5 py-1 text-gray-400">–</td>
            <td className="text-right px-1.5 py-1 text-red-600 font-bold">{fmtMoney(allTotal)}</td>
          </tr>
          {/* Стоимость */}
          <tr className="border-t border-surface-100">
            <td className="text-pink-600 px-1.5 py-1">стоимость</td>
            <td colSpan={9} />
            <td className="text-right px-1.5 py-1 text-blue-700">{discountText}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Хелперы форматирования и агрегации ────────────────────────────

function fmtArea(m2: number): string {
  if (m2 === 0) return '–';
  return `${m2.toFixed(2)} m²`;
}

function fmtMeters(m: number): string {
  if (m === 0) return '–';
  return `${m.toFixed(2)} m`;
}

function fmtMoney(rub: number): string {
  if (rub === 0) return '0 руб';
  return `${Math.round(rub).toLocaleString('ru-RU')} руб`;
}

function zeroMetrics(): ProjectMetrics {
  return {
    areaM2: 0,
    framesPerimeterM: 0,
    impostsM: 0,
    beadingM: 0,
    sealM: 0,
    sashCount: 0,
    doorSashCount: 0,
    glassAreaM2: 0,
    sandwichAreaM2: 0,
  };
}

function aggregateMetrics(data: GlazingFormData): ProjectMetrics {
  const acc = zeroMetrics();
  for (const p of data.projects) {
    const qty = p.config.quantity || 1;
    const m = calcProjectMetrics(p);
    acc.areaM2 += m.areaM2 * qty;
    acc.framesPerimeterM += m.framesPerimeterM * qty;
    acc.impostsM += m.impostsM * qty;
    acc.beadingM += m.beadingM * qty;
    acc.sealM += m.sealM * qty;
    acc.sashCount += m.sashCount * qty;
    acc.doorSashCount += m.doorSashCount * qty;
    acc.glassAreaM2 += m.glassAreaM2 * qty;
    acc.sandwichAreaM2 += m.sandwichAreaM2 * qty;
  }
  // Округлим итог
  return {
    areaM2: round2(acc.areaM2),
    framesPerimeterM: round2(acc.framesPerimeterM),
    impostsM: round2(acc.impostsM),
    beadingM: round2(acc.beadingM),
    sealM: round2(acc.sealM),
    sashCount: acc.sashCount,
    doorSashCount: acc.doorSashCount,
    glassAreaM2: round2(acc.glassAreaM2),
    sandwichAreaM2: round2(acc.sandwichAreaM2),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
