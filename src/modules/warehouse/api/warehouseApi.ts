import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';

// ── Типы ────────────────────────────────────────────────
export type MovementType = 'in' | 'out' | 'adjustment' | 'reserve';

export interface StockItem {
  id: string;
  material_id: string;
  quantity: number;
  min_quantity: number;
  warehouse_name: string;
  // joined
  material?: {
    id: string;
    name: string;
    unit: string;
    price: number;
    description: string | null;
  };
}

export interface StockMovement {
  id: string;
  material_id: string;
  quantity: number;
  type: MovementType;
  order_id: string | null;
  comment: string | null;
  created_by: string | null;
  created_at: string;
  // joined
  material?: {
    name: string;
    unit: string;
  };
}

// ── Загрузка остатков ───────────────────────────────────
export async function fetchStock(): Promise<StockItem[]> {
  const { data, error } = await supabase
    .from('warehouse_stock')
    .select('*, material:materials(*)')
    .order('warehouse_name');

  if (error) {
    console.error('Ошибка загрузки склада:', error.message);
    return [];
  }
  return (data || []).map((row: Record<string, unknown>) => ({
    ...row,
    quantity: Number(row.quantity) || 0,
    min_quantity: Number(row.min_quantity) || 0,
    material: row.material as StockItem['material'],
  })) as StockItem[];
}

// ── Загрузка движений ───────────────────────────────────
export async function fetchMovements(limit = 50): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*, material:materials(name, unit)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Ошибка загрузки движений:', error.message);
    return [];
  }
  return (data || []).map((row: Record<string, unknown>) => ({
    ...row,
    quantity: Number(row.quantity) || 0,
    material: row.material as StockMovement['material'],
  })) as StockMovement[];
}

// ── Создать движение + обновить остаток ─────────────────
export async function createMovement(
  materialId: string,
  qty: number,
  type: MovementType,
  comment?: string,
  orderId?: string
): Promise<boolean> {
  const userId = useAuthStore.getState().user?.id || null;

  // 1. Создаём запись движения
  const { error: moveErr } = await supabase.from('stock_movements').insert({
    material_id: materialId,
    quantity: qty,
    type,
    comment: comment || null,
    order_id: orderId || null,
    created_by: userId,
  });
  if (moveErr) {
    console.error('Ошибка создания движения:', moveErr.message);
    return false;
  }

  // 2. Обновляем остаток
  const { data: existing } = await supabase
    .from('warehouse_stock')
    .select('id, quantity')
    .eq('material_id', materialId)
    .limit(1)
    .single();

  const currentQty = existing ? Number(existing.quantity) : 0;
  let newQty = currentQty;

  if (type === 'in') newQty = currentQty + qty;
  else if (type === 'out' || type === 'reserve') newQty = Math.max(0, currentQty - qty);
  else if (type === 'adjustment') newQty = qty; // абсолютное значение

  if (existing) {
    const { error } = await supabase
      .from('warehouse_stock')
      .update({ quantity: newQty })
      .eq('id', existing.id);
    if (error) { console.error('Ошибка обновления остатка:', error.message); return false; }
  } else {
    // Создаём новую позицию на складе
    const { error } = await supabase.from('warehouse_stock').insert({
      material_id: materialId,
      quantity: newQty,
      min_quantity: 0,
      warehouse_name: 'Основной',
    });
    if (error) { console.error('Ошибка создания позиции:', error.message); return false; }
  }

  return true;
}

// ── Обновить минимум ────────────────────────────────────
export async function updateMinQuantity(stockId: string, minQty: number): Promise<boolean> {
  const { error } = await supabase
    .from('warehouse_stock')
    .update({ min_quantity: minQty })
    .eq('id', stockId);
  if (error) {
    console.error('Ошибка обновления минимума:', error.message);
    return false;
  }
  return true;
}

// ── Удалить позицию со склада ───────────────────────────
export async function deleteStockItem(stockId: string): Promise<boolean> {
  const { error } = await supabase
    .from('warehouse_stock')
    .delete()
    .eq('id', stockId);
  if (error) {
    console.error('Ошибка удаления:', error.message);
    return false;
  }
  return true;
}