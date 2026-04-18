import { useMemo } from 'react';
import { useCalcStore } from '@store/calcStore';
import type { Category, CategoryOption, CalcDB } from '@modules/calculator/api/calcApi';
import { Sel } from '../primitives';
import { MatRow } from '../MatRow';
import { HiddenMats } from '../HiddenMats';
import { DimsBlock } from '../DimsBlock';
import { BBBlock } from './BBBlock';
import { WindowsBlock } from './WindowsBlock';
import { SidingBlock } from './SidingBlock';
import { RoofBlock } from './RoofBlock';

// Главный блок для вкладки «Остекление».
// Оркестрирует под-блоки: Основная Рама, Балконный Блок, Окна, Сайдинг, Крыша.
export function GlazingBlock({ tabId, db }: { tabId: string; db: CalcDB }) {
  const store = useCalcStore();
  const { getOpt, setOpt, getQty, setQty, isRemoved, toggleRemove, getBlockDims } = store;
  const tabCats = useMemo(() => db.categories.filter((c) => c.tab_id === tabId), [db, tabId]);

  // «Что делаем» — определяем тип (балкон / лоджия)
  const whatDoCat = tabCats.find((c) => {
    const n = c.name.toLowerCase();
    return n.includes('что дел') || n === 'вариант';
  });
  const whatDoOptId = whatDoCat ? getOpt(tabId, whatDoCat.id) : null;
  const whatDoOpt = whatDoOptId ? db.options.find((o) => o.id === whatDoOptId) : null;
  const whatDoName = (whatDoOpt?.name || '').toLowerCase();
  const isBalcony = whatDoName.includes('балкон');
  const isLodzhia = whatDoName.includes('лоджи');

  // Фильтрация рамы по типу
  const filterFrameOpts = (cat: Category, opts: CategoryOption[]) => {
    const cn = cat.name.toLowerCase();
    if (cn.includes('основная рама') || cn === 'рама') {
      if (!whatDoOpt) return opts;
      if (isBalcony) return opts.filter((o) => {
        const n = o.name.toLowerCase();
        return n.includes('п-образ') || n.includes('г-образ');
      });
      if (isLodzhia) return opts.filter((o) => {
        const n = o.name.toLowerCase();
        return n.includes('прямое') || n.includes('прям');
      });
    }
    return opts;
  };

  // Категория «Основная Рама»
  const frameCat = tabCats.find((c) => {
    const n = c.name.toLowerCase();
    return n.includes('основная рама') || n === 'рама';
  });
  const frameOptId = frameCat ? getOpt(tabId, frameCat.id) : null;
  const frameOpt = frameOptId ? db.options.find((o) => o.id === frameOptId) : null;
  const frameSelected = !!frameOpt && frameOpt.name !== 'Нет' && frameOpt.name !== 'НЕТ';

  // Блоки размеров
  const glazingDims = getBlockDims(tabId, '_glazingDims');

  // Сайдинг
  const sidingCat = tabCats.find((c) => c.name.toLowerCase().includes('сайдинг'));
  const sidingOptId = sidingCat ? getOpt(tabId, sidingCat.id) : null;
  const sidingOpt = sidingOptId ? db.options.find((o) => o.id === sidingOptId) : null;
  const sidingName = (sidingOpt?.name || '').toLowerCase();
  const needSiding = sidingOpt && sidingName !== 'нет' && sidingName !== '' && sidingName !== '— не выбрано —';

  const sidingDims = getBlockDims(tabId, '_sidingDims');
  const sidingDir = ((store.getSel(tabId))._sidingDir as string) || 'horizontal';

  // Скрытая категория?
  const isHiddenCat = (cat: Category) => {
    const cn = cat.name.toLowerCase();
    return cn.includes('материалы для установки') || cn.includes('материалы установки');
  };

  // Определяем тип категории
  const getCatType = (cat: Category) => {
    const cn = cat.name.toLowerCase();
    if (cn.includes('что дел') || cn === 'вариант') return 'whatdo';
    if (cn.includes('основная рама') || cn === 'рама') return 'frame';
    if (cn.includes('балконн')) return 'bb';
    if (cn.includes('окно') && !cn.includes('материалы')) return 'window';
    if (cn.includes('сайдинг')) return 'siding';
    if (cn.includes('крыш')) return 'roof';
    return 'other';
  };

  return (
    <div className="space-y-4">
      {tabCats.map((cat) => {
        if (isHiddenCat(cat)) return null;

        const catType = getCatType(cat);
        const allOpts = db.options.filter((o) => o.category_id === cat.id);
        const opts = catType === 'frame' ? filterFrameOpts(cat, allOpts) : allOpts;
        const selectedId = getOpt(tabId, cat.id);
        const selectedOpt = opts.find((o) => o.id === selectedId);
        const mats = selectedOpt ? db.optionMaterials.filter((om) => om.option_id === selectedOpt.id) : [];
        const visibleMats = mats.filter((m) => m.visible);
        const hiddenMats = mats.filter((m) => !m.visible);
        const isActive = selectedOpt && selectedOpt.name !== 'Нет' && selectedOpt.name !== 'НЕТ';

        // Label
        const catLabel = catType === 'whatdo' ? 'Что делаем' : cat.name;

        return (
          <div key={cat.id} className="card p-4">
            <Sel
              label={catLabel}
              value={selectedId || ''}
              onChange={(v) => setOpt(tabId, cat.id, v ? Number(v) : null)}
              options={[
                { value: '', label: '— Не выбрано —' },
                ...opts.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />

            {/* Подсказка фильтрации рамы */}
            {catType === 'frame' && whatDoOpt && (
              <div className="text-[11px] text-gray-400 -mt-2 mb-2 px-1">
                {isBalcony ? 'Балкон → П-образное / Г-образное' : isLodzhia ? 'Лоджия → Прямое' : ''}
              </div>
            )}

            {/* ═══ Основная Рама ═══ */}
            {catType === 'frame' && frameSelected && (
              <div>
                <DimsBlock label="Основная Рама" tabId={tabId} dimsKey="_glazingDims" />
                {/* Открытые материалы */}
                {visibleMats.map((om) => {
                  if (isRemoved(tabId, cat.id, om.id)) return (
                    <MatRow key={om.id} om={om} qty={0} hint="" modeLabel="" isHidden={false}
                      isRemoved={true} onQtyChange={() => {}} onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
                  );
                  return (
                    <MatRow key={om.id} om={om}
                      qty={getQty(tabId, cat.id, om.material_id) ?? om.quantity}
                      hint="" modeLabel=""
                      isHidden={false} isRemoved={false}
                      onQtyChange={(q) => setQty(tabId, cat.id, om.material_id, q)}
                      onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)}
                    />
                  );
                })}
                {/* Скрытые с calc_mode */}
                <HiddenMats mats={hiddenMats} tabId={tabId} catId={cat.id}
                  hMm={glazingDims.height} wMm={glazingDims.length} direction="vertical" />
              </div>
            )}

            {/* ═══ Замена балконного блока ═══ */}
            {catType === 'bb' && isActive && (
              <BBBlock tabId={tabId} cat={cat} mats={mats} />
            )}

            {/* ═══ Окна (массив) ═══ */}
            {catType === 'window' && isActive && (
              <WindowsBlock tabId={tabId} cat={cat} mats={mats} />
            )}

            {/* ═══ Сайдинг ═══ */}
            {catType === 'siding' && needSiding && (
              <SidingBlock tabId={tabId} visibleMats={visibleMats} sidingDims={sidingDims} sidingDir={sidingDir} />
            )}

            {/* ═══ Крыша ═══ */}
            {catType === 'roof' && isActive && (
              <RoofBlock tabId={tabId} cat={cat} visibleMats={visibleMats} hiddenMats={hiddenMats} />
            )}

            {/* ═══ Стандартные категории (не спец-блоки) ═══ */}
            {catType === 'other' && catType !== 'whatdo' && (
              <>
                {visibleMats.map((om) => {
                  if (isRemoved(tabId, cat.id, om.id)) return (
                    <MatRow key={om.id} om={om} qty={0} hint="" modeLabel="" isHidden={false}
                      isRemoved={true} onQtyChange={() => {}} onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
                  );
                  const userQ = getQty(tabId, cat.id, om.material_id);
                  const qty = userQ !== undefined ? userQ : (om.quantity || 0);
                  return (
                    <MatRow key={om.id} om={om} qty={qty} hint="" modeLabel=""
                      isHidden={false} isRemoved={false}
                      onQtyChange={(q) => setQty(tabId, cat.id, om.material_id, q)}
                      onToggleRemove={() => toggleRemove(tabId, cat.id, om.id)} />
                  );
                })}
                <HiddenMats mats={hiddenMats} tabId={tabId} catId={cat.id}
                  hMm={glazingDims.height} wMm={glazingDims.length} direction="vertical" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
