import { useState } from 'react';
import { X } from 'lucide-react';
import type { RefCategory, RefMaterial, ModuleScope } from '../api/referenceApi';
import { ICONS, COLORS, UNITS, SCOPE_LABELS } from '../api/referenceApi';

// ════════════════════════════════════════════════════════════════════
// Базовая модалка
// ════════════════════════════════════════════════════════════════════

function Modal({
  title,
  onClose,
  children,
  maxWidth = 'max-w-md',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`bg-white rounded-2xl w-full ${maxWidth} max-h-[85vh] overflow-y-auto p-5 shadow-xl`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Модалка категории (создание / редактирование)
// ════════════════════════════════════════════════════════════════════

export interface CategoryFormValues {
  name: string;
  icon: string;
  color: string;
  module_scope: ModuleScope;
}

export function CategoryModal({
  cat,
  defaultScope,
  onClose,
  onSave,
}: {
  cat: RefCategory | null;
  defaultScope: ModuleScope;
  onClose: () => void;
  onSave: (data: CategoryFormValues) => Promise<void>;
}) {
  const [name, setName] = useState(cat?.name || '');
  const [icon, setIcon] = useState(cat?.icon || '📦');
  const [color, setColor] = useState(cat?.color || COLORS[0]!);
  const [scope, setScope] = useState<ModuleScope>(cat?.module_scope || defaultScope);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setErr('Введите название');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSave({ name: name.trim(), icon, color, module_scope: scope });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения');
      setSaving(false);
    }
  }

  return (
    <Modal title={cat ? 'Редактировать категорию' : 'Новая категория'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Название</label>
          <input
            className="input text-sm"
            placeholder="Профильные системы, Стеклопакеты..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">Принадлежность</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['calc', 'glazing', 'both'] as ModuleScope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                  scope === s
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface-100 text-gray-700 hover:bg-surface-200'
                }`}
              >
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">Иконка</label>
          <div className="flex gap-1.5 flex-wrap">
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                  icon === ic
                    ? 'bg-brand-100 ring-2 ring-brand-500 scale-110'
                    : 'bg-surface-50 hover:bg-surface-100'
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">Цвет</label>
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-9 h-9 rounded-lg transition-all ${
                  color === c ? 'ring-2 ring-offset-2 ring-gray-900 scale-110' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {err && (
          <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-sm">
            {err}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">
            Отмена
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════
// Модалка материала (создание / редактирование)
// ════════════════════════════════════════════════════════════════════

export interface MaterialFormValues {
  name: string;
  category_id: string | null;
  unit: string;
  price: number;
  description: string | null;
  sku: string | null;
}

export function MaterialModal({
  material,
  categories,
  defaultCategoryId,
  onClose,
  onSave,
}: {
  material: RefMaterial | null;
  categories: RefCategory[];
  defaultCategoryId?: string | null;
  onClose: () => void;
  onSave: (data: MaterialFormValues) => Promise<void>;
}) {
  const [name, setName] = useState(material?.name || '');
  const [categoryId, setCategoryId] = useState<string>(
    material?.category_id || defaultCategoryId || ''
  );
  const [unit, setUnit] = useState(material?.unit || 'шт.');
  const [price, setPrice] = useState<string>(String(material?.price ?? 0));
  const [description, setDescription] = useState(material?.description || '');
  const [sku, setSku] = useState(material?.sku || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setErr('Введите название');
      return;
    }
    const priceNum = parseFloat(price.replace(',', '.'));
    if (isNaN(priceNum) || priceNum < 0) {
      setErr('Некорректная цена');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSave({
        name: name.trim(),
        category_id: categoryId || null,
        unit,
        price: priceNum,
        description: description.trim() || null,
        sku: sku.trim() || null,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения');
      setSaving(false);
    }
  }

  return (
    <Modal title={material ? 'Редактировать материал' : 'Новый материал'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Название</label>
          <input
            className="input text-sm"
            placeholder="REHAU Blitz, отлив белый 200..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Категория</label>
          <select
            className="input text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">— без категории —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Ед. изм.</label>
            <select
              className="input text-sm"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Цена, ₽</label>
            <input
              className="input text-sm"
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Описание (размеры, артикул)</label>
          <input
            className="input text-sm"
            placeholder="3000×96, белый, толщина 60мм..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">SKU (необязательно)</label>
          <input
            className="input text-sm"
            placeholder="REHAU-BLITZ-60"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </div>

        {err && (
          <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-sm">
            {err}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">
            Отмена
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════
// Модалка подтверждения удаления
// ════════════════════════════════════════════════════════════════════

export function ConfirmDeleteModal({
  title,
  message,
  onClose,
  onConfirm,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle() {
    setBusy(true);
    setErr(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка удаления');
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} maxWidth="max-w-sm">
      <p className="text-sm text-gray-700 mb-4">{message}</p>
      {err && (
        <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-sm mb-3">
          {err}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={handle}
          disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 disabled:opacity-50"
        >
          {busy ? 'Удаление...' : 'Удалить'}
        </button>
        <button onClick={onClose} className="btn-secondary flex-1">
          Отмена
        </button>
      </div>
    </Modal>
  );
}
