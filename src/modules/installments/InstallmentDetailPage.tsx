import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Phone, MapPin, FileText, Trash2, XCircle, CheckCircle, Calculator } from 'lucide-react';
import {
  fetchInstallment,
  fetchPayments,
  calcPaidTotal,
  getNextPayment,
  setInstallmentStatus,
  deleteInstallment,
  type Installment,
  type InstallmentPayment,
} from './api/installmentsApi';
import PaymentRow from './components/PaymentRow';

export default function InstallmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inst, setInst] = useState<Installment | null>(null);
  const [payments, setPayments] = useState<InstallmentPayment[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const [i, p] = await Promise.all([fetchInstallment(id), fetchPayments(id)]);
      setInst(i);
      setPayments(p);
    } catch (e: any) {
      alert('Ошибка загрузки: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleStatusChange(status: 'completed' | 'cancelled' | 'active') {
    if (!inst) return;
    const labels = { completed: 'закрыть', cancelled: 'отменить', active: 'возобновить' };
    if (!confirm(`Вы уверены, что хотите ${labels[status]} рассрочку?`)) return;
    try {
      await setInstallmentStatus(inst.id, status);
      await load();
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    }
  }

  async function handleDelete() {
    if (!inst) return;
    if (!confirm('Удалить рассрочку НАВСЕГДА? Все платежи будут удалены.')) return;
    try {
      await deleteInstallment(inst.id);
      navigate('/installments');
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    }
  }

  if (loading) return <div className="p-6 text-center text-gray-500">Загрузка…</div>;
  if (!inst) return <div className="p-6 text-center text-gray-500">Рассрочка не найдена</div>;

  const paidTotal = calcPaidTotal(payments, inst.initial_payment);
  const remaining = inst.total_amount - paidTotal;
  const nextPayment = getNextPayment(payments);
  const progress = (paidTotal / inst.total_amount) * 100;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Навигация */}
      <button
        onClick={() => navigate('/installments')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft size={18} /> К списку
      </button>

      {/* Шапка */}
      <div className="bg-white border rounded-lg p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{inst.clients?.name || 'Клиент удалён'}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-600">
              {inst.clients?.phone && (
                <span className="flex items-center gap-1">
                  <Phone size={14} /> {inst.clients.phone}
                </span>
              )}
              {inst.clients?.address && (
                <span className="flex items-center gap-1">
                  <MapPin size={14} /> {inst.clients.address}
                </span>
              )}
              {inst.contract_number && (
                <span className="flex items-center gap-1">
                  <FileText size={14} /> Договор №{inst.contract_number}
                </span>
              )}
            </div>
            {inst.orders && (
              <div className="mt-2">
                <Link
                  to={`/calculator/${inst.orders.id}`}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  <Calculator size={14} /> Заказ №{inst.orders.order_number}
                </Link>
              </div>
            )}
          </div>
          <StatusBadge status={inst.status} />
        </div>

        {/* Прогресс-бар */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">Погашено</span>
            <span className="font-medium">
              {paidTotal.toLocaleString('ru')} / {inst.total_amount.toLocaleString('ru')} ₽
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

        {/* Сводка */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500 text-xs">Остаток</div>
            <div className="font-bold text-lg">{remaining.toLocaleString('ru')} ₽</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Срок</div>
            <div className="font-medium">
              {inst.months} мес {inst.interest_rate > 0 && `/ ${inst.interest_rate}%`}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Первый взнос</div>
            <div className="font-medium">{inst.initial_payment.toLocaleString('ru')} ₽</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Следующий платёж</div>
            <div className="font-medium">
              {nextPayment
                ? `${new Date(nextPayment.due_date).toLocaleDateString('ru')} · ${nextPayment.amount.toLocaleString('ru')} ₽`
                : '—'}
            </div>
          </div>
        </div>

        {/* Комментарий */}
        {inst.note && (
          <div className="mt-4 p-3 bg-gray-50 rounded text-sm text-gray-700">{inst.note}</div>
        )}

        {/* Действия */}
        <div className="mt-4 pt-4 border-t flex flex-wrap gap-2">
          {inst.status === 'active' && (
            <>
              <button
                onClick={() => handleStatusChange('completed')}
                className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center gap-1"
              >
                <CheckCircle size={14} /> Закрыть досрочно
              </button>
              <button
                onClick={() => handleStatusChange('cancelled')}
                className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 flex items-center gap-1"
              >
                <XCircle size={14} /> Отменить
              </button>
            </>
          )}
          {(inst.status === 'cancelled' || inst.status === 'completed') && (
            <button
              onClick={() => handleStatusChange('active')}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Возобновить
            </button>
          )}
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 flex items-center gap-1 ml-auto"
          >
            <Trash2 size={14} /> Удалить
          </button>
        </div>
      </div>

      {/* График платежей */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">График платежей</h2>
        {payments.length === 0 ? (
          <div className="text-center text-gray-500 py-6">Платежей нет</div>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} onChange={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
function StatusBadge({ status }: { status: Installment['status'] }) {
  const cfg = {
    active: { color: 'bg-blue-100 text-blue-700', label: 'Активная' },
    completed: { color: 'bg-green-100 text-green-700', label: 'Закрыта' },
    overdue: { color: 'bg-red-100 text-red-700', label: 'Просрочена' },
    cancelled: { color: 'bg-gray-100 text-gray-500', label: 'Отменена' },
  }[status];
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}
