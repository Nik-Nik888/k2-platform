import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';
import type { Client, Order, OrderStatus } from '@shared/types';

function getOrgId(): string {
  const org = useAuthStore.getState().organization;
  if (!org) throw new Error('Организация не загружена');
  return org.id;
}

// ─── Клиенты ────────────────────────────────────────────

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('org_id', getOrgId())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Ошибка загрузки клиентов:', error.message);
    return [];
  }
  return data ?? [];
}

export async function createClient(
  client: Omit<Client, 'id' | 'org_id' | 'created_at'>
): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...client, org_id: getOrgId() })
    .select()
    .single();

  if (error) {
    console.error('Ошибка создания клиента:', error.message);
    return null;
  }
  return data;
}

// ─── Заказы ─────────────────────────────────────────────

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('org_id', getOrgId())
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Ошибка загрузки заказов:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    ...row,
    total_cost: row.total_cost ? Number(row.total_cost) : null,
    dimensions: row.dimensions as Order['dimensions'],
  }));
}

export async function createOrder(
  order: Omit<Order, 'id' | 'org_id' | 'created_at' | 'updated_at'>
): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .insert({
      org_id: getOrgId(),
      client_id: order.client_id,
      status: order.status,
      balcony_type: order.balcony_type,
      dimensions: order.dimensions,
      total_cost: order.total_cost,
      assigned_to: order.assigned_to,
      scheduled_date: order.scheduled_date,
      notes: order.notes,
    })
    .select()
    .single();

  if (error) {
    console.error('Ошибка создания заказа:', error.message);
    return null;
  }
  return {
    ...data,
    total_cost: data.total_cost ? Number(data.total_cost) : null,
    dimensions: data.dimensions as Order['dimensions'],
  };
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId);

  if (error) {
    console.error('Ошибка обновления статуса:', error.message);
    return false;
  }
  return true;
}

// ── Дубли заказов клиента ─────────────────────────────────

// Получить активные заказы того же клиента, кроме текущего
export async function fetchOtherActiveOrdersOfClient(
  clientId: string,
  currentOrderId: string
): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('client_id', clientId)
    .neq('id', currentOrderId)
    .neq('status', 'completed')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Ошибка загрузки дублей:', error.message);
    return [];
  }
  return (data || []) as Order[];
}

// Слить source_id → target_id (удаляет source, добавляет notes к target)
export async function mergeOrders(
  sourceId: string,
  targetId: string
): Promise<boolean> {
  const { error } = await supabase.rpc('merge_orders', {
    source_id: sourceId,
    target_id: targetId,
  });
  if (error) {
    console.error('Ошибка слияния заказов:', error.message);
    return false;
  }
  return true;
}

// Отметить "больше не предупреждать о дублях для этого заказа"
export async function setIgnoreDuplicates(orderId: string, value: boolean = true): Promise<boolean> {
  const { error } = await supabase
    .from('orders')
    .update({ ignore_duplicates: value })
    .eq('id', orderId);
  if (error) {
    console.error('Ошибка setIgnoreDuplicates:', error.message);
    return false;
  }
  return true;
}