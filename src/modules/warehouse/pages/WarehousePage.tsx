import { useEffect, useState } from 'react';
import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';
import {
  fetchStock, fetchMovements, createMovement, updateMinQuantity, deleteStockItem,
} from '@modules/warehouse/api/warehouseApi';
import type { StockItem, StockMovement, MovementType } from '@modules/warehouse/api/warehouseApi';
import { NumberInput } from '@modules/calculator/components/primitives';
import {
  Package, AlertTriangle, ArrowDownToLine, ArrowUpFromLine,
  Loader2, X, Search, Plus, Trash2, History, BarChart3,
} from 'lucide-react';

// ── Лейблы ──────────────────────────────────────────────
const TYPE_LABELS: Record<MovementType, { label: string; color: string; icon: string }> = {
  in: { label: 'Поступление', color: 'text-emerald-600', icon: '📥' },
  out: { label: 'Списание', color: 'text-red-600', icon: '📤' },
  reserve: { label: 'Резерв', color: 'text-amber-600', icon: '🔒' },
  adjustment: { label: 'Корректировка', color: 'text-blue-600', icon: '✏️' },
};

// ════════════════════════════════════════════════════════
// Модалка движения (поступление / списание)
// ════════════════════════════════════════════════════════

function MovementModal({ type, materials, onClose, onSave }: {
  type: 'in' | 'out';
  materials: Array<{ id: string; name: string; unit: string }>;
  onClose: () => void;
  onSave: (materialId: string, qty: number, comment: string) => Promise<void>;
}) {
  const [materialId, setMaterialId] = useState('');
  const [qty, setQty] = useState(0);
  const [comment, setComment] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = materials.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!materialId || qty <= 0) return;
    setSaving(true);
    await onSave(materialId, qty, comment);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-gray-900">
            {type === 'in' ? '📥 Поступление' : '📤 Списание'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Поиск материала</label>
            <input className="input text-sm" placeholder="Название..." value={search}
              onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Материал</label>
            <select className="input text-sm" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              <option value="">— Выберите —</option>
              {filtered.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Количество</label>
            <NumberInput value={qty} onChange={setQty} allowFloat />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Комментарий</label>
            <input className="input text-sm" placeholder="Откуда / куда / зачем..."
              value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={handleSubmit} disabled={!materialId || qty <= 0 || saving}
              className={`flex-1 py-2.5 rounded-lg font-medium text-sm text-white transition-colors disabled:opacity-50 ${
                type === 'in' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'
              }`}>
              {saving ? 'Сохраняю...' : type === 'in' ? '📥 Принять' : '📤 Списать'}
            </button>
            <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// Модалка добавления позиции на склад
// ════════════════════════════════════════════════════════

function AddStockModal({ materials, onClose, onSave }: {
  materials: Array<{ id: string; name: string; unit: string }>;
  onClose: () => void;
  onSave: (materialId: string, qty: number, minQty: number) => Promise<void>;
}) {
  const [materialId, setMaterialId] = useState('');
  const [qty, setQty] = useState(0);
  const [minQty, setMinQty] = useState(0);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = materials.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-gray-900">➕ Добавить на склад</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <input className="input text-sm" placeholder="Поиск материала..." value={search}
            onChange={(e) => setSearch(e.target.value)} autoFocus />
          <select className="input text-sm" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">— Выберите материал —</option>
            {filtered.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
            ))}
          </select>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Начальный остаток</label>
              <NumberInput value={qty} onChange={setQty} allowFloat />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Минимум</label>
              <NumberInput value={minQty} onChange={setMinQty} allowFloat />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={async () => {
              if (!materialId) return;
              setSaving(true);
              await onSave(materialId, qty, minQty);
              setSaving(false);
            }} disabled={!materialId || saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Добавляю...' : 'Добавить'}
            </button>
            <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// Главная страница склада
// ════════════════════════════════════════════════════════

export function WarehousePage() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [materials, setMaterials] = useState<Array<{ id: string; name: string; unit: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'stock' | 'history'>('stock');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'in' | 'out' | 'add' | null>(null);
  const [toast, setToast] = useState('');

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    const [s, m] = await Promise.all([fetchStock(), fetchMovements(100)]);
    setStock(s);
    setMovements(m);

    // Загрузка материалов для селектов
    const orgId = useAuthStore.getState().organization?.id;
    if (orgId) {
      const { data } = await supabase.from('materials').select('id, name, unit').eq('org_id', orgId).order('name');
      setMaterials(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Статистика
  const totalItems = stock.length;
  const lowItems = stock.filter((s) => s.quantity < s.min_quantity && s.min_quantity > 0);
  const totalValue = stock.reduce((sum, s) => sum + (s.material?.price || 0) * s.quantity, 0);

  // Фильтрация
  const filteredStock = stock.filter((s) =>
    (s.material?.name || '').toLowerCase().includes(search.toLowerCase())
  );
  const filteredMovements = movements.filter((m) =>
    (m.material?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  // Обработчики
  const handleMovement = async (materialId: string, qty: number, comment: string, type: MovementType) => {
    const ok = await createMovement(materialId, qty, type, comment);
    if (ok) { notify(type === 'in' ? 'Поступление оформлено' : 'Списание оформлено'); await load(); }
    else notify('Ошибка!');
    setModal(null);
  };

  const handleAddStock = async (materialId: string, qty: number, minQty: number) => {
    // Создаём позицию + движение поступления
    const { error } = await supabase.from('warehouse_stock').insert({
      material_id: materialId, quantity: qty, min_quantity: minQty, warehouse_name: 'Основной',
    });
    if (error) { notify('Ошибка: ' + error.message); return; }
    if (qty > 0) {
      await createMovement(materialId, qty, 'in', 'Начальный остаток');
    }
    notify('Позиция добавлена');
    await load();
    setModal(null);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Удалить «${name}» со склада?`)) return;
    await deleteStockItem(id);
    notify('Удалено');
    await load();
  };

  const handleUpdateMin = async (id: string, minQty: number) => {
    await updateMinQuantity(id, minQty);
    setStock((prev) => prev.map((s) => s.id === id ? { ...s, min_quantity: minQty } : s));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <span className="ml-3 text-gray-500">Загрузка склада...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Тост */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Заголовок */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Склад</h1>
          <p className="text-sm text-gray-500 mt-1">Остатки и движение материалов</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('add')} className="btn-secondary text-xs py-1.5 px-2.5">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Добавить</span>
          </button>
          <button onClick={() => setModal('in')} className="btn-secondary text-xs py-1.5 px-2.5">
            <ArrowDownToLine className="w-4 h-4" /> <span className="hidden sm:inline">Поступление</span>
          </button>
          <button onClick={() => setModal('out')} className="btn-secondary text-xs py-1.5 px-2.5">
            <ArrowUpFromLine className="w-4 h-4" /> <span className="hidden sm:inline">Списание</span>
          </button>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4 flex items-center gap-4">
          <div className="p-2.5 bg-blue-50 rounded-lg">
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{totalItems}</p>
            <p className="text-xs text-gray-500">Позиций на складе</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="p-2.5 bg-amber-50 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600">{lowItems.length}</p>
            <p className="text-xs text-gray-500">Ниже минимума</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="p-2.5 bg-emerald-50 rounded-lg">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{totalValue > 0 ? totalValue.toLocaleString('ru') + '₽' : '—'}</p>
            <p className="text-xs text-gray-500">Стоимость на складе</p>
          </div>
        </div>
      </div>

      {/* Переключатель + поиск */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          <button onClick={() => setView('stock')}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              view === 'stock' ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium' : 'border-surface-200 text-gray-500'
            }`}>
            <Package className="w-3.5 h-3.5 inline mr-1" />Остатки
          </button>
          <button onClick={() => setView('history')}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              view === 'history' ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium' : 'border-surface-200 text-gray-500'
            }`}>
            <History className="w-3.5 h-3.5 inline mr-1" />История
          </button>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input text-sm pl-9 py-2" placeholder="Поиск материала..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* ═══ Остатки ═══ */}
      {view === 'stock' && (
        <div className="card overflow-hidden">
          {filteredStock.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              {stock.length === 0 ? 'Склад пуст. Добавьте позиции.' : 'Ничего не найдено.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wider bg-surface-50">
                    <th className="px-4 py-3 font-medium">Материал</th>
                    <th className="px-4 py-3 font-medium text-right">Остаток</th>
                    <th className="px-4 py-3 font-medium text-right">Мин.</th>
                    <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Цена</th>
                    <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Сумма</th>
                    <th className="px-4 py-3 font-medium">Статус</th>
                    <th className="px-4 py-3 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filteredStock.map((item) => {
                    const isLow = item.min_quantity > 0 && item.quantity < item.min_quantity;
                    const value = (item.material?.price || 0) * item.quantity;
                    return (
                      <tr key={item.id} className={`hover:bg-surface-50 transition-colors ${isLow ? 'bg-amber-50/50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{item.material?.name || '?'}</div>
                          <div className="text-[10px] text-gray-400">{item.warehouse_name}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-mono text-sm font-bold ${isLow ? 'text-amber-600' : 'text-gray-900'}`}>
                            {item.quantity}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">{item.material?.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <NumberInput
                            value={item.min_quantity || 0}
                            onChange={(v) => handleUpdateMin(item.id, v)}
                            allowFloat
                            className="w-14 text-right text-xs font-mono border border-surface-200 rounded px-1.5 py-1 bg-white outline-none focus:border-brand-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-400 font-mono hidden sm:table-cell">
                          {item.material?.price ? item.material.price + '₽' : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-mono font-bold text-emerald-600 hidden sm:table-cell">
                          {value > 0 ? value.toLocaleString('ru') + '₽' : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {isLow ? (
                            <span className="badge badge-orange">Мало</span>
                          ) : (
                            <span className="badge badge-green">Ок</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleDelete(item.id, item.material?.name || '?')}
                            className="text-gray-300 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ История движений ═══ */}
      {view === 'history' && (
        <div className="card overflow-hidden">
          {filteredMovements.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Нет движений.</div>
          ) : (
            <div className="divide-y divide-surface-100">
              {filteredMovements.map((m) => {
                const t = TYPE_LABELS[m.type as MovementType] || TYPE_LABELS.in;
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-50 transition-colors">
                    <span className="text-lg">{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{m.material?.name || '?'}</div>
                      {m.comment && <div className="text-[10px] text-gray-400 truncate">{m.comment}</div>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`font-mono text-sm font-bold ${t.color}`}>
                        {m.type === 'in' ? '+' : m.type === 'adjustment' ? '=' : '−'}{m.quantity} {m.material?.unit}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {new Date(m.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Модалки */}
      {modal === 'in' && (
        <MovementModal type="in" materials={materials} onClose={() => setModal(null)}
          onSave={(id, qty, comment) => handleMovement(id, qty, comment, 'in')} />
      )}
      {modal === 'out' && (
        <MovementModal type="out" materials={materials} onClose={() => setModal(null)}
          onSave={(id, qty, comment) => handleMovement(id, qty, comment, 'out')} />
      )}
      {modal === 'add' && (
        <AddStockModal materials={materials} onClose={() => setModal(null)} onSave={handleAddStock} />
      )}
    </div>
  );
}