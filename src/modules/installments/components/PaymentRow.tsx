import { useState } from 'react';
import { Check, X, Calendar } from 'lucide-react';
import type { InstallmentPayment } from '../api/installmentsApi';
import { markPaid, unmarkPaid } from '../api/installmentsApi';

interface Props {
  payment: InstallmentPayment;
  onChange: () => void;
}

export default function PaymentRow({ payment, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [paidAmount, setPaidAmount] = useState(payment.amount.toString());
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = payment.status !== 'paid' && payment.due_date < today;
  const isPaid = payment.status === 'paid';

  async function confirmPaid() {
    setBusy(true);
    try {
      await markPaid(payment.id, parseFloat(paidAmount), paidDate);
      setEditing(false);
      onChange();
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelPayment() {
    if (!confirm('Отменить оплату?')) return;
    setBusy(true);
    try {
      await unmarkPaid(payment.id);
      onChange();
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`border rounded-lg p-3 flex items-center gap-3 ${
        isPaid ? 'bg-green-50 border-green-200' :
        isOverdue ? 'bg-red-50 border-red-200' :
        'bg-white'
      }`}
    >
      {/* № */}
      <div className="w-8 text-center font-bold text-gray-500">#{payment.seq}</div>

      {/* Дата */}
      <div className="flex items-center gap-2 w-44">
        <Calendar size={16} className="text-gray-400" />
        <div>
          <div className={`font-medium ${isOverdue ? 'text-red-600' : ''}`}>
            {new Date(payment.due_date).toLocaleDateString('ru')}
          </div>
          {isPaid && payment.paid_date && (
            <div className="text-xs text-green-700">
              оплачен {new Date(payment.paid_date).toLocaleDateString('ru')}
            </div>
          )}
        </div>
      </div>

      {/* Сумма */}
      <div className="flex-1">
        <div className="font-medium">{payment.amount.toLocaleString('ru')} ₽</div>
        {isPaid && payment.paid_amount != null && payment.paid_amount !== payment.amount && (
          <div className="text-xs text-gray-500">
            оплачено: {payment.paid_amount.toLocaleString('ru')} ₽
          </div>
        )}
      </div>

      {/* Статус */}
      {!editing && (
        <div className="flex items-center gap-2">
          {isPaid ? (
            <>
              <span className="px-2 py-1 rounded bg-green-100 text-green-700 text-xs font-medium">
                ✓ Оплачен
              </span>
              <button
                onClick={cancelPayment}
                disabled={busy}
                className="p-2 hover:bg-gray-100 rounded text-gray-500"
                title="Отменить оплату"
              >
                <X size={16} />
              </button>
            </>
          ) : isOverdue ? (
            <>
              <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-medium">
                Просрочен
              </span>
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                Оплатить
              </button>
            </>
          ) : (
            <>
              <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-medium">
                Ожидает
              </span>
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                Оплатить
              </button>
            </>
          )}
        </div>
      )}

      {editing && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            className="w-28 border rounded px-2 py-1"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
          />
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
          />
          <button
            onClick={confirmPaid}
            disabled={busy}
            className="p-2 bg-green-600 text-white rounded hover:bg-green-700"
            title="Подтвердить"
          >
            <Check size={16} />
          </button>
          <button
            onClick={() => setEditing(false)}
            className="p-2 bg-gray-200 rounded hover:bg-gray-300"
            title="Отмена"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
