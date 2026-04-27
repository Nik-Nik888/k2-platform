import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Plus, Search, Loader2, Pencil, Trash2, Package,
  FolderPlus, ChevronRight,
} from 'lucide-react';
import {
  loadCategories, loadMaterials,
  createCategory, updateCategory, deleteCategory,
  createMaterial, updateMaterial, deleteMaterial,
  SCOPE_DESCRIPTIONS,
  type ModuleScope, type RefCategory, type RefMaterial,
} from '../api/referenceApi';
import { ScopeTabs } from '../components/ScopeTabs';
import {
  CategoryModal, MaterialModal, ConfirmDeleteModal,
  type CategoryFormValues, type MaterialFormValues,
} from '../components/Modals';

// ════════════════════════════════════════════════════════════════════
// ReferencePage — Справочник материалов с разделением по модулям.
//
// Layout:
//   [ScopeTabs: Калькулятор | Остекление | Общее]
//   [Категории (sidebar) | Материалы выбранной категории (main)]
// ════════════════════════════════════════════════════════════════════

export function ReferencePage() {
  // ── Состояние ─────────────────────────────────────────────────────
  const [scope, setScope] = useState<ModuleScope>('glazing');
  const [allCategories, setAllCategories] = useState<RefCategory[]>([]);
  const [materials, setMaterials] = useState<RefMaterial[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Модалки
  const [editCat, setEditCat] = useState<RefCategory | null | undefined>(undefined);
  // undefined = модалка закрыта; null = создание; объект = редактирование
  const [editMat, setEditMat] = useState<RefMaterial | null | undefined>(undefined);
  const [delCat, setDelCat] = useState<RefCategory | null>(null);
  const [delMat, setDelMat] = useState<RefMaterial | null>(null);

  // ── Загрузка данных ───────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      // Загружаем ВСЕ категории независимо от scope, чтобы считать счётчики
      // и предоставить выбор в модалке материала.
      const [cats, mats] = await Promise.all([
        loadCategories(),
        loadMaterials(),
      ]);
      setAllCategories(cats);
      setMaterials(mats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // ── Производные данные ────────────────────────────────────────────
  const filteredCategories = useMemo(() => {
    if (scope === 'both') {
      return allCategories.filter((c) => c.module_scope === 'both');
    }
    return allCategories.filter(
      (c) => c.module_scope === scope || c.module_scope === 'both'
    );
  }, [allCategories, scope]);

  const counts = useMemo(() => ({
    calc: allCategories.filter((c) => c.module_scope === 'calc' || c.module_scope === 'both').length,
    glazing: allCategories.filter((c) => c.module_scope === 'glazing' || c.module_scope === 'both').length,
    both: allCategories.filter((c) => c.module_scope === 'both').length,
  }), [allCategories]);

  const materialsByCat = useMemo(() => {
    const map = new Map<string, RefMaterial[]>();
    for (const m of materials) {
      const k = m.category_id || '__none__';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    return map;
  }, [materials]);

  const visibleMaterials = useMemo(() => {
    let list: RefMaterial[];
    if (selectedCatId === null) {
      // Все материалы из категорий текущего scope + без категории
      const allowedIds = new Set(filteredCategories.map((c) => c.id));
      list = materials.filter((m) => !m.category_id || allowedIds.has(m.category_id));
    } else if (selectedCatId === '__none__') {
      list = materials.filter((m) => !m.category_id);
    } else {
      list = materialsByCat.get(selectedCatId) || [];
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        (m.sku || '').toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [selectedCatId, filteredCategories, materials, materialsByCat, search]);

  // Сбрасываем выбранную категорию при смене scope, если она не в новом scope
  useEffect(() => {
    if (selectedCatId && selectedCatId !== '__none__') {
      const stillVisible = filteredCategories.some((c) => c.id === selectedCatId);
      if (!stillVisible) setSelectedCatId(null);
    }
  }, [filteredCategories, selectedCatId]);

  // ── Хендлеры CRUD ─────────────────────────────────────────────────
  async function handleSaveCategory(data: CategoryFormValues) {
    if (editCat) {
      await updateCategory(editCat.id, data);
    } else {
      await createCategory(data);
    }
    await reload();
  }

  async function handleDeleteCategory() {
    if (!delCat) return;
    await deleteCategory(delCat.id);
    if (selectedCatId === delCat.id) setSelectedCatId(null);
    await reload();
  }

  async function handleSaveMaterial(data: MaterialFormValues) {
    if (editMat) {
      await updateMaterial(editMat.id, data);
    } else {
      await createMaterial(data);
    }
    await reload();
  }

  async function handleDeleteMaterial() {
    if (!delMat) return;
    await deleteMaterial(delMat.id);
    await reload();
  }

  // ── Рендер ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Справочник</h1>
          <p className="text-sm text-gray-500 mt-1">
            Материалы и категории для калькулятора и остекления
          </p>
        </div>
      </div>

      {/* Табы scope */}
      <ScopeTabs active={scope} onChange={setScope} counts={counts} />

      {/* Описание scope */}
      <div className="text-xs text-gray-500 px-1">
        {SCOPE_DESCRIPTIONS[scope]}
      </div>

      {err && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
          {err}
        </div>
      )}

      {/* Двухпанельный layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* ── Колонка категорий ────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="p-3 border-b border-surface-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Категории</h3>
            <button
              onClick={() => setEditCat(null)}
              className="p-1.5 rounded-lg hover:bg-surface-100 text-brand-600"
              title="Новая категория"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {/* Все материалы scope */}
            <button
              onClick={() => setSelectedCatId(null)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b border-surface-100 transition-colors ${
                selectedCatId === null ? 'bg-brand-50 text-brand-700 font-medium' : 'hover:bg-surface-50'
              }`}
            >
              <span className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                Все материалы
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>

            {filteredCategories.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-400">
                Нет категорий в этом разделе.<br />
                Нажмите «+» чтобы создать.
              </div>
            )}

            {filteredCategories.map((cat) => {
              const matCount = materialsByCat.get(cat.id)?.length || 0;
              const isActive = selectedCatId === cat.id;

              return (
                <div
                  key={cat.id}
                  className={`group flex items-center px-3 py-2.5 text-sm border-b border-surface-100 transition-colors ${
                    isActive ? 'bg-brand-50' : 'hover:bg-surface-50'
                  }`}
                >
                  <button
                    onClick={() => setSelectedCatId(cat.id)}
                    className="flex-1 flex items-center gap-2 min-w-0 text-left"
                  >
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0"
                      style={{ backgroundColor: cat.color + '20' }}
                    >
                      {cat.icon}
                    </span>
                    <span className={`truncate ${isActive ? 'font-medium text-brand-700' : 'text-gray-700'}`}>
                      {cat.name}
                    </span>
                    <span className="ml-auto text-xs text-gray-400 shrink-0">
                      {matCount}
                    </span>
                  </button>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-1 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditCat(cat); }}
                      className="p-1 rounded hover:bg-surface-200 text-gray-500"
                      title="Редактировать"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDelCat(cat); }}
                      className="p-1 rounded hover:bg-red-100 text-gray-500 hover:text-red-600"
                      title="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Колонка материалов ───────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="p-3 border-b border-surface-200 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input text-sm pl-8"
                placeholder="Поиск по названию, SKU, описанию..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setEditMat(null)}
              className="btn-primary text-sm py-2 px-3"
            >
              <Plus className="w-4 h-4" /> Материал
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {visibleMaterials.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400">
                {search.trim() ? 'Ничего не найдено' : 'В этой категории пока нет материалов'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface-50 sticky top-0 z-10">
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-3 py-2 font-semibold">Название</th>
                    <th className="px-3 py-2 font-semibold">Описание</th>
                    <th className="px-3 py-2 font-semibold text-right">Цена</th>
                    <th className="px-3 py-2 font-semibold w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMaterials.map((m) => {
                    const cat = m.category_id
                      ? allCategories.find((c) => c.id === m.category_id)
                      : null;
                    return (
                      <tr key={m.id} className="border-t border-surface-100 hover:bg-surface-50 group">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-gray-900">{m.name}</div>
                          {cat && selectedCatId === null && (
                            <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <span>{cat.icon}</span>
                              <span>{cat.name}</span>
                            </div>
                          )}
                          {m.sku && (
                            <div className="text-xs text-gray-400 mt-0.5">SKU: {m.sku}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 text-xs">
                          {m.description || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="font-semibold text-gray-900">
                            {m.price.toLocaleString('ru-RU')} ₽
                          </div>
                          <div className="text-xs text-gray-400">за {m.unit}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                            <button
                              onClick={() => setEditMat(m)}
                              className="p-1 rounded hover:bg-surface-200 text-gray-500"
                              title="Редактировать"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDelMat(m)}
                              className="p-1 rounded hover:bg-red-100 text-gray-500 hover:text-red-600"
                              title="Удалить"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Модалки ────────────────────────────────────────────── */}
      {editCat !== undefined && (
        <CategoryModal
          cat={editCat}
          defaultScope={scope}
          onClose={() => setEditCat(undefined)}
          onSave={handleSaveCategory}
        />
      )}

      {editMat !== undefined && (
        <MaterialModal
          material={editMat}
          categories={filteredCategories}
          defaultCategoryId={selectedCatId && selectedCatId !== '__none__' ? selectedCatId : null}
          onClose={() => setEditMat(undefined)}
          onSave={handleSaveMaterial}
        />
      )}

      {delCat && (
        <ConfirmDeleteModal
          title="Удалить категорию?"
          message={`Категория «${delCat.name}» будет удалена. Это действие нельзя отменить.`}
          onClose={() => setDelCat(null)}
          onConfirm={handleDeleteCategory}
        />
      )}

      {delMat && (
        <ConfirmDeleteModal
          title="Удалить материал?"
          message={`Материал «${delMat.name}» будет удалён. Это действие нельзя отменить.`}
          onClose={() => setDelMat(null)}
          onConfirm={handleDeleteMaterial}
        />
      )}
    </div>
  );
}
