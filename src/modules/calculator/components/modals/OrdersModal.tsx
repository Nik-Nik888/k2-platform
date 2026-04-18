import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '@lib/supabase';

// Список сохранённых заказов с возможностью загрузки и удаления.
export function OrdersModal({ onClose, onLoad, notify }: {
  onClose: () => void;
  onLoad: (order: { id: string; order_number: string; address: string; phone: string; form_data: Record<string, Record<string, unknown>> }) => void;
  notify: (msg: string) => void;
}) {
  const [orders, setOrders] = useState<Array<{
    id: string; order_number: string; address: string; phone: string;
    total_cost: number; created_at: string; form_data: Record<string, Record<string, unknown>>;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('orders')
        .select('*').order('created_at', { ascending: false }).limit(50);
      if (error) { notify('Ошибка: ' + error.message); return; }
      setOrders(data || []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: string, num: string) => {
    if (!confirm('Удалить заказ №' + num + '?')) return;
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) { notify('Ошибка: ' + error.message); return; }
    setOrders((prev) => prev.filter((o) => o.id !== id));
    notify('Заказ удалён');
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex justify-between items-center px-5 py-4 border-b border-surface-200">
          <h3 className="text-base font-bold text-gray-900">📋 Заказы</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          )}
          {!loading && orders.length === 0 && (
            <div className="text-center text-gray-400 py-8 text-sm">Нет сохранённых заказов</div>
          )}
          {orders.map((o) => (
            <div key={o.id} className="card p-3 hover:border-brand-300 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-bold text-gray-800">№{o.order_number || '—'}</span>
                <span className="text-xs text-gray-400">
                  {new Date(o.created_at).toLocaleDateString('ru')}
                </span>
              </div>
              <div className="text-xs text-gray-500 mb-2 truncate">
                {o.address || '—'} · {o.phone || '—'}
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-emerald-600">
                  {o.total_cost ? Number(o.total_cost).toLocaleString('ru') + '₽' : '—'}
                </span>
                <div className="flex gap-1.5">
                  <button onClick={() => onLoad(o)}
                    className="text-xs text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg hover:bg-brand-100 font-medium">
                    Загрузить
                  </button>
                  <button onClick={() => handleDelete(o.id, o.order_number)}
                    className="text-xs text-red-500 bg-red-50 px-2.5 py-1 rounded-lg hover:bg-red-100 font-medium">
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
