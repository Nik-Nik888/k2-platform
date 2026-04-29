import { useEffect } from 'react';
import { X, CornerUpRight } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// JoinPickerPopup — выбор что вставить между двумя соседними рамами.
//
// Открывается при тапе на ⊕ между рамами в одном сегменте.
// Три варианта:
//   • Кость — массивный усиленный соединитель (50мм) тёмно-серого цвета.
//     Используется когда конструкция должна быть единым целым.
//   • Соединитель — тонкая стыковочная планка (20мм) серая.
//     Применяется в балконных блоках и для разделения больших балконов
//     на транспортируемые части (потом собирается на месте монтажа).
//   • Поворот — разделить сегмент в этой точке, рамы справа уезжают
//     в новый сегмент с углом 90° по умолчанию.
// ═══════════════════════════════════════════════════════════════════

interface JoinPickerPopupProps {
  onClose: () => void;
  onChooseBone: () => void;
  onChooseConnector: () => void;
  onChooseCorner: () => void;
}

export function JoinPickerPopup({
  onClose, onChooseBone, onChooseConnector, onChooseCorner,
}: JoinPickerPopupProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">Что добавить</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Выберите тип соединения между рамами
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-2 mb-2">
          {/* Кость */}
          <button
            onClick={() => { onChooseBone(); onClose(); }}
            className="flex items-center text-left gap-3 p-4 rounded-xl border-2
                       border-surface-200 hover:border-orange-400 hover:bg-orange-50 transition-all"
          >
            <svg viewBox="0 0 60 60" className="w-14 h-14 flex-shrink-0">
              <rect x={6} y={10} width={20} height={40} fill="none" stroke="#475569" strokeWidth={2} />
              <rect x={26} y={10} width={8} height={40} fill="#475569" />
              <rect x={34} y={10} width={20} height={40} fill="none" stroke="#475569" strokeWidth={2} />
            </svg>
            <div>
              <div className="text-sm font-semibold text-gray-800">Кость</div>
              <div className="text-[11px] text-gray-500 leading-tight mt-0.5">
                Массивный усиленный соединитель (50&nbsp;мм)
              </div>
            </div>
          </button>

          {/* Соединитель универсальный */}
          <button
            onClick={() => { onChooseConnector(); onClose(); }}
            className="flex items-center text-left gap-3 p-4 rounded-xl border-2
                       border-surface-200 hover:border-blue-400 hover:bg-blue-50 transition-all"
          >
            <svg viewBox="0 0 60 60" className="w-14 h-14 flex-shrink-0">
              <rect x={6} y={10} width={22} height={40} fill="none" stroke="#475569" strokeWidth={2} />
              <line x1={29} y1={10} x2={29} y2={50} stroke="#94a3b8" strokeWidth={1.5} />
              <line x1={31} y1={10} x2={31} y2={50} stroke="#94a3b8" strokeWidth={1.5} />
              <rect x={32} y={10} width={22} height={40} fill="none" stroke="#475569" strokeWidth={2} />
            </svg>
            <div>
              <div className="text-sm font-semibold text-gray-800">Соединитель универсальный</div>
              <div className="text-[11px] text-gray-500 leading-tight mt-0.5">
                Тонкая стыковочная планка (20&nbsp;мм). Балконные блоки, разделение
                больших конструкций на транспортируемые части
              </div>
            </div>
          </button>

          {/* Поворот */}
          <button
            onClick={() => { onChooseCorner(); onClose(); }}
            className="flex items-center text-left gap-3 p-4 rounded-xl border-2
                       border-surface-200 hover:border-amber-400 hover:bg-amber-50 transition-all"
          >
            <CornerUpRight className="w-14 h-14 text-amber-600 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-gray-800">Поворот</div>
              <div className="text-[11px] text-gray-500 leading-tight mt-0.5">
                Г-образный угол 90°. Рамы справа переедут в новый сегмент
              </div>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="btn-secondary w-full mt-3"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
