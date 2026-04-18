import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import ClientPicker from './ClientPicker';
import OrderPicker from './OrderPicker';
import { createInstallment, generateSchedule, calcMonthlyPayment } from '../api/installmentsApi';

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
  presetClientId?: string;
}

export default function NewInstallmentModal({ onClose, onCreated, presetClientId }: Props) {
  const [clientId, setClientId] = useState<string | null>(presetClientId || null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [contractNumber, setContractNumber] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [initialPayment, setInitialPayment] = useState('0');
  const [months, setMonths] = useState('6');
  const [interestRate, setInterestRate] = useState('0');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const total = parseFloat(totalAmount) || 0;
  const initial = parseFloat(initialPayment) || 0;
  const n = parseInt(months) || 0;
  const rate = parseFloat(interestRate) || 0;
  const principal = total - initial;

  // Предварительный расчёт ежемесячного платежа
  const monthly = useMemo(
    () => (principal > 0 && n > 0 ? calcMonthlyPayment(principal, rate, n) : 0),
    [principal, rate, n]
  );

  // Предпросмотр графика (первые 3 платежа)
  const preview = useMemo(() => {
    if (principal <= 0 || n <= 0 || !startDate) return [];
    return generateSchedule(total, initial, n, rate, startDate).slice(0, 3);
  }, [total, initial, n, rate, startDate, principal]);

  const valid = clientId && total > 0 && initial >= 0 && initial < total && n >= 1 && n <= 60;

  async function submit() {
    if (!valid || !clientId) return;
    setBusy(true);
    try {
      const id = await createInstallment({
        client_id: clientId,
        order_id: orderId,
        contract_number: contractNumber.trim(),
        total_amount: total,
        initial_payment: initial,
        months: n,
        interest_rate: rate,
        start_date: startDate,
        note: note.trim(),
      });
      onCreated(id);
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">Новая рассрочка</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Клиент */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Клиент <span className="text-red-500">*</span>
            </label>
            <ClientPicker value={clientId} onChange={(id) => {
              setClientId(id);
              setOrderId(null); // сбрасываем заказ при смене клиента
            }} />
          </div>

          {/* Заказ */}
          <div>
            <label className="block text-sm font-medium mb-1">Заказ</label>
            <OrderPicker
              clientId={clientId}
              value={orderId}
              onChange={(id, order) => {
                setOrderId(id);
                // Автоподстановка суммы из заказа
                if (order?.total_cost && !totalAmount) {
                  setTotalAmount(order.total_cost.toString());
                }
              }}
            />
          </div>

          {/* № договора */}
          <div>
            <label className="block text-sm font-medium mb-1">№ договора</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2"
              placeholder="например: 2026-042"
              value={contractNumber}
              onChange={(e) => setContractNumber(e.target.value)}
            />
          </div>

          {/* Сумма и взнос */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Общая сумма, ₽ <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded px-3 py-2"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Первоначальный взнос, ₽</label>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded px-3 py-2"
                value={initialPayment}
                onChange={(e) => setInitialPayment(e.target.value)}
              />
            </div>
          </div>

          {/* Срок и ставка */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Срок, месяцев <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="60"
                className="w-full border rounded px-3 py-2"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">% годовых</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full border rounded px-3 py-2"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
              />
            </div>
          </div>

          {/* Дата первого платежа */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Дата начала <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <div className="text-xs text-gray-500 mt-1">
              Первый платёж — через месяц от этой даты
            </div>
          </div>

          {/* Комментарий */}
          <div>
            <label className="block text-sm font-medium mb-1">Комментарий</label>
            <textarea
              className="w-full border rounded px-3 py-2"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Предварительный расчёт */}
          {principal > 0 && n > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
              <div className="font-medium text-blue-900">Предварительный расчёт:</div>
              <div className="text-sm">
                Сумма к рассрочке: <b>{principal.toLocaleString('ru')} ₽</b>
              </div>
              <div className="text-sm">
                Платёж в месяц: <b>{monthly.toFixed(2)} ₽</b>
                {rate > 0 && (
                  <span className="text-gray-600">
                    {' '}(переплата ~{(monthly * n - principal).toFixed(0)} ₽)
                  </span>
                )}
              </div>
              {preview.length > 0 && (
                <div className="text-xs text-gray-600 mt-2">
                  Первые платежи:{' '}
                  {preview.map((p, i) => (
                    <span key={p.seq}>
                      {i > 0 ? ', ' : ''}
                      {new Date(p.due_date).toLocaleDateString('ru')} — {p.amount.toFixed(0)} ₽
                    </span>
                  ))}
                  {n > 3 && <span>… всего {n}</span>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-2 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Отмена
          </button>
          <button
            onClick={submit}
            disabled={!valid || busy}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Создание…' : 'Создать рассрочку'}
          </button>
        </div>
      </div>
    </div>
  );
}
