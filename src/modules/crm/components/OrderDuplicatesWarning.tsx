import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, X as CloseIcon } from 'lucide-react';
import type { Order } from '@shared/types';
import {
  fetchOtherActiveOrdersOfClient,
  mergeOrders,
  setIgnoreDuplicates,
} from '../api/crmApi';

const STAGE_LABELS: Record<string, string> = {
  lead: 'Заявка',
  measuring: 'Замер',
  calculating: 'Расчёт',
  approval: 'Согласование',
  contract: 'Договор',
  production: 'Производство',
  mounting: 'Монтаж',
  completed: 'Завершён',
};

interface Props {
  order: Order;
  onMergedInto: (targetId: string) => void; // после слияния — перейти на target
  onRefresh: () => void; // перечитать данные CRM
}

export default function OrderDuplicatesWarning({ order, onMergedInto, onRefresh }: Props) {
  const [duplicates, setDuplicates] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Не показываем если флаг проставлен
  const hidden = order.ignore_duplicates === true;

  useEffect(() => {
    if (hidden) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchOtherActiveOrdersOfClient(order.client_id, order.id).then((data) => {
      if (!cancelled) {
        setDuplicates(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [order.id, order.client_id, hidden]);

  if (hidden || loading || duplicates.length === 0) return null;

  async function handleMergeInto(targetId: string) {
    if (!confirm('Заметки текущего заказа будут добавлены в выбранный, а текущий — удалён. Продолжить?')) {
      return;
    }
    setBusy(true);
    const ok = await mergeOrders(order.id, targetId);
    setBusy(false);
    if (ok) {
      onRefresh();
      onMergedInto(targetId);
    } else {
      alert('Не удалось объединить. Попробуйте ещё раз.');
    }
  }

  async function handleDismiss() {
    setBusy(true);
    const ok = await setIgnoreDuplicates(order.id, true);
    setBusy(false);
    if (ok) {
      onRefresh();
    }
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-amber-900 text-sm">
            У клиента ещё {duplicates.length}{' '}
            {duplicates.length === 1 ? 'активный заказ' : 'активных заказа'}
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            Возможно, это дубль. Объедините в один или оставьте отдельно.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          disabled={busy}
          title="Больше не напоминать"
          className="text-amber-700 hover:bg-amber-100 rounded p-1 disabled:opacity-50"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        {duplicates.map((dup) => (
          <div
            key={dup.id}
            className="bg-white rounded-lg p-3 flex items-center justify-between gap-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {STAGE_LABELS[dup.status] ?? dup.status}
                {dup.total_cost ? ` · ${dup.total_cost.toLocaleString('ru')} ₽` : ''}
              </p>
              <p className="text-xs text-gray-500 truncate">
                от {new Date(dup.created_at).toLocaleDateString('ru')}
                {dup.notes ? ` · ${dup.notes}` : ''}
              </p>
            </div>
            <button
              onClick={() => handleMergeInto(dup.id)}
              disabled={busy}
              className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-1"
            >
              Объединить <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
