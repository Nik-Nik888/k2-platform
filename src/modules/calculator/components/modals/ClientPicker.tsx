import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';

// Модальное окно выбора клиента из CRM для привязки к заказу.
export function ClientPicker({ onSelect, onClose }: {
  onSelect: (id: string, name: string, address?: string, phone?: string) => void;
  onClose: () => void;
}) {
  const [clients, setClients] = useState<Array<{ id: string; name: string; phone: string; address: string | null }>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const orgId = useAuthStore.getState().organization?.id;
      const { data } = await supabase.from('clients').select('id, name, phone, address')
        .eq('org_id', orgId).order('created_at', { ascending: false }).limit(100);
      setClients(data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex justify-between items-center px-5 py-4 border-b border-surface-200">
          <h3 className="text-base font-bold text-gray-900">Выбрать клиента</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-4 pt-3">
          <input className="input text-sm" placeholder="Поиск по имени или телефону..."
            value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-gray-400 py-8 text-sm">Клиенты не найдены</div>
          )}
          {filtered.map((c) => (
            <button key={c.id} onClick={() => onSelect(c.id, c.name, c.address || undefined, c.phone)}
              className="w-full text-left card p-3 hover:border-brand-300 transition-colors">
              <div className="text-sm font-semibold text-gray-800">{c.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{c.phone}{c.address ? ' · ' + c.address : ''}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
