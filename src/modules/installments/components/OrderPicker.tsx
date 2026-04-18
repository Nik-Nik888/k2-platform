import { useEffect, useState } from 'react';
import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';

interface OrderOption {
  id: string;
  order_number: string;
  address: string;
  total_cost: number | null;
  client_id: string | null;
}

interface Props {
  clientId: string | null;
  value: string | null;
  onChange: (orderId: string | null, order: OrderOption | null) => void;
}

export default function OrderPicker({ clientId, value, onChange }: Props) {
  const orgId = useAuthStore((s) => s.organization?.id);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId || !clientId) {
      setOrders([]);
      return;
    }
    setLoading(true);
    supabase
      .from('orders')
      .select('id, order_number, address, total_cost, results, client_id')
      .eq('org_id', orgId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        // total_cost берём напрямую, с фоллбеком на results.totals.grand_total
        const mapped: OrderOption[] = (data || []).map((o: any) => ({
          id: o.id,
          order_number: o.order_number || '—',
          address: o.address || '',
          total_cost: o.total_cost ?? o.results?.totals?.grand_total ?? null,
          client_id: o.client_id,
        }));
        setOrders(mapped);
        setLoading(false);
      });
  }, [orgId, clientId]);

  if (!clientId) {
    return <div className="text-sm text-gray-500">Сначала выберите клиента</div>;
  }
  if (loading) {
    return <div className="text-sm text-gray-500">Загрузка заказов…</div>;
  }
  if (orders.length === 0) {
    return <div className="text-sm text-gray-500">У клиента нет заказов в калькуляторе</div>;
  }

  return (
    <select
      className="w-full border rounded px-3 py-2"
      value={value || ''}
      onChange={(e) => {
        const id = e.target.value || null;
        const order = orders.find((o) => o.id === id) || null;
        onChange(id, order);
      }}
    >
      <option value="">— без заказа —</option>
      {orders.map((o) => (
        <option key={o.id} value={o.id}>
          №{o.order_number} · {o.address}
          {o.total_cost ? ` · ${o.total_cost.toLocaleString('ru')} ₽` : ''}
        </option>
      ))}
    </select>
  );
}
