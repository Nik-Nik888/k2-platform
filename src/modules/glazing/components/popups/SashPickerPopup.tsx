import { useEffect } from 'react';
import { X } from 'lucide-react';
import { type SashType, SASH_LABELS } from '../../types';
import { SashIcon } from '../canvas/SashIcons';

// ═══════════════════════════════════════════════════════════════════
// SashPickerPopup — выбор типа открывания для ячейки.
//
// Показывает 8 крупных карточек с превью значка (как в PVC Studio
// фото 3-6, но для одной ячейки). Тап = выбор + закрытие.
//
// На мобильном открывается полноэкранным листом, на десктопе —
// центральным модальным окном.
// ═══════════════════════════════════════════════════════════════════

interface SashPickerPopupProps {
  /** Текущий выбранный тип. */
  current: SashType;
  /** Подпись над попапом — например "Ячейка 800×1400 мм". */
  subtitle?: string;
  onClose: () => void;
  onSelect: (sash: SashType) => void;
}

const SASH_ORDER: SashType[] = [
  'fixed',
  'turn_left', 'turn_right',
  'tilt',
  'tilt_turn_left', 'tilt_turn_right',
  'sliding_left', 'sliding_right',
];

export function SashPickerPopup({
  current, subtitle, onClose, onSelect,
}: SashPickerPopupProps) {
  // Закрытие по Esc
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
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex justify-between items-start mb-1">
          <div>
            <h3 className="text-base font-bold text-gray-900">Тип открывания</h3>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {SASH_ORDER.map((sash) => {
            const isActive = sash === current;
            return (
              <button
                key={sash}
                onClick={() => { onSelect(sash); onClose(); }}
                className={`
                  group flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all
                  ${isActive
                    ? 'border-brand-500 bg-brand-50 shadow-sm'
                    : 'border-surface-200 hover:border-brand-300 hover:bg-surface-50'
                  }
                `}
              >
                {/* Превью значка в маленьком квадрате-ячейке */}
                <div className="w-full aspect-[3/4] bg-white rounded-md border border-surface-300 relative overflow-hidden">
                  <svg viewBox="0 0 100 130" className="w-full h-full">
                    {/* контур "ячейки" */}
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
      </div>
    </div>
  );
}
