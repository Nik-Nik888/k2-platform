import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, CreditCard, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { fetchInstallments, type Installment, type InstallmentStatus } from './api/installmentsApi';
import NewInstallmentModal from './components/NewInstallmentModal';

type FilterTab = 'all' | 'active' | 'overdue' | 'completed' | 'cancelled';

const TABS: Array<{ id: FilterTab; label: string; icon: any; color: string }> = [
  { id: 'all', label: 'Все', icon: CreditCard, color: 'text-gray-700' },
  { id: 'active', label: 'Активные', icon: CreditCard, color: 'text-blue-700' },
  { id: 'overdue', label: 'Просроченные', icon: AlertCircle, color: 'text-red-700' },
  { id: 'completed', label: 'Закрытые', icon: CheckCircle, color: 'text-green-700' },
  { id: 'cancelled', label: 'Отменённые', icon: XCircle, color: 'text-gray-500' },
];

export default function InstallmentsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>('active');
  const [showNew, setShowNew] = useState(false);

  async function load() {
    setLoading(true);
    try {
      let filter: InstallmentStatus | InstallmentStatus[] | 'all';
      if (tab === 'active') {
        // На вкладке "Активные" показываем и просроченные — это всё ещё действующие договоры
        filter = ['active', 'overdue'];
      } else if (tab === 'all') {
        filter = 'all';
      } else {
        filter = tab as InstallmentStatus;
      }
      const data = await fetchInstallments(filter);
      setItems(data);
    } catch (e: any) {
      alert('Ошибка загрузки: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tab]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="text-blue-600" />
            Рассрочки
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Управление платежами клиентов по договорам рассрочки
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={18} /> Новая рассрочка
        </button>
      </div>

      {/* Вкладки */}
      <div className="flex gap-2 border-b mb-4 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
                active
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon size={16} className={active ? '' : t.color} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Список */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {tab === 'active' ? 'Нет активных рассрочек' : 'Ничего не найдено'}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((inst) => (
            <InstallmentCard key={inst.id} inst={inst} onClick={() => navigate(`/installments/${inst.id}`)} />
          ))}
        </div>
      )}

      {showNew && (
        <NewInstallmentModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            navigate(`/installments/${id}`);
          }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Карточка в списке
// ══════════════════════════════════════════════════════════
function InstallmentCard({ inst, onClick }: { inst: Installment; onClick: () => void }) {
  const statusColor: Record<InstallmentStatus, string> = {
    active: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  const statusLabel: Record<InstallmentStatus, string> = {
    active: 'Активная',
    completed: 'Закрыта',
    overdue: 'Просрочена',
    cancelled: 'Отменена',
  };

  const isOverdue = inst.status === 'overdue';

  return (
    <div
      onClick={onClick}
      className={`bg-white border rounded-lg p-4 hover:shadow-md cursor-pointer transition ${
        isOverdue ? 'border-red-300 bg-red-50/30' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="font-semibold">{inst.clients?.name || 'Клиент удалён'}</div>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor[inst.status]}`}>
              {statusLabel[inst.status]}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            {inst.clients?.phone}
            {inst.clients?.address && ` · ${inst.clients.address}`}
          </div>
          {inst.contract_number && (
            <div className="text-xs text-gray-500 mt-1">
              Договор №{inst.contract_number}
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="font-bold text-lg">{inst.total_amount.toLocaleString('ru')} ₽</div>
          <div className="text-xs text-gray-500">
            {inst.months} мес
            {inst.interest_rate > 0 && ` · ${inst.interest_rate}% годовых`}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            с {new Date(inst.start_date).toLocaleDateString('ru')}
          </div>
        </div>
      </div>
    </div>
  );
}
