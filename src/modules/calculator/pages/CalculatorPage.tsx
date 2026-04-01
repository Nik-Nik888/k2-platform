import { useEffect, useMemo } from 'react';
import { useCalcStore } from '@store/calcStore';
import {
  TABS, SURFACE_IDS, CALC_MODE_LABELS,
  calcByMode, calcMatQty, calcInsulation, parseDims,
} from '@modules/calculator/api/calcApi';
import type { Category, CategoryOption, OptionMaterial, Material } from '@modules/calculator/api/calcApi';
import { Loader2, AlertCircle } from 'lucide-react';

// ── Число-инпут ─────────────────────────────────────────
function NI({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block font-medium">{label}</label>
      <input
        type="number" min="0" value={value || ''}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="input py-2 text-sm w-24 text-right font-mono"
      />
    </div>
  );
}

// ── Селект ──────────────────────────────────────────────
function Sel({ label, value, onChange, options }: {
  label: string; value: string | number;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
}) {
  return (
    <div className="mb-3">
      <label className="text-xs text-gray-500 mb-1 block font-semibold uppercase tracking-wider">{label}</label>
      <select
        value={value || ''} onChange={(e) => onChange(e.target.value)}
        className="input py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Материал-строка ─────────────────────────────────────
function MatRow({ om, qty, hint, modeLabel, isHidden, isRemoved, onQtyChange, onToggleRemove }: {
  om: OptionMaterial; qty: number; hint: string; modeLabel: string;
  isHidden: boolean; isRemoved: boolean;
  onQtyChange: (q: number) => void; onToggleRemove: () => void;
}) {
  const mat = om.materials;
  if (!mat) return null;

  if (isRemoved) {
    return (
      <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg opacity-50 ${isHidden ? 'bg-gray-50' : 'bg-surface-50'}`}>
        <span className="text-xs text-gray-400 line-through">{mat.name}</span>
        <button onClick={onToggleRemove} className="text-xs text-brand-500 hover:underline">↩ вернуть</button>
      </div>
    );
  }

  const cost = mat.price > 0 && qty > 0 ? mat.price * qty : 0;

  return (
    <div className={`rounded-lg p-2.5 mb-1.5 ${isHidden ? 'bg-gray-50' : 'bg-surface-50 border border-surface-200'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`flex-1 min-w-0 truncate ${isHidden ? 'text-xs text-gray-500' : 'text-sm text-gray-700'}`}>
          {mat.name}
        </span>
        {modeLabel && (
          <span className="text-[10px] text-gray-400 bg-white px-1.5 py-0.5 rounded">{modeLabel}</span>
        )}
        {mat.price > 0 && (
          <span className="text-[11px] text-accent-500 font-mono font-semibold">{mat.price}₽</span>
        )}
        <input
          type="number" min="0"
          value={qty === 0 ? '' : qty}
          onChange={(e) => onQtyChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className={`text-right font-mono outline-none border border-surface-300 rounded-lg bg-white
            ${isHidden ? 'w-14 px-1.5 py-1 text-xs' : 'w-16 px-2 py-1.5 text-sm'}
            focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500`}
        />
        <span className="text-[10px] text-gray-400">{mat.unit || 'шт.'}</span>
        {cost > 0 && (
          <span className="text-xs text-emerald-600 font-mono font-bold">={cost.toLocaleString('ru')}₽</span>
        )}
        <button onClick={onToggleRemove} className="text-gray-300 hover:text-red-500 text-sm px-1">✕</button>
      </div>
      {hint && <div className="text-[10px] text-brand-500 mt-1 px-1">{hint}</div>}
    </div>
  );
}

// ── Скрытые материалы (секция) ──────────────────────────
function HiddenMats({ mats, tabId, catId, hMm, wMm, direction }: {
  mats: OptionMaterial[]; tabId: string; catId: number;
  hMm: number; wMm: number; direction: string;
}) {
  const { getQty, setQty, isRemoved, toggleRemove } = useCalcStore();
  const activeMats = mats.filter((om) => !isRemoved(tabId, catId, om.id));

  if (mats.length === 0) return null;

  return (
    <details className="mt-2">
      <summary className="text-xs text-amber-600 cursor-pointer font-semibold py-1">
        🔒 Авто ({activeMats.length}/{mats.length})
      </summary>
      <div className="mt-1 space-y-0.5">
        {mats.map((om) => {
          const mode = om.calc_mode || 'fixed';
          const res = calcByMode(om.quantity || 0, mode, om.materials, hMm, wMm, direction);
          const userQ = getQty(tabId, catId, om.material_id);
          const qty = userQ !== undefined ? userQ : res.qty;

          return (
            <MatRow
              key={om.id} om={om} qty={qty} hint={res.hint}
              modeLabel={CALC_MODE_LABELS[mode] || ''}
              isHidden={true}
              isRemoved={isRemoved(tabId, catId, om.id)}
              onQtyChange={(q) => setQty(tabId, catId, om.material_id, q)}
              onToggleRemove={() => toggleRemove(tabId, catId, om.id)}
            />
          );
        })}
      </div>
    </details>
  );
}

// ── Вкладка с динамическим содержимым ───────────────────
function DynTab({ tabId }: { tabId: string }) {
  const { db, getOpt, setOpt, getDims, setDim, getDir, setDir, getQty, setQty, isRemoved, toggleRemove } = useCalcStore();
  if (!db) return null;

  const tabCats = useMemo(() => db.categories.filter((c) => c.tab_id === tabId), [db, tabId]);
  const isSurface = SURFACE_IDS.includes(tabId);
  const isGlazing = tabId === 'glazing';
  const isFloor = tabId === 'floor';
  const isMainWall = tabId === 'main_wall';

  const dims = getDims(tabId);
  const dir = getDir(tabId);
  const hMm = dims.height;
  const wMm = dims.length;
  const hM = hMm / 1000;
  const wM = wMm / 1000;
  const rawArea = hM * wM;
  const area = rawArea; // TODO: subtract window area for main_wall
  const perimM = hM > 0 && wM > 0 ? 2 * (hM + wM) : 0;

  return (
    <div className="space-y-4">
      {/* Размеры для поверхностей */}
      {isSurface && (
        <div className="card p-4">
          <div className="flex gap-3 flex-wrap items-end mb-3">
            <NI label={isFloor ? 'Длина (мм)' : 'Высота (мм)'} value={hMm} onChange={(v) => setDim(tabId, 'height', v)} />
            <NI label="Ширина (мм)" value={wMm} onChange={(v) => setDim(tabId, 'length', v)} />
            {rawArea > 0 && (
              <div className="bg-brand-50 text-brand-700 font-mono text-sm font-bold px-3 py-2 rounded-lg mb-1">
                {area.toFixed(2)} м²
              </div>
            )}
          </div>
          {!isFloor && (
            <div className="flex gap-2">
              <button
                onClick={() => setDir(tabId, 'vertical')}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  dir === 'vertical' ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium' : 'border-surface-200 text-gray-600'
                }`}
              >↕ Вертикально</button>
              <button
                onClick={() => setDir(tabId, 'horizontal')}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  dir === 'horizontal' ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium' : 'border-surface-200 text-gray-600'
                }`}
              >↔ Горизонтально</button>
            </div>
          )}
          {(hMm > 0 || wMm > 0) && (
            <div className="text-xs text-brand-500 mt-2 font-mono">
              📏 P={perimM.toFixed(2)}м • W={wM.toFixed(2)}м • H={hM.toFixed(2)}м • S={area.toFixed(2)}м²
            </div>
          )}
        </div>
      )}

      {/* Категории */}
      {tabCats.map((cat) => {
        const allOpts = db.options.filter((o) => o.category_id === cat.id);
        const selectedId = getOpt(tabId, cat.id);
        const selectedOpt = allOpts.find((o) => o.id === selectedId);
        const mats = selectedOpt ? db.optionMaterials.filter((om) => om.option_id === selectedOpt.id) : [];
        const visibleMats = mats.filter((m) => m.visible);
        const hiddenMats = mats.filter((m) => !m.visible);

        const cn = cat.name.toLowerCase();
        const isFinish = isSurface && cat.name === 'Вид отделки';
        const isInsul = isSurface && cn.includes('утепл');
        const isPaint = isSurface && cn.includes('покраск');
        const isHiddenCat = cn.includes('материалы для установки');

        if (isHiddenCat) return null;

        return (
          <div key={cat.id} className="card p-4">
            <Sel
              label={cat.name}
              value={selectedId || ''}
              onChange={(v) => setOpt(tabId, cat.id, v ? Number(v) : null)}
              options={[
                { value: '', label: '— Не выбрано —' },
                ...allOpts.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />

            {/* Отделка: авторасчёт количества */}
            {isFinish && selectedOpt && selectedOpt.name !== 'Нет' && area > 0 && (
              <div className="space-y-2">
                {visibleMats.map((om) => {
                  if (isRemoved(tabId, cat.id, om.id)) {
                    return (
                      <MatRow key={om.id} om={om} qty={0} hint="" modeLabel="" isHidden={false}
                        isRemoved={true} onQtyChange={() => {}} onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
                    );
                  }
                  const defQty = calcMatQty(hMm, wMm, om.materials?.description, dir);
                  const userQty = getQty(tabId, cat.id, om.material_id);
                  const qty = userQty !== undefined ? userQty : defQty;
                  const cost = (om.materials?.price || 0) * qty;

                  return (
                    <div key={om.id} className="bg-surface-50 border border-surface-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-brand-700">{om.materials?.name}</span>
                        <div className="flex items-center gap-2">
                          <input type="number" min="0" value={qty}
                            onChange={(e) => setQty(tabId, cat.id, om.material_id, e.target.value === '' ? 0 : Number(e.target.value))}
                            className="w-16 px-2 py-1.5 text-right font-mono text-sm border border-surface-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-500/20"
                          />
                          <span className="text-xs text-gray-400">шт.</span>
                          <button onClick={() => toggleRemove(tabId, cat.id, om.id)} className="text-gray-300 hover:text-red-500 px-1">✕</button>
                        </div>
                      </div>
                      {userQty !== undefined && userQty !== defQty && (
                        <div className="text-[10px] text-amber-600 mb-1">⚠ Изменено (авто: {defQty})</div>
                      )}
                      <div className="text-[10px] text-gray-400">{dir === 'vertical' ? '↕' : '↔'} • {om.materials?.description || '?'}</div>
                      {cost > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {om.materials?.price}₽ × {qty} = <span className="text-emerald-600 font-bold">{cost.toLocaleString('ru')}₽</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Утепление */}
            {isInsul && selectedOpt && selectedOpt.name !== 'Нет' && area > 0 && visibleMats.map((om) => {
              if (isRemoved(tabId, cat.id, om.id)) return null;
              const qty = calcInsulation(area);
              return (
                <div key={om.id} className="flex items-center gap-2 p-2.5 bg-surface-50 rounded-lg">
                  <span className="flex-1 text-sm text-gray-600">{om.materials?.name}</span>
                  <span className="font-mono text-sm font-bold text-emerald-600">{qty} шт.</span>
                  {om.materials?.price && om.materials.price > 0 && (
                    <span className="text-xs text-emerald-600 font-mono">={(om.materials.price * qty).toLocaleString('ru')}₽</span>
                  )}
                </div>
              );
            })}

            {/* Покраска */}
            {isPaint && selectedOpt && selectedOpt.name !== 'Нет' && area > 0 && (
              <div className="bg-surface-50 rounded-lg p-3 border border-surface-200">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-500">🎨 Краска (1л/7м²)</span>
                  <span className="font-mono font-bold text-emerald-600">{Math.round(area / 7 * 100) / 100} л.</span>
                </div>
              </div>
            )}

            {/* Стандартные открытые материалы */}
            {!isFinish && !isInsul && !isPaint && visibleMats.map((om) => {
              if (isRemoved(tabId, cat.id, om.id)) {
                return (
                  <MatRow key={om.id} om={om} qty={0} hint="" modeLabel="" isHidden={false}
                    isRemoved={true} onQtyChange={() => {}} onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
                );
              }
              const userQ = getQty(tabId, cat.id, om.material_id);
              const qty = userQ !== undefined ? userQ : (om.quantity || 0);
              return (
                <MatRow
                  key={om.id} om={om} qty={qty} hint="" modeLabel=""
                  isHidden={false} isRemoved={false}
                  onQtyChange={(q) => setQty(tabId, cat.id, om.material_id, q)}
                  onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)}
                />
              );
            })}

            {/* Скрытые материалы с calc_mode */}
            <HiddenMats mats={hiddenMats} tabId={tabId} catId={cat.id} hMm={hMm} wMm={wMm} direction={dir} />
          </div>
        );
      })}

      {tabCats.length === 0 && (
        <div className="card p-8 text-center text-gray-400 text-sm">
          Нет категорий для этой вкладки. Добавьте через Справочник.
        </div>
      )}
    </div>
  );
}

// ── Главная страница калькулятора ────────────────────────
export function CalculatorPage() {
  const { db, isLoading, error, activeTab, setActiveTab, loadData } = useCalcStore();

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading && !db) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <span className="ml-3 text-gray-500">Загрузка калькулятора...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        <AlertCircle className="w-4 h-4 shrink-0" />
        {error}
      </div>
    );
  }

  const activeTabInfo = TABS.find((t) => t.id === activeTab);

  // Подсчёт итого по всем вкладкам
  // (упрощённый — считает только видимые материалы с ручным количеством)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Калькулятор материалов</h1>
        <p className="text-sm text-gray-500 mt-1">
          {db ? `${db.materials.length} материалов · ${db.categories.length} категорий` : 'Загрузка...'}
        </p>
      </div>

      {/* Вкладки */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 lg:-mx-6 lg:px-6">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const tabCats = db?.categories.filter((c) => c.tab_id === tab.id) || [];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all
                ${isActive
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-white border border-surface-200 text-gray-600 hover:border-brand-300 hover:text-brand-600'
                }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {tabCats.length > 0 && !isActive && (
                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  {tabCats.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Заголовок активной вкладки */}
      {activeTabInfo && (
        <div className="flex items-center gap-2">
          <span className="text-xl">{activeTabInfo.icon}</span>
          <h2 className="text-lg font-bold text-gray-900">{activeTabInfo.label}</h2>
        </div>
      )}

      {/* Содержимое вкладки */}
      <DynTab tabId={activeTab} />
    </div>
  );
}
