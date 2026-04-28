import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { ProjectConfig } from '../../types';
import type { GlazingCategoryKey, GlazingCategoryWithItems } from '../../api/glazingApi';

// ═══════════════════════════════════════════════════════════════════
// ConfigPopup — большой попап настроек проекта остекления.
//
// Показывает все настройки одним длинным скроллом с цветными разделами
// (как в PVC Studio v44.4, фото 7-10):
//
//   • Количество (счётчик)
//   • Заметка (textarea)
//   • Своя цена (override итога)
//   • Финансовая схема (скидки 0/1/3/5%)
//   • Оконная система (radio из справочника profiles)
//   • Тип стеклопакетов (radio из glass)
//   • Тип отливов (multi из ebbs)
//   • Тип подоконников (multi из sills)
//   • Фурнитура (radio из hardware)
//   • Разное (multi из miscs)
//   • Работы (multi из works)
//   • Москитные сетки (radio из mosquito)
//   • Ламинация внутр. (radio из laminationIn) — все цвета
//   • Ламинация внешн. (radio из laminationOut)
//   • Дополнения по размеру (multi из addons)
//   • Соединительные профили (multi из connectors)
//   • Соединительные профили 90° (multi из connectors90)
//   • Соединительные профили 135° (multi из connectors135)
//   • Нащельники (multi из overlaps)
//   • Доборные профили (multi из extensions)
//
// Изменения применяются по нажатию OK через onSave (одним патчем).
// Закрытие без сохранения — крестик / Esc / тап вне попапа.
// ═══════════════════════════════════════════════════════════════════

type Reference = Partial<Record<GlazingCategoryKey, GlazingCategoryWithItems>>;

interface ConfigPopupProps {
  current: ProjectConfig;
  reference: Reference;
  onClose: () => void;
  onSave: (patch: Partial<ProjectConfig>) => void;
}

/**
 * Заполнить недостающие поля конфига дефолтами. Защита от старых
 * проектов (созданных до добавления новых полей в ProjectConfig) —
 * чтобы массивы и числа никогда не были undefined.
 */
function normalizeConfig(c: ProjectConfig): ProjectConfig {
  return {
    profileSystemId: c.profileSystemId ?? null,
    glassId: c.glassId ?? null,
    hardwareId: c.hardwareId ?? null,
    laminationInnerId: c.laminationInnerId ?? null,
    laminationOuterId: c.laminationOuterId ?? null,
    quantity: c.quantity ?? 1,
    sills: c.sills ?? [],
    ebbs: c.ebbs ?? [],
    mosquitos: c.mosquitos ?? [],
    addons: c.addons ?? [],
    extensions: c.extensions ?? [],
    overlaps: c.overlaps ?? [],
    connectors: c.connectors ?? [],
    connectors90: c.connectors90 ?? [],
    connectors135: c.connectors135 ?? [],
    works: c.works ?? [],
    miscs: c.miscs ?? [],
    discountPercent: (c.discountPercent ?? 0) as 0 | 1 | 3 | 5,
    customPrice: c.customPrice ?? null,
    note: c.note ?? '',
  };
}

export function ConfigPopup({ current, reference, onClose, onSave }: ConfigPopupProps) {
  // Локальная копия конфига — изменения не применяются пока не нажат OK.
  // Подстраховываемся от старых проектов в localStorage без новых полей —
  // дописываем дефолты для всех массивов, чтобы .map() не падал.
  const [draft, setDraft] = useState<ProjectConfig>(() => normalizeConfig(current));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function patch<K extends keyof ProjectConfig>(key: K, value: ProjectConfig[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  // Хелпер: получить материалы из справочника по ключу категории
  const mats = (key: GlazingCategoryKey) => reference[key]?.materials ?? [];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-hidden shadow-xl flex flex-col">
        {/* Шапка */}
        <SectionHeader title="настройки окна" color="bg-cyan-400" />
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Прокручиваемое содержимое */}
        <div className="overflow-y-auto flex-1">
          {/* Количество */}
          <SectionSubHeader>количество</SectionSubHeader>
          <div className="px-3 py-2 flex items-center gap-2">
            <button
              onClick={() => patch('quantity', Math.max(1, draft.quantity - 1))}
              className="w-9 h-9 rounded-lg border-2 border-surface-200 text-lg font-bold text-gray-700"
            >−</button>
            <input
              type="number"
              min={1}
              value={draft.quantity}
              onChange={(e) => patch('quantity', Math.max(1, parseInt(e.target.value || '1', 10)))}
              className="input flex-1 text-center text-base font-semibold"
            />
            <button
              onClick={() => patch('quantity', draft.quantity + 1)}
              className="w-9 h-9 rounded-lg border-2 border-surface-200 text-lg font-bold text-gray-700"
            >+</button>
          </div>

          {/* Заметка */}
          <SectionSubHeader>заметка</SectionSubHeader>
          <div className="px-3 py-2">
            <textarea
              value={draft.note}
              onChange={(e) => patch('note', e.target.value)}
              placeholder="Произвольная заметка к проекту…"
              className="input w-full min-h-[44px] text-sm"
              rows={2}
            />
          </div>

          {/* Своя цена */}
          <SectionSubHeader color="bg-yellow-400">своя цена</SectionSubHeader>
          <div className="px-3 py-2 flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={draft.customPrice ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                patch('customPrice', v === '' ? null : Math.max(0, parseFloat(v)));
              }}
              placeholder="не учитывать"
              className="input flex-1 text-sm"
            />
            <span className="text-xs text-gray-500">₽</span>
          </div>

          {/* Финансовая схема */}
          <SectionSubHeader color="bg-pink-400">финансовая схема</SectionSubHeader>
          <RadioGroup
            value={draft.discountPercent}
            onChange={(v) => patch('discountPercent', v as 0 | 1 | 3 | 5)}
            options={[
              { value: 0, label: 'не учитывать' },
              { value: 1, label: 'скидка 1%' },
              { value: 3, label: 'скидка 3%' },
              { value: 5, label: 'скидка 5%' },
            ]}
          />

          {/* Оконная система */}
          <SectionSubHeader color="bg-orange-400">оконная система</SectionSubHeader>
          <RadioFromMaterials
            materials={mats('profiles')}
            value={draft.profileSystemId}
            onChange={(id) => patch('profileSystemId', id)}
          />

          {/* Тип стеклопакетов */}
          <SectionSubHeader color="bg-blue-400">тип стеклопакетов</SectionSubHeader>
          <RadioFromMaterials
            materials={mats('glass')}
            value={draft.glassId}
            onChange={(id) => patch('glassId', id)}
          />

          {/* Тип отливов */}
          <SectionSubHeader color="bg-purple-400">тип отливов</SectionSubHeader>
          <CheckboxFromMaterials
            materials={mats('ebbs')}
            selected={draft.ebbs.map((e) => e.materialId)}
            onChange={(ids) => patch('ebbs', ids.map((id) => ({ materialId: id, length: 1 })))}
          />

          {/* Тип подоконников */}
          <SectionSubHeader color="bg-green-400">тип подоконников</SectionSubHeader>
          <CheckboxFromMaterials
            materials={mats('sills')}
            selected={draft.sills.map((s) => s.materialId)}
            onChange={(ids) => patch('sills', ids.map((id) => ({ materialId: id, length: 1 })))}
          />

          {/* Фурнитура */}
          <SectionSubHeader color="bg-pink-400">фурнитура</SectionSubHeader>
          <RadioFromMaterials
            materials={mats('hardware')}
            value={draft.hardwareId}
            onChange={(id) => patch('hardwareId', id)}
          />

          {/* Разное */}
          <SectionSubHeader color="bg-lime-400">разное</SectionSubHeader>
          <CheckboxFromMaterials
            materials={mats('miscs')}
            selected={draft.miscs.map((m) => m.materialId)}
            onChange={(ids) => patch('miscs', ids.map((id) => ({ materialId: id, quantity: 1 })))}
          />

          {/* Работы */}
          <SectionSubHeader color="bg-red-400">работы</SectionSubHeader>
          <CheckboxFromMaterials
            materials={mats('works')}
            selected={draft.works.map((w) => w.materialId)}
            onChange={(ids) => patch('works', ids.map((id) => ({ materialId: id, quantity: 1 })))}
          />

          {/* Москитные сетки */}
          <SectionSubHeader color="bg-orange-400">москитные сетки</SectionSubHeader>
          <CheckboxFromMaterials
            materials={mats('mosquito')}
            selected={draft.mosquitos.map((m) => m.materialId)}
            onChange={(ids) => patch('mosquitos', ids.map((id) => ({ materialId: id, quantity: 1 })))}
          />

          {/* Ламинация внутр. */}
          <SectionSubHeader color="bg-green-500">ламинация внутренняя</SectionSubHeader>
          <RadioFromMaterials
            materials={mats('laminationIn')}
            value={draft.laminationInnerId}
            onChange={(id) => patch('laminationInnerId', id)}
            withColorSwatch
          />

          {/* Ламинация внешн. */}
          <SectionSubHeader color="bg-teal-500">ламинация внешняя</SectionSubHeader>
          <RadioFromMaterials
            materials={mats('laminationOut')}
            value={draft.laminationOuterId}
            onChange={(id) => patch('laminationOuterId', id)}
            withColorSwatch
          />

          {/* Дополнения по размеру */}
          <SectionSubHeader color="bg-sky-400">дополнения по размеру</SectionSubHeader>
          <CheckboxFromMaterials
            materials={mats('addons')}
            selected={draft.addons.map((a) => a.materialId)}
            onChange={(ids) => patch('addons', ids.map((id) => ({ materialId: id, length: 1 })))}
          />

          {/* Соединительные профили */}
          <SectionSubHeader color="bg-blue-400">соединительные профили</SectionSubHeader>
          <CheckboxFromMaterials
            materials={mats('connectors')}
            selected={draft.connectors.map((c) => c.materialId)}
            onChange={(ids) => patch('connectors', ids.map((id) => ({ materialId: id, length: 1 })))}
          />

          {/* Соединительные профили 90° */}
          <SectionSubHeader color="bg-blue-400">соединительные профили 90°</SectionSubHeader>
          <CheckboxFromMaterials
            materials={mats('connectors90')}
            selected={draft.connectors90.map((c) => c.materialId)}
            onChange={(ids) => patch('connectors90', ids.map((id) => ({ materialId: id, length: 1 })))}
          />

          {/* Соединительные профили 135° */}
          <SectionSubHeader color="bg-blue-400">соединительные профили 135°</SectionSubHeader>
          <CheckboxFromMaterials
            materials={mats('connectors135')}
            selected={draft.connectors135.map((c) => c.materialId)}
            onChange={(ids) => patch('connectors135', ids.map((id) => ({ materialId: id, length: 1 })))}
          />

          {/* Нащельники */}
          <SectionSubHeader color="bg-blue-400">нащельники</SectionSubHeader>
          <CheckboxFromMaterials
            materials={mats('overlaps')}
            selected={draft.overlaps.map((o) => o.materialId)}
            onChange={(ids) => patch('overlaps', ids.map((id) => ({ materialId: id, length: 1 })))}
          />

          {/* Доборные профили */}
          <SectionSubHeader color="bg-blue-400">доборные профили</SectionSubHeader>
          <CheckboxFromMaterials
            materials={mats('extensions')}
            selected={draft.extensions.map((e) => e.materialId)}
            onChange={(ids) => patch('extensions', ids.map((id) => ({ materialId: id, length: 1 })))}
          />

          <div className="h-4" />
        </div>

        {/* Подвал — большая зелёная кнопка OK */}
        <button
          onClick={handleSave}
          className="bg-lime-500 hover:bg-lime-600 text-white font-bold py-3 text-base"
        >
          OK
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Подкомпоненты
// ═══════════════════════════════════════════════════════════════════

function SectionHeader({ title, color }: { title: string; color: string }) {
  return (
    <div className={`${color} text-white text-center text-sm font-semibold py-2`}>
      {title}
    </div>
  );
}

function SectionSubHeader({ children, color = 'bg-cyan-400' }: {
  children: React.ReactNode; color?: string;
}) {
  return (
    <div className={`${color} text-white text-center text-xs font-semibold py-1`}>
      {children}
    </div>
  );
}

function RadioGroup<T extends string | number>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="px-3 py-2 space-y-1">
      {options.map((opt) => (
        <label key={String(opt.value)} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
          <input
            type="radio"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="w-4 h-4"
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function RadioFromMaterials({ materials, value, onChange, withColorSwatch }: {
  materials: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
  withColorSwatch?: boolean;
}) {
  return (
    <div className="px-3 py-2 space-y-1">
      <label className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
        <input
          type="radio"
          checked={value === null}
          onChange={() => onChange(null)}
          className="w-4 h-4"
        />
        <span>не учитывать</span>
      </label>
      {materials.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          Нет материалов в справочнике. Добавьте через раздел «Справочник».
        </p>
      )}
      {materials.map((m) => (
        <label key={m.id} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
          <input
            type="radio"
            checked={value === m.id}
            onChange={() => onChange(m.id)}
            className="w-4 h-4"
          />
          {withColorSwatch && (
            <span
              className="w-4 h-4 rounded border border-surface-300 flex-shrink-0"
              style={{ backgroundColor: colorFromName(m.name) }}
            />
          )}
          <span className="truncate">{m.name}</span>
        </label>
      ))}
    </div>
  );
}

function CheckboxFromMaterials({ materials, selected, onChange }: {
  materials: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }
  return (
    <div className="px-3 py-2 space-y-1">
      {materials.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          Нет материалов в справочнике.
        </p>
      )}
      {materials.map((m) => (
        <label key={m.id} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
          <input
            type="checkbox"
            checked={selected.includes(m.id)}
            onChange={() => toggle(m.id)}
            className="w-4 h-4"
          />
          <span className="truncate">{m.name}</span>
        </label>
      ))}
    </div>
  );
}

// Простая эвристика: подсветить кружок по названию ламинации.
// Не идеально, но даёт визуальную подсказку без необходимости хранить
// цвета в БД (можно потом расширить через поле material.color).
function colorFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('светл')) return '#d2b48c';
  if (n.includes('тёмн') || n.includes('темн')) return '#4a2f1a';
  if (n.includes('золот')) return '#d4a017';
  if (n.includes('орех')) return '#704214';
  if (n.includes('махагон')) return '#7c2d12';
  if (n.includes('вишн')) return '#7e0e1d';
  if (n.includes('сер')) return '#9ca3af';
  if (n.includes('чёрн') || n.includes('черн')) return '#1f2937';
  if (n.includes('бордо')) return '#7e1f1d';
  if (n.includes('берёз') || n.includes('берез')) return '#f5deb3';
  if (n.includes('бук')) return '#c19a6b';
  if (n.includes('гикори')) return '#8b6f47';
  if (n.includes('жёлт') || n.includes('желт')) return '#fbbf24';
  if (n.includes('зелён') || n.includes('зелен')) return '#16a34a';
  if (n.includes('клен')) return '#deb887';
  if (n.includes('красн') && n.includes('дерев')) return '#7c1f1d';
  if (n.includes('красн')) return '#dc2626';
  if (n.includes('ольх')) return '#a0522d';
  if (n.includes('син')) return '#1d4ed8';
  if (n.includes('сосн')) return '#deb887';
  if (n.includes('топол')) return '#a8a29e';
  if (n.includes('ясен')) return '#deb887';
  if (n.includes('дуб')) return '#9b7653';
  return '#d1d5db';
}
