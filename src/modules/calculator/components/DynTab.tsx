import { useMemo } from 'react';
import { useCalcStore } from '@store/calcStore';
import {
  SURFACE_IDS,
  calcMatQty, calcInsulation,
} from '@modules/calculator/api/calcApi';

import { NI, Sel, DirToggle, DimsInfo } from './primitives';
import { MatRow } from './MatRow';
import { HiddenMats } from './HiddenMats';
import { GlazingBlock } from './blocks/GlazingBlock';
import { FurnitureBlock } from './blocks/FurnitureBlock';

// Динамическая вкладка калькулятора.
// Сама решает какой рендер показать — Остекление / Мебель / поверхность /
// электрика / экстрас — на основе tabId и категорий в базе.
export function DynTab({ tabId }: { tabId: string }) {
  const { db, getOpt, setOpt, getDims, setDim, getDir, setDir, getQty, setQty, isRemoved, toggleRemove, getSel, setExtra } = useCalcStore();

  const tabCats = useMemo(
    () => db ? db.categories.filter((c) => c.tab_id === tabId) : [],
    [db, tabId]
  );

  if (!db) return null;

  const isSurface = SURFACE_IDS.includes(tabId);
  const isGlazing = tabId === 'glazing';
  const isFurniture = tabId === 'furniture';
  const isFloor = tabId === 'floor';
  const isCeiling = tabId === 'ceiling';
  const isMainWall = tabId === 'main_wall';
  // Полы и потолок — это горизонтальные плоскости, у них нет "высоты",
  // только длина × ширина. Подстановка размеров берётся с фасадной стены.
  const isHorizontal = isFloor || isCeiling;

  const dims = getDims(tabId);
  const dir = getDir(tabId);
  const hMm = dims.height;
  const wMm = dims.length;
  const hM = hMm / 1000;
  const wM = wMm / 1000;
  const rawArea = hM * wM;

  // Балконный блок на главной стене
  const ts = getSel(tabId);
  const hasWindow = isMainWall && !!ts._hasWindow;
  const bbDoorH = (ts._mwBbDoorH as number) || 2100;
  const bbDoorW = (ts._mwBbDoorW as number) || 700;
  const bbWinH = (ts._mwBbWinH as number) || 1400;
  const bbWinW = (ts._mwBbWinW as number) || 900;
  const windowArea = (bbDoorH / 1000) * (bbDoorW / 1000) + (bbWinH / 1000) * (bbWinW / 1000);
  const area = isMainWall && hasWindow ? Math.max(0, rawArea - windowArea) : rawArea;

  // Размеры с других стен для подсказок
  const mainDims = getDims('main_wall');
  const facadeDims = getDims('facade_wall');
  const blDims = getDims('bl_wall');
  const mainH = mainDims.height;
  const mainW = mainDims.length;
  const facadeW = facadeDims.length;
  const blW = blDims.length;

  // ── Остекление ──
  if (isGlazing) return <GlazingBlock tabId={tabId} db={db} />;

  // ── Мебель ──
  if (isFurniture) return <FurnitureBlock tabId={tabId} db={db} />;

  return (
    <div className="space-y-4">
      {/* Размеры для поверхностей */}
      {isSurface && (
        <div className="card p-4">
          <div className="flex gap-3 flex-wrap items-end mb-3">
            <NI label={isHorizontal ? 'Длина (мм)' : 'Высота (мм)'} value={hMm} onChange={(v) => setDim(tabId, 'height', v)} />
            <NI label="Ширина (мм)" value={wMm} onChange={(v) => setDim(tabId, 'length', v)} />
            {rawArea > 0 && (
              <div className="bg-brand-50 text-brand-700 font-mono text-sm font-bold px-3 py-2 rounded-lg mb-1">
                {area.toFixed(2)} м²{isMainWall && hasWindow ? ` (−${windowArea.toFixed(2)} окно)` : ''}
              </div>
            )}
          </div>

          {/* Подсказки размеров */}
          {!isHorizontal && !isMainWall && !hMm && mainH > 0 && (
            <button onClick={() => setDim(tabId, 'height', mainH)}
              className="text-[11px] text-brand-600 bg-brand-50 border border-brand-200 px-2.5 py-1.5 rounded-lg hover:bg-brand-100 transition-colors mb-2 inline-block">
              💡 Высота как на главной: {mainH} мм
            </button>
          )}
          {isHorizontal && !hMm && (facadeW > 0 || mainW > 0) && (
            <button onClick={() => { setDim(tabId, 'height', facadeW || mainW); setDim(tabId, 'length', blW || 1000); }}
              className="text-[11px] text-brand-600 bg-brand-50 border border-brand-200 px-2.5 py-1.5 rounded-lg hover:bg-brand-100 transition-colors mb-2 inline-block">
              💡 Подставить: {facadeW || mainW} × {blW || 1000} мм
            </button>
          )}

          {/* Балконный блок на главной стене */}
          {isMainWall && (
            <div className="mb-3">
              <label className="flex items-center gap-3 cursor-pointer select-none py-2">
                <div onClick={() => setExtra(tabId, '_hasWindow', !hasWindow)}
                  className={`w-10 h-6 rounded-full flex-shrink-0 relative transition-colors cursor-pointer ${hasWindow ? 'bg-brand-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${hasWindow ? 'left-[18px]' : 'left-0.5'}`} />
                </div>
                <span className="text-sm">🪟 Есть балконный блок</span>
              </label>
              {hasWindow && (
                <div className="bg-surface-50 rounded-xl p-3 border border-surface-200 mt-2">
                  <div className="flex gap-4 flex-wrap mb-2">
                    <div>
                      <div className="text-[11px] text-gray-400 font-semibold mb-1">🚪 Дверь</div>
                      <div className="flex gap-2">
                        <NI label="H мм" value={bbDoorH} onChange={(v) => setExtra(tabId, '_mwBbDoorH', v)} />
                        <NI label="W мм" value={bbDoorW} onChange={(v) => setExtra(tabId, '_mwBbDoorW', v)} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-400 font-semibold mb-1">🪟 Окно</div>
                      <div className="flex gap-2">
                        <NI label="H мм" value={bbWinH} onChange={(v) => setExtra(tabId, '_mwBbWinH', v)} />
                        <NI label="W мм" value={bbWinW} onChange={(v) => setExtra(tabId, '_mwBbWinW', v)} />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-brand-600 font-mono bg-brand-50 px-3 py-2 rounded-lg">
                    <span>Вычет S = {windowArea.toFixed(2)} м²</span>
                    <span>({bbDoorW}+{bbWinW} = {bbDoorW + bbWinW} мм)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isFloor && <DirToggle dir={dir} onDir={(d) => setDir(tabId, d)} />}

          {(hMm > 0 || wMm > 0) && (
            <DimsInfo hMm={hMm} wMm={wMm} />
          )}
        </div>
      )}

      {/* Категории */}
      {tabCats.map((cat) => {
        const cn = cat.name.toLowerCase();
        const isHiddenCat = cn.includes('материалы для установки') || cn.includes('материалы установки');
        if (isHiddenCat) return null;

        const allOpts = db.options.filter((o) => o.category_id === cat.id);
        const selectedId = getOpt(tabId, cat.id);
        const selectedOpt = allOpts.find((o) => o.id === selectedId);
        const mats = selectedOpt ? db.optionMaterials.filter((om) => om.option_id === selectedOpt.id) : [];
        const visibleMats = mats.filter((m) => m.visible);
        const hiddenMats = mats.filter((m) => !m.visible);

        const isFinish = isSurface && cat.name === 'Вид отделки';
        const isInsul = isSurface && cn.includes('утепл');
        const isPaint = isSurface && cn.includes('покраск');

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

            {/* Отделка: авторасчёт */}
            {isFinish && selectedOpt && selectedOpt.name !== 'Нет' && area > 0 && (
              <div className="space-y-2">
                {visibleMats.map((om) => {
                  if (isRemoved(tabId, cat.id, om.id)) {
                    return (
                      <MatRow key={om.id} om={om} qty={0} hint="" modeLabel="" isHidden={false}
                        isRemoved={true} onQtyChange={() => {}} onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
                    );
                  }
                  let effH = hMm, effW = wMm;
                  if (isMainWall && hasWindow && rawArea > 0) {
                    effW = Math.round(wMm * (area / rawArea));
                  }
                  const defQty = calcMatQty(effH, effW, om.materials?.description, dir);
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

            {/* Стандартные открытые */}
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

            {/* Скрытые */}
            {!isFinish && (
              <HiddenMats mats={hiddenMats} tabId={tabId} catId={cat.id} hMm={hMm} wMm={wMm} direction={dir} />
            )}

            {/* Скрытые для отделки */}
            {isFinish && selectedOpt && selectedOpt.name !== 'Нет' && area > 0 && (
              <HiddenMats mats={hiddenMats} tabId={tabId} catId={cat.id}
                hMm={hMm}
                wMm={isMainWall && hasWindow && rawArea > 0 ? Math.round(wMm * (area / rawArea)) : wMm}
                direction={dir} />
            )}
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
