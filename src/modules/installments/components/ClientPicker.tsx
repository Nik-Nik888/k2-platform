import { useEffect, useState } from 'react';
import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';
import { Check } from 'lucide-react';

interface ClientOption {
  id: string;
  name: string;
  phone: string;
}

interface Props {
  value: string | null;
  onChange: (clientId: string | null) => void;
}

export default function ClientPicker({ value, onChange }: Props) {
  const orgId = useAuthStore((s) => s.organization?.id);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    supabase
      .from('clients')
      .select('id, name, phone')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setClients(data || []);
        setLoading(false);
      });
  }, [orgId]);

  const filtered = search
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.phone.includes(search)
      )
    : clients;

  const selected = clients.find((c) => c.id === value);

  if (loading) return <div className="text-sm text-gray-500">Загрузка…</div>;

  return (
    <div className="space-y-2">
      {/* Выбранный клиент (если есть) */}
      {selected && (
        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div>
            <div className="font-medium text-blue-900">{selected.name}</div>
            <div className="text-sm text-blue-700">{selected.phone}</div>
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); setSearch(''); }}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Сменить
          </button>
        </div>
      )}

      {/* Поиск + список (если клиент не выбран) */}
      {!selected && (
        <>
          <input
            type="text"
            className="w-full border rounded px-3 py-2"
            placeholder="Поиск клиента по имени или телефону…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="border rounded max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-gray-500 text-center">
                {search ? 'Ничего не найдено' : 'Нет клиентов'}
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setSearch('');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 flex items-center justify-between group"
                >
                  <div>
                    <div className="font-medium text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.phone}</div>
                  </div>
                  <Check size={16} className="text-blue-600 opacity-0 group-hover:opacity-100" />
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
