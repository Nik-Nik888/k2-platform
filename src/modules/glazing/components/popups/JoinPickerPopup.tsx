import { useEffect } from 'react';
import { X, CornerUpRight } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// JoinPickerPopup — выбор что вставить между двумя соседними рамами.
//
// Открывается при тапе на ⊕ между рамами в одном сегменте.
// Два варианта:
//   • Кость — усиленный соединитель в той же плоскости (рамы остаются в сегменте)
//   • Поворот — разделить сегмент в этой точке, рамы справа уезжают
//     в новый сегмент с углом 90° по умолчанию
// ═══════════════════════════════════════════════════════════════════

interface JoinPickerPopupProps {
  onClose: () => void;
  onChooseBone: () => void;
  onChooseCorner: () => void;
}

export function JoinPickerPopup({
  onClose, onChooseBone, onChooseCorner,
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

        <div className="grid grid-cols-2 gap-2 mb-2">
          {/* Кость */}
          <button
            onClick={() => { onChooseBone(); onClose(); }}
            className="flex flex-col items-center text-center gap-2 p-4 rounded-xl border-2
                       border-surface-200 hover:border-orange-400 hover:bg-orange-50 transition-all"
          >
            {/* Иконка кости — узкий тёмный прямоугольник между двумя рамками */}
            <svg viewBox="0 0 60 60" className="w-12 h-12">
              <rect x={6} y={10} width={20} height={40} fill="none" stroke="#475569" strokeWidth={2} />
              <rect x={26} y={10} width={8} height={40} fill="#1e293b" />
              <rect x={34} y={10} width={20} height={40} fill="none" stroke="#475569" strokeWidth={2} />
            </svg>
            <span className="text-sm font-semibold text-gray-800">Кость</span>
            <span className="text-[11px] text-gray-500 leading-tight">
              Усиленный соединитель в той же плоскости
            </span>
          </button>

          {/* Поворот */}
          <button
            onClick={() => { onChooseCorner(); onClose(); }}
            className="flex flex-col items-center text-center gap-2 p-4 rounded-xl border-2
                       border-surface-200 hover:border-amber-400 hover:bg-amber-50 transition-all"
          >
            <CornerUpRight className="w-12 h-12 text-amber-600" />
            <span className="text-sm font-semibold text-gray-800">Поворот</span>
            <span className="text-[11px] text-gray-500 leading-tight">
              Г-образный угол 90°. Рамы справа переедут в новый сегмент
            </span>
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
