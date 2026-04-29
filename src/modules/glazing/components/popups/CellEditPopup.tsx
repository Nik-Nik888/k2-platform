import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import {
  type SashType, SASH_LABELS,
  type MosquitoType, MOSQUITO_LABELS,
  type HardwareItem, HARDWARE_LABELS,
} from '../../types';
import { SashIcon } from '../canvas/SashIcons';

// ═══════════════════════════════════════════════════════════════════
// CellEditPopup — единая точка редактирования ячейки.
//
// Четыре вкладки:
//   • Открывание — тип створки (8 вариантов)
//   • Импост — добавить вертикальные/горизонтальные импосты
//   • Сетка — москитная сетка (без сетки + 4 типа)
//   • Фурнитура — доп. фурнитура (multi-select)
//
// Изменения применяются сразу при выборе (без кнопки "Сохранить").
// Закрытие — через крестик, тап вне попапа или Esc.
// ═══════════════════════════════════════════════════════════════════

interface CellEditPopupProps {
  cellSubtitle?: string;     // например "Ячейка 800×1400 мм"
  currentSash: SashType;
  currentMosquito: MosquitoType | null | undefined;
  currentHardware: HardwareItem[];
  /** Размер полосы активной ячейки (для проверки помещается ли вертикальный импост). */
  rowWidth: number;
  /** Высота всей рамы (для проверки помещается ли горизонтальный импост). */
  frameHeight: number;
  /** Сколько вертикальных импостов УЖЕ есть в полосе активной ячейки. */
  existingVerticalsInRow: number;
  /** Сколько горизонтальных импостов УЖЕ есть в раме. */
  existingHorizontalsInFrame: number;
  onClose: () => void;
  onChangeSash: (sash: SashType) => void;
  onChangeMosquito: (mosquito: MosquitoType | null) => void;
  onChangeHardware: (hardware: HardwareItem[]) => void;
  /** Добавить N равномерно распределённых импостов. */
  onAddImposts: (orientation: 'vertical' | 'horizontal', count: number) => void;
}

type TabId = 'sash' | 'impost' | 'mosquito' | 'hardware';

const TABS: Array<{ id: TabId; label: string; emoji: string }> = [
  { id: 'sash',     label: 'Открывание', emoji: '🪟' },
  { id: 'impost',   label: 'Импост',     emoji: '➕' },
  { id: 'mosquito', label: 'Сетка',      emoji: '🦟' },
  { id: 'hardware', label: 'Фурнитура',  emoji: '🔧' },
];

const SASH_ORDER: SashType[] = [
  'sandwich',           // сэндвич-панель (первой по запросу пользователя)
  'fixed',
  'turn_left', 'turn_right',
  'tilt',
  'tilt_turn_left', 'tilt_turn_right',
  'sliding_left', 'sliding_right',
];

const MOSQUITO_ORDER: Array<MosquitoType | null> = [
  null, 'standard', 'plug', 'antiсat', 'antidust',
];

const HARDWARE_ORDER: HardwareItem[] = ['child_lock', 'comb', 'air_box'];

export function CellEditPopup({
  cellSubtitle,
  currentSash, currentMosquito, currentHardware,
  rowWidth, frameHeight, existingVerticalsInRow, existingHorizontalsInFrame,
  onClose, onChangeSash, onChangeMosquito, onChangeHardware, onAddImposts,
}: CellEditPopupProps) {
  const [activeTab, setActiveTab] = useState<TabId>('sash');

  // Состояние формы добавления импоста
  const [impostOrientation, setImpostOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [impostCount, setImpostCount] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggleHardware(item: HardwareItem) {
    if (currentHardware.includes(item)) {
      onChangeHardware(currentHardware.filter((h) => h !== item));
    } else {
      onChangeHardware([...currentHardware, item]);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
        {/* Шапка */}
        <div className="flex justify-between items-start p-5 pb-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">Настройки ячейки</h3>
            {cellSubtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{cellSubtitle}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Табы */}
        <div className="flex border-b border-surface-200 px-3 gap-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            // Маркер: показывает что во вкладке что-то задано
            let hasValue = false;
            if (tab.id === 'sash') hasValue = currentSash !== 'fixed';
            else if (tab.id === 'impost') hasValue = existingVerticalsInRow > 0 || existingHorizontalsInFrame > 0;
            else if (tab.id === 'mosquito') hasValue = currentMosquito != null;
            else if (tab.id === 'hardware') hasValue = currentHardware.length > 0;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3 py-2 text-sm font-medium border-b-2 transition-all ${
                  isActive
                    ? 'border-brand-500 text-brand-700'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <span className="mr-1.5">{tab.emoji}</span>
                {tab.label}
                {hasValue && !isActive && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* Контент вкладок */}
        <div className="overflow-y-auto p-4 flex-1">
          {activeTab === 'sash' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SASH_ORDER.map((sash) => {
                const isActive = sash === currentSash;
                return (
                  <button
                    key={sash}
                    onClick={() => onChangeSash(sash)}
                    className={`group flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      isActive
                        ? 'border-brand-500 bg-brand-50 shadow-sm'
                        : 'border-surface-200 hover:border-brand-300 hover:bg-surface-50'
                    }`}
                  >
                    {/* Превью значка */}
                    <div className="w-full aspect-[3/4] bg-white rounded-md border border-surface-300 relative overflow-hidden">
                      <svg viewBox="0 0 100 130" className="w-full h-full">
                        <rect
                          x={4} y={4} width={92} height={122}
                          fill="#bfdbfe" fillOpacity={0.6}
                          stroke="#93c5fd" strokeWidth={1.5}
                        />
                        {sash !== 'fixed' && (
                          <SashIcon
                            type={sash}
                            x={10} y={10} width={80} height={110}
                            strokeWidth={2}
                            color="#1f2937"
                          />
                        )}
                      </svg>
                    </div>
                    <span className={`text-xs font-medium leading-tight text-center ${
                      isActive ? 'text-brand-700' : 'text-gray-700'
                    }`}>
                      {SASH_LABELS[sash]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'impost' && (() => {
            // Вычисляем — помещается ли N новых импостов одной ориентации
            // к существующим (минимум 200мм на секцию).
            //
            // Вертикальные: добавляются в полосу активной ячейки.
            //   max_count = floor(rowWidth / 200) - existingVerticalsInRow - 1
            // Горизонтальные: добавляются в раму.
            //   max_count = floor(frameHeight / 200) - existingHorizontalsInFrame - 1
            const isVert = impostOrientation === 'vertical';
            const dim = isVert ? rowWidth : frameHeight;
            const existing = isVert ? existingVerticalsInRow : existingHorizontalsInFrame;
            const maxCount = Math.max(0, Math.floor(dim / 200) - existing - 1);
            const canAdd = maxCount >= 1;
            const finalCount = Math.min(impostCount, maxCount);
            // Размер секции после добавления (для подсказки)
            const secSize = canAdd
              ? Math.floor(dim / (existing + finalCount + 1))
              : 0;

            return (
              <div>
                {/* Ориентация */}
                <label className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">
                  Ориентация
                </label>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => setImpostOrientation('vertical')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      isVert
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-surface-200 hover:border-brand-300 text-gray-700'
                    }`}
                  >
                    <svg viewBox="0 0 60 60" className="w-10 h-10">
                      <rect x={4} y={6} width={52} height={48} fill="none" stroke="currentColor" strokeWidth={2} />
                      <line x1={30} y1={6} x2={30} y2={54} stroke="currentColor" strokeWidth={3} />
                    </svg>
                    <span className="text-sm font-semibold">Вертикальный</span>
                    <span className="text-[11px] text-gray-500 leading-tight text-center">
                      В полосу активной ячейки
                    </span>
                  </button>
                  <button
                    onClick={() => setImpostOrientation('horizontal')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      !isVert
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-surface-200 hover:border-brand-300 text-gray-700'
                    }`}
                  >
                    <svg viewBox="0 0 60 60" className="w-10 h-10">
                      <rect x={4} y={6} width={52} height={48} fill="none" stroke="currentColor" strokeWidth={2} />
                      <line x1={4} y1={30} x2={56} y2={30} stroke="currentColor" strokeWidth={3} />
                    </svg>
                    <span className="text-sm font-semibold">Горизонтальный</span>
                    <span className="text-[11px] text-gray-500 leading-tight text-center">
                      На всю раму (делит на полосы)
                    </span>
                  </button>
                </div>

                {/* Количество */}
                <label className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">
                  Сколько импостов добавить
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setImpostCount((c) => Math.max(1, c - 1))}
                    disabled={!canAdd}
                    className="w-9 h-9 rounded-lg border-2 border-surface-200 hover:border-brand-300 text-lg font-bold text-gray-700 disabled:opacity-40"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={Math.max(1, maxCount)}
                    value={impostCount}
                    onChange={(e) => {
                      const n = parseInt(e.target.value || '1', 10);
                      if (!isNaN(n)) setImpostCount(Math.max(1, Math.min(20, n)));
                    }}
                    disabled={!canAdd}
                    className="input text-center text-base font-semibold flex-1 disabled:opacity-40"
                  />
                  <button
                    onClick={() => setImpostCount((c) => Math.min(20, c + 1))}
                    disabled={!canAdd}
                    className="w-9 h-9 rounded-lg border-2 border-surface-200 hover:border-brand-300 text-lg font-bold text-gray-700 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>

                {/* Быстрые пресеты */}
                <div className="grid grid-cols-5 gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const tooMany = n > maxCount;
                    return (
                      <button
                        key={n}
                        onClick={() => setImpostCount(n)}
                        disabled={tooMany}
                        className={`py-1 text-xs rounded ${
                          impostCount === n && !tooMany
                            ? 'bg-brand-500 text-white font-semibold'
                            : tooMany
                              ? 'bg-surface-50 text-gray-300'
                              : 'bg-surface-100 text-gray-600 hover:bg-surface-200'
                        }`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>

                {/* Подсказка */}
                <p className="text-[11px] text-gray-500 mb-3">
                  {!canAdd
                    ? `⚠ ${isVert ? 'Полоса' : 'Рама'} слишком мала — секции получатся меньше 200 мм`
                    : `Получится ${existing + finalCount + 1} секций по ~${secSize} мм`}
                </p>

                {/* Кнопка добавить */}
                <button
                  onClick={() => {
                    if (!canAdd) return;
                    onAddImposts(impostOrientation, finalCount);
                    onClose();
                  }}
                  disabled={!canAdd}
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Добавить {finalCount}{' '}
                  {isVert ? 'вертикальных' : 'горизонтальных'}{' '}
                  импост{finalCount === 1 ? '' : finalCount < 5 ? 'а' : 'ов'}
                </button>
              </div>
            );
          })()}

          {activeTab === 'mosquito' && (
            <div className="grid grid-cols-1 gap-2">
              {MOSQUITO_ORDER.map((m) => {
                const isActive = m === (currentMosquito ?? null);
                const label = m === null ? 'Без сетки' : MOSQUITO_LABELS[m];
                return (
                  <button
                    key={m ?? 'none'}
                    onClick={() => onChangeMosquito(m)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      isActive
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-surface-200 hover:border-brand-300'
                    }`}
                  >
                    {/* Маленькое превью */}
                    <div className="w-12 h-12 bg-white rounded border border-surface-300 flex-shrink-0 relative overflow-hidden">
                      {m !== null && (
                        <svg viewBox="0 0 48 48" className="absolute inset-0 w-full h-full">
                          {/* Сетка квадратиками */}
                          {[8, 16, 24, 32, 40].map((x) => (
                            <line key={`v-${x}`} x1={x} y1={0} x2={x} y2={48} stroke="#64748b" strokeWidth={0.5} opacity={0.5} />
                          ))}
                          {[8, 16, 24, 32, 40].map((y) => (
                            <line key={`h-${y}`} x1={0} y1={y} x2={48} y2={y} stroke="#64748b" strokeWidth={0.5} opacity={0.5} />
                          ))}
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm font-medium ${
                      isActive ? 'text-brand-700' : 'text-gray-800'
                    }`}>
                      {label}
                    </span>
                    {isActive && <Check className="w-4 h-4 ml-auto text-brand-600" />}
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'hardware' && (
            <div className="grid grid-cols-1 gap-2">
              <p className="text-xs text-gray-500 mb-1">
                Можно выбрать несколько вариантов
              </p>
              {HARDWARE_ORDER.map((h) => {
                const isActive = currentHardware.includes(h);
                return (
                  <button
                    key={h}
                    onClick={() => toggleHardware(h)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      isActive
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-surface-200 hover:border-brand-300'
                    }`}
                  >
                    {/* Чекбокс */}
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      isActive ? 'border-brand-500 bg-brand-500' : 'border-surface-300'
                    }`}>
                      {isActive && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-sm font-medium ${
                      isActive ? 'text-brand-700' : 'text-gray-800'
                    }`}>
                      {HARDWARE_LABELS[h]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Подвал */}
        <div className="border-t border-surface-200 p-3 flex justify-end">
          <button onClick={onClose} className="btn-primary px-6">
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
