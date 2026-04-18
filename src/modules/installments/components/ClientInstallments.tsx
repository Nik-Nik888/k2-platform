import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Plus } from 'lucide-react';
import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';
import NewInstallmentModal from './NewInstallmentModal';

interface Props {
  clientId: string;
  onClose?: () => void;
}

interface Row {
  id: string;
  total_amount: number;
  months: number;
  status: string;
  start_date: string;
  contract_number: string | null;
}

export default function ClientInstallments({ clientId, onClose }: Props) {
  const navigate = useNavigate();
  const orgId = useAuthStore((s) => s.organization?.id);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('installments')
      .select('id, total_amount, months, status, start_date, contract_number')
      .eq('org_id', orgId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (!error) setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId, orgId]);

  const statusColor: Record<string, string> = {
    active: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  const statusLabel: Record<string, string> = {
    active: 'Активна',
    completed: 'Закрыта',
    overdue: 'Просрочена',
    cancelled: 'Отменена',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <Wallet className="w-4 h-4" /> Рассрочки
        </h3>
        <button
          onClick={() => setShowNew(true)}
          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
        >
          <Plus size={12} /> Добавить
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-gray-400">Загрузка…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-gray-400">Рассрочек нет</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onClose?.();
                navigate(`/installments/${r.id}`);
              }}
              className="w-full text-left border rounded-lg p-2.5 hover:bg-gray-50 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">
                    {r.total_amount.toLocaleString('ru')} ₽ · {r.months} мес
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    с {new Date(r.start_date).toLocaleDateString('ru')}
                    {r.contract_number && ` · №${r.contract_number}`}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor[r.status] || ''}`}>
                  {statusLabel[r.status] || r.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showNew && (
        <NewInstallmentModal
          presetClientId={clientId}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            onClose?.();
            navigate(`/installments/${id}`);
          }}
        />
      )}
    </div>
  );
}
