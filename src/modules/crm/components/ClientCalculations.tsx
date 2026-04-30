import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calculator as CalcIcon, Loader2 } from 'lucide-react';
import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';

// ═══════════════════════════════════════════════════════════════════
// ClientCalculations — блок «Расчёты материалов клиента» в карточке заказа.
//
// Показывает все заказы клиента (orders.client_id = clientId), потому
// что калькулятор сохраняет результат прямо в orders (без отдельной
// таблицы calculations — старая архитектура).
//
// Архитектура аналогична ClientCabinets и ClientGlazings:
//   • Кнопка "+ Расчёт материалов" → /calculator?client_id=XXX (новый расчёт)
//   • Тап на карточку → /calculator/:orderId (редактировать)
// ═══════════════════════════════════════════════════════════════════

interface OrderSummary {
  id: string;
  order_number: string;
  total_cost: number;
  address: string | null;
  status: string;
  created_at: string;
}

interface ClientCalculationsProps {
  clientId: string;
  /** Колбэк закрыть OrderDetail после клика. */
  onClose?: () => void;
}

export default function ClientCalculations({ clientId, onClose }: ClientCalculationsProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const orgId = useAuthStore.getState().organization?.id;
        if (!orgId) throw new Error('Нет организации');

        const { data, error: err } = await supabase
          .from('orders')
          .select('id, order_number, total_cost, address, status, created_at')
          .eq('org_id', orgId)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false });

        if (err) throw err;
        if (!cancelled) setItems((data || []) as OrderSummary[]);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Не удалось загрузить расчёты';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [clientId]);

  const handleOpen = (orderId: string) => {
    onClose?.();
    navigate(`/calculator/${orderId}`);
  };

  const handleCreate = () => {
    onClose?.();
    navigate(`/calculator?client_id=${clientId}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Расчёт материалов
        </h3>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="w-3.5 h-3.5" /> Расчёт материалов
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Загрузка…
        </div>
      )}

      {error && (
        <div className="text-xs text-red-500 py-2">{error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-xs text-gray-400 py-2">
          У клиента пока нет расчётов.
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-2">
          {items.map((o) => (
            <button
              key={o.id}
              onClick={() => handleOpen(o.id)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg
                         border border-gray-100 hover:border-brand-300
                         hover:bg-brand-50 transition text-left"
            >
              <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                <CalcIcon className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  Заказ №{o.order_number}
                </div>
                <div className="text-xs text-gray-500">
                  {fmtPrice(o.total_cost || 0)}
                  {o.address ? ` · ${o.address}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtPrice(n: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n);
}
