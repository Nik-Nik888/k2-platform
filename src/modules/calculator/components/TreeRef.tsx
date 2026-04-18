import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@lib/supabase';
import { useAuthStore } from '@store/authStore';
import { TABS, CALC_MODE_LABELS, parseDims } from '@modules/calculator/api/calcApi';
import type { CalcDB, Material, Category, CategoryOption, OptionMaterial } from '@modules/calculator/api/calcApi';
import { ChevronRight, Plus, Trash2, Pencil, X, Save, Package } from 'lucide-react';
import { NumberInput } from './primitives';

// ════════════════════════════════════════════════════════
// Модальные окна
// ════════════════════════════════════════════════════════

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalAddSimple({ title, placeholder, onSave, onClose }: {
  title: string; placeholder: string; onSave: (name: string) => void; onClose: () => void;
}) {
  const [v, setV] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <input className="input mb-3" placeholder={placeholder} value={v}
        onChange={(e) => setV(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) onSave(v.trim()); }} />
      <div className="flex gap-2">
        <button onClick={() => { if (v.trim()) onSave(v.trim()); }}
          className="btn-primary flex-1">Добавить</button>
        <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
      </div>
    </Modal>
  );
}

function ModalAddBinding({ title, materials, onSave, onClose }: {
  title: string;
  materials: Material[];
  onSave: (matId: string, qty: number, visible: boolean, calcMode: string) => void;
  onClose: () => void;
}) {
  const [matId, setMatId] = useState('');
  const [qty, setQty] = useState(1);
  const [visible, setVisible] = useState(false);
  const [calcMode, setCalcMode] = useState('fixed');
  const [search, setSearch] = useState('');

  // Фильтрация по названию, артикулу и единице — шире чем было в старом коде,
  // но верхнее поле и поведение те же.
  const filtered = materials.filter((m) => {
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      (m.sku || '').toLowerCase().includes(q) ||
      (m.unit || '').toLowerCase().includes(q)
    );
  });

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Поиск материала</label>
          <input className="input text-sm" placeholder="Название, артикул..." value={search}
            onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Материал</label>
          <select className="input text-sm" value={matId} onChange={(e) => setMatId(e.target.value)}>
            <option value="">— Выберите —</option>
            {filtered.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.unit}{m.price > 0 ? ` · ${m.price}₽` : ''})</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Количество</label>
            <NumberInput value={qty} onChange={setQty} allowFloat />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Режим расчёта</label>
            <select className="input text-sm" value={calcMode} onChange={(e) => setCalcMode(e.target.value)}>
              {Object.entries(CALC_MODE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300" />
          <span className="text-sm">Видимый (открытый) материал</span>
        </label>
        <div className="flex gap-2 mt-2">
          <button onClick={() => { if (matId) onSave(matId, qty, visible, calcMode); }}
            disabled={!matId}
            className="btn-primary flex-1 disabled:opacity-50">Привязать</button>
          <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
        </div>
      </div>
    </Modal>
  );
}

function ModalEditBinding({ binding, onSave, onClose }: {
  binding: OptionMaterial;
  onSave: (id: number, qty: number, visible: boolean, calcMode: string) => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(binding.quantity);
  const [visible, setVisible] = useState(binding.visible);
  const [calcMode, setCalcMode] = useState(binding.calc_mode || 'fixed');

  return (
    <Modal title={`Редактировать: ${binding.materials?.name || '?'}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Количество</label>
            <NumberInput value={qty} onChange={setQty} allowFloat />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1 block">Режим расчёта</label>
            <select className="input text-sm" value={calcMode} onChange={(e) => setCalcMode(e.target.value)}>
              {Object.entries(CALC_MODE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300" />
          <span className="text-sm">Видимый (открытый) материал</span>
        </label>
        <div className="flex gap-2 mt-2">
          <button onClick={() => onSave(binding.id, qty, visible, calcMode)}
            className="btn-primary flex-1">Сохранить</button>
          <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════
// TreeRef — основной компонент справочника
// ════════════════════════════════════════════════════════

export function TreeRef({ db, refresh, notify }: {
  db: CalcDB;
  refresh: () => void;
  notify: (msg: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<Record<string, unknown> | null>(null);

  const tog = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));
  const isOpen = (key: string) => !!expanded[key];

  // Группировка данных
  const tabCats = useMemo(() => {
    const m: Record<string, Category[]> = {};
    TABS.forEach((t) => { m[t.id] = db.categories.filter((c) => c.tab_id === t.id); });
    return m;
  }, [db]);

  const catOpts = useMemo(() => {
    const m: Record<number, CategoryOption[]> = {};
    db.options.forEach((o) => { if (!m[o.category_id]) m[o.category_id] = []; m[o.category_id].push(o); });
    return m;
  }, [db]);

  const optMats = useMemo(() => {
    const m: Record<number, OptionMaterial[]> = {};
    db.optionMaterials.forEach((om) => { if (!m[om.option_id]) m[om.option_id] = []; m[om.option_id].push(om); });
    return m;
  }, [db]);

  // ── CRUD ──
  const addCategory = async (tabId: string, name: string) => {
    const orgId = useAuthStore.getState().organization?.id;
    if (!orgId) { notify('Ошибка: организация не загружена'); return; }
    const maxSort = (tabCats[tabId] || []).reduce((m, c) => Math.max(m, c.sort_order), 0);
    const { error } = await supabase.from('categories').insert({
      tab_id: tabId, name, sort_order: maxSort + 1, org_id: orgId,
    });
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Категория добавлена');
    refresh();
  };

  const delCategory = async (id: number, name: string) => {
    if (!confirm(`Удалить категорию «${name}» и все варианты?`)) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Категория удалена');
    refresh();
  };

  const addOption = async (catId: number, name: string) => {
    const orgId = useAuthStore.getState().organization?.id;
    if (!orgId) { notify('Ошибка: организация не загружена'); return; }
    const maxSort = (catOpts[catId] || []).reduce((m, o) => Math.max(m, o.sort_order), 0);
    const { error } = await supabase.from('category_options').insert({
      category_id: catId, name, sort_order: maxSort + 1, org_id: orgId,
    });
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Вариант добавлен');
    refresh();
  };

  const delOption = async (id: number, name: string) => {
    if (!confirm(`Удалить вариант «${name}»?`)) return;
    const { error } = await supabase.from('category_options').delete().eq('id', id);
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Вариант удалён');
    refresh();
  };

  const addBinding = async (optionId: number, matId: string, qty: number, visible: boolean, calcMode: string) => {
    const orgId = useAuthStore.getState().organization?.id;
    if (!orgId) { notify('Ошибка: организация не загружена'); return; }
    const { error } = await supabase.from('option_materials').insert({
      option_id: optionId, material_id: matId, quantity: qty, visible, calc_mode: calcMode, org_id: orgId,
    });
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Материал привязан');
    refresh();
  };

  const updateBinding = async (id: number, qty: number, visible: boolean, calcMode: string) => {
    const { error } = await supabase.from('option_materials').update({
      quantity: qty, visible, calc_mode: calcMode,
    }).eq('id', id);
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Привязка обновлена');
    refresh();
  };

  const delBinding = async (id: number) => {
    const { error } = await supabase.from('option_materials').delete().eq('id', id);
    if (error) { notify('Ошибка: ' + error.message); return; }
    notify('Привязка удалена');
    refresh();
  };

  return (
    <div>
      <div className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5" />
        {db.materials.length} материалов в справочнике
      </div>

      {/* Дерево: Вкладка → Категория → Вариант → Материалы */}
      {TABS.map((tab) => {
        const tKey = `tab_${tab.id}`;
        const cats = tabCats[tab.id] || [];
        return (
          <div key={tab.id} className="mb-1">
            {/* Вкладка */}
            <div onClick={() => tog(tKey)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-surface-50 transition-colors text-left cursor-pointer select-none">
              <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen(tKey) ? 'rotate-90' : ''}`} />
              <span className="text-lg">{tab.icon}</span>
              <span className="text-sm font-semibold text-gray-800 flex-1">{tab.label}</span>
              <span className="text-[11px] text-gray-400 font-mono">{cats.length} кат.</span>
              <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'category', tabId: tab.id, tabLabel: tab.label }); }}
                className="text-gray-300 hover:text-brand-500 p-1 rounded-lg hover:bg-brand-50">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {isOpen(tKey) && (
              <div className="ml-4 pl-4 border-l border-dashed border-surface-200">
                {cats.map((cat) => {
                  const cKey = `cat_${cat.id}`;
                  const opts = catOpts[cat.id] || [];
                  return (
                    <div key={cat.id} className="mb-0.5">
                      {/* Категория */}
                      <div onClick={() => tog(cKey)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-50 transition-colors text-left cursor-pointer select-none">
                        <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform ${isOpen(cKey) ? 'rotate-90' : ''}`} />
                        <span className="text-sm font-medium text-brand-600 flex-1">{cat.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{opts.length} вар.</span>
                        <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'option', catId: cat.id, catName: cat.name }); }}
                          className="text-gray-300 hover:text-brand-500 p-0.5"><Plus className="w-3 h-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); delCategory(cat.id, cat.name); }}
                          className="text-gray-300 hover:text-red-500 p-0.5"><Trash2 className="w-3 h-3" /></button>
                      </div>

                      {isOpen(cKey) && (
                        <div className="ml-4 pl-4 border-l border-dashed border-surface-200">
                          {opts.map((opt) => {
                            const oKey = `opt_${opt.id}`;
                            const mats = optMats[opt.id] || [];
                            const hiddenCount = mats.filter((m) => !m.visible).length;
                            const openCount = mats.filter((m) => m.visible).length;
                            return (
                              <div key={opt.id} className="mb-0.5">
                                {/* Вариант */}
                                <div onClick={() => tog(oKey)}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-50 transition-colors text-left cursor-pointer select-none">
                                  <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform ${isOpen(oKey) ? 'rotate-90' : ''}`} />
                                  <span className="text-xs text-gray-700 flex-1">{opt.name}</span>
                                  <span className="text-[10px] text-gray-400">
                                    {openCount > 0 && <span className="text-emerald-500">👁{openCount}</span>}
                                    {hiddenCount > 0 && <span className="text-amber-500 ml-1">🔒{hiddenCount}</span>}
                                  </span>
                                  <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'binding', optionId: opt.id, optionName: opt.name }); }}
                                    className="text-gray-300 hover:text-brand-500 p-0.5"><Plus className="w-3 h-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); delOption(opt.id, opt.name); }}
                                    className="text-gray-300 hover:text-red-500 p-0.5"><Trash2 className="w-3 h-3" /></button>
                                </div>

                                {isOpen(oKey) && (
                                  <div className="ml-4 pl-3 border-l border-dashed border-surface-200 space-y-0.5 py-1">
                                    {mats.length === 0 && (
                                      <div className="text-[11px] text-gray-400 px-2">Нет материалов</div>
                                    )}
                                    {mats.map((om) => {
                                      const mode = om.calc_mode || 'fixed';
                                      const modeLabel = CALC_MODE_LABELS[mode] || '';
                                      return (
                                        <div key={om.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-50 text-xs flex-wrap">
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                            om.visible ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                          }`}>{om.visible ? '👁' : '🔒'}</span>
                                          <span className="flex-1 min-w-0 truncate text-gray-600">{om.materials?.name || '?'}</span>
                                          <span className="font-mono text-[10px] text-gray-400">{om.quantity}</span>
                                          {modeLabel && (
                                            <span className="text-[9px] text-brand-500 bg-brand-50 px-1 py-0.5 rounded">{modeLabel}</span>
                                          )}
                                          {om.materials?.price! > 0 && (
                                            <span className="text-[10px] text-accent-500 font-mono">{om.materials!.price}₽</span>
                                          )}
                                          <button onClick={() => setModal({ type: 'editBinding', binding: om })}
                                            className="text-gray-300 hover:text-brand-500 p-0.5"><Pencil className="w-3 h-3" /></button>
                                          <button onClick={() => delBinding(om.id)}
                                            className="text-gray-300 hover:text-red-500 p-0.5"><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {opts.length === 0 && (
                            <div className="text-[11px] text-gray-400 px-3 py-1">Нет вариантов</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {cats.length === 0 && (
                  <div className="text-[11px] text-gray-400 px-3 py-1">Нет категорий</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Модалки */}
      {modal?.type === 'category' && (
        <ModalAddSimple
          title={`Новая категория в «${modal.tabLabel}»`}
          placeholder="Название категории"
          onSave={(name) => { addCategory(modal.tabId as string, name); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'option' && (
        <ModalAddSimple
          title={`Новый вариант в «${modal.catName}»`}
          placeholder="Название (ДА, НЕТ, Балкон 3м...)"
          onSave={(name) => { addOption(modal.catId as number, name); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'binding' && (
        <ModalAddBinding
          title={`Привязка к «${modal.optionName}»`}
          materials={db.materials}
          onSave={(matId, qty, vis, cm) => { addBinding(modal.optionId as number, matId, qty, vis, cm); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'editBinding' && (
        <ModalEditBinding
          binding={modal.binding as OptionMaterial}
          onSave={(id, qty, vis, cm) => { updateBinding(id, qty, vis, cm); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}