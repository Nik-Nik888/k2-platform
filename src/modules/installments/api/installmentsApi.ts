import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';

// ══════════════════════════════════════════════════════════
// Типы
// ══════════════════════════════════════════════════════════

export type InstallmentStatus = 'active' | 'completed' | 'overdue' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'partial';

export interface Installment {
  id: string;
  org_id: string;
  client_id: string;
  order_id: string | null;
  contract_number: string | null;

  total_amount: number;
  initial_payment: number;
  months: number;
  interest_rate: number;
  start_date: string; // ISO date (YYYY-MM-DD)

  status: InstallmentStatus;
  note: string | null;
  created_at: string;
  updated_at: string;

  // Joined-данные (для списка):
  clients?: { id: string; name: string; phone: string; address: string | null };
  orders?: { id: string; order_number: string; total_cost: number | null };
}

export interface InstallmentPayment {
  id: string;
  installment_id: string;
  org_id: string;
  seq: number;
  due_date: string;
  amount: number;
  paid_date: string | null;
  paid_amount: number | null;
  status: PaymentStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ══════════════════════════════════════════════════════════
// Генерация графика платежей
// ══════════════════════════════════════════════════════════

// Добавить N месяцев к дате (без мутации исходной).
// Если в целевом месяце нет такого дня (например 31 янв + 1 мес),
// берём последний день месяца.
function addMonths(dateStr: string, months: number): string {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const target = new Date(Date.UTC(y, m - 1 + months, d));
  // Защита от перехода 31→1 число
  const expectedMonth = ((m - 1 + months) % 12 + 12) % 12;
  if (target.getUTCMonth() !== expectedMonth) {
    // День был "обрезан" — берём последний день нужного месяца
    target.setUTCDate(0);
  }
  return target.toISOString().slice(0, 10);
}

// Аннуитетный платёж: P × r / (1 - (1+r)^-n)
// где P — сумма кредита, r — месячная ставка, n — число платежей.
// При rate=0 возвращает просто P/n.
export function calcMonthlyPayment(principal: number, yearRate: number, months: number): number {
  if (months <= 0) return 0;
  if (yearRate <= 0) return principal / months;
  const r = yearRate / 100 / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

// Сгенерировать график из N платежей.
// principal = total_amount - initial_payment.
// Все платежи равной суммы (аннуитет), кроме последнего — он корректирует
// мелкие копеечные расхождения округления.
export function generateSchedule(
  totalAmount: number,
  initialPayment: number,
  months: number,
  yearRate: number,
  startDate: string
): Array<{ seq: number; due_date: string; amount: number }> {
  const principal = totalAmount - initialPayment;
  if (principal <= 0 || months <= 0) return [];

  const monthly = calcMonthlyPayment(principal, yearRate, months);
  const rounded = Math.round(monthly * 100) / 100; // 2 знака
  const schedule: Array<{ seq: number; due_date: string; amount: number }> = [];

  let accumulated = 0;
  for (let i = 0; i < months; i++) {
    const seq = i + 1;
    const due_date = addMonths(startDate, i + 1); // первый платёж через месяц
    let amount: number;
    if (i < months - 1) {
      amount = rounded;
      accumulated += rounded;
    } else {
      // Последний платёж — "добиваем" до ровного principal
      amount = Math.round((principal - accumulated) * 100) / 100;
    }
    schedule.push({ seq, due_date, amount });
  }
  return schedule;
}

// ══════════════════════════════════════════════════════════
// CRUD API
// ══════════════════════════════════════════════════════════

// Загрузить список рассрочек (с данными клиента и заказа)
export async function fetchInstallments(filter?: InstallmentStatus | 'all'): Promise<Installment[]> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) return [];

  let q = supabase
    .from('installments')
    .select('*, clients(id, name, phone, address), orders(id, order_number, total_cost)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (filter && filter !== 'all') {
    q = q.eq('status', filter);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Одна рассрочка с полными данными
export async function fetchInstallment(id: string): Promise<Installment | null> {
  const { data, error } = await supabase
    .from('installments')
    .select('*, clients(id, name, phone, address), orders(id, order_number, total_cost)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Платежи по рассрочке
export async function fetchPayments(installmentId: string): Promise<InstallmentPayment[]> {
  const { data, error } = await supabase
    .from('installment_payments')
    .select('*')
    .eq('installment_id', installmentId)
    .order('seq', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Создать рассрочку + сразу сгенерировать график платежей
export async function createInstallment(input: {
  client_id: string;
  order_id: string | null;
  contract_number: string;
  total_amount: number;
  initial_payment: number;
  months: number;
  interest_rate: number;
  start_date: string;
  note: string;
}): Promise<string> {
  const orgId = useAuthStore.getState().organization?.id;
  if (!orgId) throw new Error('Организация не загружена');

  // 1. Создаём саму рассрочку
  const { data: inst, error: instErr } = await supabase
    .from('installments')
    .insert({ ...input, org_id: orgId, status: 'active' })
    .select()
    .single();
  if (instErr) throw instErr;

  // 2. Генерим график и вставляем все платежи одной операцией
  const schedule = generateSchedule(
    input.total_amount, input.initial_payment, input.months, input.interest_rate, input.start_date
  );

  if (schedule.length > 0) {
    const rows = schedule.map((s) => ({
      installment_id: inst.id,
      org_id: orgId,
      seq: s.seq,
      due_date: s.due_date,
      amount: s.amount,
      status: 'pending' as const,
    }));
    const { error: payErr } = await supabase.from('installment_payments').insert(rows);
    if (payErr) {
      // Откат: удаляем саму рассрочку если не получилось вставить график
      await supabase.from('installments').delete().eq('id', inst.id);
      throw payErr;
    }
  }

  return inst.id;
}

// Отметить платёж оплаченным
export async function markPaid(paymentId: string, paidAmount: number, paidDate: string): Promise<void> {
  const { error } = await supabase
    .from('installment_payments')
    .update({
      paid_date: paidDate,
      paid_amount: paidAmount,
      status: 'paid',
    })
    .eq('id', paymentId);
  if (error) throw error;
}

// Отменить оплату (снять статус "оплачено")
export async function unmarkPaid(paymentId: string): Promise<void> {
  const { error } = await supabase
    .from('installment_payments')
    .update({
      paid_date: null,
      paid_amount: null,
      status: 'pending',
    })
    .eq('id', paymentId);
  if (error) throw error;
}

// Сменить статус рассрочки (отменить, возобновить, завершить)
export async function setInstallmentStatus(id: string, status: InstallmentStatus): Promise<void> {
  const { error } = await supabase
    .from('installments')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

// Удалить рассрочку целиком
export async function deleteInstallment(id: string): Promise<void> {
  const { error } = await supabase.from('installments').delete().eq('id', id);
  if (error) throw error;
}

// Сумма оплаченного по рассрочке (для остатка)
export function calcPaidTotal(payments: InstallmentPayment[], initialPayment: number): number {
  return payments
    .filter((p) => p.status === 'paid' && p.paid_amount != null)
    .reduce((sum, p) => sum + (p.paid_amount || 0), initialPayment);
}

// Следующий неоплаченный платёж
export function getNextPayment(payments: InstallmentPayment[]): InstallmentPayment | null {
  return payments.find((p) => p.status !== 'paid') || null;
}
