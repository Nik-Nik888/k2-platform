import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';
import {
  Plus, X, Search, Loader2, Trash2, Edit3, FolderPlus,
} from 'lucide-react';
import { NumberInput } from '@modules/calculator/components/primitives';

// ── Типы ────────────────────────────────────────────────
interface MatCategory {
  id: string;
  org_id: string | null;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
}

interface MaterialItem {
  id: string;
  org_id: string;
  name: string;
  category_id: string | null;
  unit: string;
  price: number;
  description: string | null;
  sku: string | null;
  type: string;
  created_at: string;
}

const UNITS = ['шт.', 'п.м.', 'м²', 'л.', 'уп.', 'кг', 'компл.', 'рул.', 'усл.'];
const ICONS = ['📦', '🔧', '🚛', '⬆️', '🔩', '🪟', '🧱', '⚡', '🎨', '🪑', '🔨', '🧰', '📐', '🪵', '🧲'];

// ════════════════════════════════════════════════════════
// Модалка категории
// ════════════════════════════════════════════════════════

function CategoryModal({ cat, onClose, onSave }: {
  cat: MatCategory | null;
  onClose: () => void;
  onSave: (data: { name: string; icon: string; color: string }) => Promise<void>;
}) {
  const [name, setName] = useState(cat?.name || '');
  const [icon, setIcon] = useState(cat?.icon || '📦');
  const [color, setColor] = useState(cat?.color || '#6B7280');
  const [saving, setSaving] = useState(false);

  const COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#EF4444', '#06B6D4', '#6B7280', '#F97316', '#84CC16'];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-gray-900">{cat ? 'Редактировать категорию' : 'Новая категория'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Название</label>
            <input className="input text-sm" placeholder="Фурнитура, Крепёж..." value={name}
              onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">Иконка</label>
            <div className="flex gap-1.5 flex-wrap">
              {ICONS.map((ic) => (
                <button key={ic} onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                    icon === ic ? 'bg-brand-100 ring-2 ring-brand-500 scale-110' : 'bg-surface-50 hover:bg-surface-100'
                  }`}>{ic}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">Цвет</label>
            <div className="flex gap-1.5 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-offset-2 ring-brand-500 scale-110' : 'hover:scale-105'
                  }`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={async () => {
              if (!name.trim()) return;
              setSaving(true);
              await onSave({ name: name.trim(), icon, color });
              setSaving(false);
            }} disabled={!name.trim() || saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Сохраняю...' : cat ? 'Сохранить' : 'Создать'}
            </button>
            <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// Модалка материала
// ════════════════════════════════════════════════════════

function MaterialModal({ item, categories, onClose, onSave }: {
  item: MaterialItem | null;
  categories: MatCategory[];
  onClose: () => void;
  onSave: (data: Partial<MaterialItem>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: item?.name || '',
    unit: item?.unit || 'шт.',
    price: item?.price || 0,
    description: item?.description || '',
    sku: item?.sku || '',
    category_id: item?.category_id || (categories[0]?.id || ''),
  });
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-gray-900">{item ? '✏️ Редактировать' : '➕ Новый материал'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Категория</label>
            <select className="input text-sm" value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">— Без категории —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Название *</label>
            <input className="input text-sm" placeholder="Вагонка сосна 12.5×96мм" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Цена, ₽</label>
              <NumberInput value={form.price} onChange={(p) => setForm({ ...form, price: p })} allowFloat />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Единица</label>
              <select className="input text-sm" value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Размеры / описание</label>
            <input className="input text-sm" placeholder="3000×96 или описание работы"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <p className="text-[10px] text-gray-400 mt-1">Для длиномеров: длина×ширина в мм. Используется в авторасчёте калькулятора.</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Артикул (SKU)</label>
            <input className="input text-sm" placeholder="VAG-096-300" value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={async () => {
              if (!form.name.trim()) return;
              setSaving(true);
              await onSave({
                name: form.name.trim(),
                unit: form.unit,
                price: form.price,
                description: form.description.trim() || null,
                sku: form.sku.trim() || null,
                category_id: form.category_id || null,
              });
              setSaving(false);
            }} disabled={!form.name.trim() || saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Сохраняю...' : item ? 'Сохранить' : 'Создать'}
            </button>
            <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// MaterialsPage
// ════════════════════════════════════════════════════════

export function MaterialsPage() {
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [categories, setCategories] = useState<MatCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [modal, setModal] = useState<{ mode: 'addMat' | 'editMat' | 'addCat' | 'editCat'; item?: MaterialItem; cat?: MatCategory } | null>(null);
  const [toast, setToast] = useState('');

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };
  const orgId = useAuthStore.getState().organization?.id;

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const [{ data: mats }, { data: cats }] = await Promise.all([
      supabase.from('materials').select('*').eq('org_id', orgId).order('name'),
      supabase.from('material_categories').select('*').or(`org_id.eq.${orgId},org_id.is.null`).order('sort_order'),
    ]);
    setItems(mats || []);
    setCategories(cats || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = items;
    if (filterCat !== 'all') {
      if (filterCat === 'none') list = list.filter((m) => !m.category_id);
      else list = list.filter((m) => m.category_id === filterCat);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        (m.sku || '').toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, filterCat, search]);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length, none: 0 };
    items.forEach((m) => {
      if (m.category_id) counts[m.category_id] = (counts[m.category_id] || 0) + 1;
      else counts.none = (counts.none || 0) + 1;
    });
    return counts;
  }, [items]);

  const getCat = (id: string | null) => categories.find((c) => c.id === id);

  const handleCreateMat = async (data: Partial<MaterialItem>) => {
    const { error } = await supabase.from('materials').insert({ ...data, org_id: orgId });
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Материал создан');
    setModal(null);
    await load();
  };

  const handleUpdateMat = async (data: Partial<MaterialItem>) => {
    if (!modal?.item) return;
    const { error } = await supabase.from('materials').update(data).eq('id', modal.item.id);
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Обновлено');
    setModal(null);
    await load();
  };

  const handleDeleteMat = async (id: string, name: string) => {
    if (!confirm(`Удалить «${name}»?`)) return;
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Удалено');
    await load();
  };

  const handlePriceUpdate = async (id: string, price: number) => {
    await supabase.from('materials').update({ price }).eq('id', id);
    setItems((prev) => prev.map((m) => m.id === id ? { ...m, price } : m));
  };

  const handleCreateCat = async (data: { name: string; icon: string; color: string }) => {
    const maxSort = categories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
    const { error } = await supabase.from('material_categories').insert({ ...data, org_id: orgId, sort_order: maxSort + 1 });
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Категория создана');
    setModal(null);
    await load();
  };

  const handleUpdateCat = async (data: { name: string; icon: string; color: string }) => {
    if (!modal?.cat) return;
    const { error } = await supabase.from('material_categories').update(data).eq('id', modal.cat.id);
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Категория обновлена');
    setModal(null);
    await load();
  };

  const handleDeleteCat = async (id: string, name: string) => {
    if (!confirm(`Удалить категорию «${name}»? Материалы останутся без категории.`)) return;
    await supabase.from('materials').update({ category_id: null }).eq('category_id', id);
    const { error } = await supabase.from('material_categories').delete().eq('id', id);
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Категория удалена');
    if (filterCat === id) setFilterCat('all');
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <span className="ml-3 text-gray-500">Загрузка базы материалов...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium">{toast}</div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">База материалов</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} позиций · {categories.length} категорий</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal({ mode: 'addCat' })} className="btn-secondary text-xs py-1.5 px-2.5">
            <FolderPlus className="w-4 h-4" /> <span className="hidden sm:inline">Категория</span>
          </button>
          <button onClick={() => setModal({ mode: 'addMat' })} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Материал
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setFilterCat('all')}
          className={`shrink-0 text-xs px-3 py-2 rounded-lg border transition-all ${
            filterCat === 'all' ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-surface-200 text-gray-500'
          }`}>
          Все <span className="ml-1 text-[10px] opacity-70">{catCounts.all}</span>
        </button>
        {categories.map((cat) => (
          <div key={cat.id} className="shrink-0 flex items-center group">
            <button onClick={() => setFilterCat(cat.id)}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all ${
                filterCat === cat.id ? 'font-semibold' : 'border-surface-200 text-gray-500'
              }`}
              style={filterCat === cat.id ? { borderColor: cat.color, backgroundColor: cat.color + '15', color: cat.color } : {}}>
              <span>{cat.icon}</span>{cat.name}
              {(catCounts[cat.id] || 0) > 0 && <span className="text-[10px] opacity-70">{catCounts[cat.id]}</span>}
            </button>
            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity ml-0.5">
              <button onClick={() => setModal({ mode: 'editCat', cat })}
                className="text-gray-300 hover:text-brand-500 p-0.5"><Edit3 className="w-3 h-3" /></button>
              <button onClick={() => handleDeleteCat(cat.id, cat.name)}
                className="text-gray-300 hover:text-red-500 p-0.5"><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
        {(catCounts.none ?? 0) > 0 && (
          <button onClick={() => setFilterCat('none')}
            className={`shrink-0 text-xs px-3 py-2 rounded-lg border transition-all ${
              filterCat === 'none' ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-surface-200 text-gray-400'
            }`}>
            Без категории <span className="text-[10px] opacity-70">{catCounts.none}</span>
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input text-sm pl-9 py-2.5" placeholder="Поиск по названию, артикулу, описанию..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {items.length === 0 ? 'База пуста. Добавьте первый материал.' : 'Ничего не найдено.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider bg-surface-50">
                  <th className="px-4 py-3 font-medium">Категория</th>
                  <th className="px-4 py-3 font-medium">Название</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Размеры</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Артикул</th>
                  <th className="px-4 py-3 font-medium text-center">Ед.</th>
                  <th className="px-4 py-3 font-medium text-right">Цена, ₽</th>
                  <th className="px-4 py-3 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filtered.map((item) => {
                  const cat = getCat(item.category_id);
                  return (
                    <tr key={item.id} className="hover:bg-surface-50 transition-colors group">
                      <td className="px-4 py-3">
                        {cat ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                            style={{ backgroundColor: cat.color + '15', color: cat.color }}>
                            {cat.icon} {cat.name}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 font-mono hidden sm:table-cell">
                        {item.description || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">
                        {item.sku || '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">{item.unit}</td>
                      <td className="px-4 py-3 text-right">
                        <NumberInput
                          value={item.price}
                          onChange={(p) => {
                            setItems((prev) => prev.map((m) => m.id === item.id ? { ...m, price: p } : m));
                            handlePriceUpdate(item.id, p);
                          }}
                          allowFloat
                          className="w-20 text-right text-sm font-mono font-bold text-accent-500 border border-transparent hover:border-surface-300 focus:border-brand-500 rounded-lg px-2 py-1 bg-transparent outline-none focus:bg-white transition-colors"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setModal({ mode: 'editMat', item })}
                            className="text-gray-400 hover:text-brand-500 p-1 rounded-lg hover:bg-brand-50">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteMat(item.id, item.name)}
                            className="text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.mode === 'addMat' && (
        <MaterialModal item={null} categories={categories} onClose={() => setModal(null)} onSave={handleCreateMat} />
      )}
      {modal?.mode === 'editMat' && modal.item && (
        <MaterialModal item={modal.item} categories={categories} onClose={() => setModal(null)} onSave={handleUpdateMat} />
      )}
      {modal?.mode === 'addCat' && (
        <CategoryModal cat={null} onClose={() => setModal(null)} onSave={handleCreateCat} />
      )}
      {modal?.mode === 'editCat' && modal.cat && (
        <CategoryModal cat={modal.cat} onClose={() => setModal(null)} onSave={handleUpdateCat} />
      )}
    </div>
  );
}