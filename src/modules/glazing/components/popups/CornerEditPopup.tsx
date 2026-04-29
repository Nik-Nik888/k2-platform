import { useState, useEffect } from 'react';
import { X, Trash2, CornerUpRight, CornerUpLeft, Hexagon, MoveHorizontal } from 'lucide-react';
import type { CornerConnector } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// CornerEditPopup — редактирование углового соединителя.
//
// Используется в двух режимах:
//   • Создание: новый угол при добавлении сегмента
//   • Редактирование: изменение существующего угла (тап на стык)
//
// 4 типа угла:
//   h_90        — Г-образный поворот направо/налево (90°)
//   h_135       — эркер скошенный (135°)
//   h_universal — произвольный угол (для нестандартных эркеров)
//   flat        — плоский (180°, фактически без угла)
//
// Также позволяет удалить угол + соответствующий сегмент.
// ═══════════════════════════════════════════════════════════════════

export interface CornerEditValue {
  type: CornerConnector;
  customAngle?: number;
}

interface CornerEditPopupProps {
  /** Текущее значение (null для создания нового). */
  current: CornerEditValue | null;
  /** Можно ли удалить угол (нет если это единственное соединение). */
  canDelete: boolean;
  onClose: () => void;
  onSave: (value: CornerEditValue) => void;
  onDelete?: () => void;
}

const CORNER_OPTIONS: Array<{
  type: CornerConnector;
  label: string;
  desc: string;
  Icon: typeof CornerUpRight;
}> = [
  { type: 'h_90',        label: '90° поворот', desc: 'Г/П-образный балкон',     Icon: CornerUpRight },
  { type: 'h_135',       label: '135° эркер',  desc: 'Скошенный эркер',         Icon: Hexagon },
  { type: 'h_universal', label: 'Свой угол',    desc: 'Произвольный, для эркера', Icon: CornerUpLeft },
  { type: 'flat',        label: 'Без угла',    desc: 'Плоский переход (180°)',   Icon: MoveHorizontal },
];

export function CornerEditPopup({
  current, canDelete, onClose, onSave, onDelete,
}: CornerEditPopupProps) {
  const [type, setType] = useState<CornerConnector>(current?.type ?? 'h_90');
  const [angle, setAngle] = useState<number>(current?.customAngle ?? 120);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleSave() {
    onSave({
      type,
      customAngle: type === 'h_universal' ? angle : undefined,
    });
    onClose();
  }

  function handleDelete() {
    if (!onDelete) return;
    onDelete();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              {current ? 'Изменить угол' : 'Добавить поворот'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Соединение двух фасадных плоскостей
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {CORNER_OPTIONS.map((opt) => {
            const isActive = type === opt.type;
            return (
              <button
                key={opt.type}
                onClick={() => setType(opt.type)}
                className={`flex flex-col items-center text-center gap-1 p-3 rounded-xl border-2 transition-all ${
                  isActive
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-surface-200 hover:border-brand-300'
                }`}
              >
                <opt.Icon className={`w-6 h-6 ${isActive ? 'text-brand-700' : 'text-gray-600'}`} />
                <span className={`text-xs font-semibold ${isActive ? 'text-brand-700' : 'text-gray-800'}`}>
                  {opt.label}
                </span>
                <span className="text-[10px] text-gray-500 leading-tight">
                  {opt.desc}
                </span>
              </button>
            );
          })}
        </div>

        {type === 'h_universal' && (
          <div className="mb-4">
            <label className="text-xs text-gray-500 font-semibold uppercase mb-1.5 block">
              Угол, градусы (от 60° до 180°)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={60}
              max={180}
              value={angle}
              onChange={(e) => setAngle(parseInt(e.target.value || '0', 10) || 0)}
              className="input text-sm"
            />
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {[100, 110, 120, 135, 150, 160].map((v) => (
                <button
                  key={v}
                  onClick={() => setAngle(v)}
                  className="text-xs px-2 py-1 rounded bg-surface-100 hover:bg-surface-200"
                >
                  {v}°
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handleSave} className="btn-primary flex-1">
            Сохранить
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">
            Отмена
          </button>
          {canDelete && onDelete && (
            <button
              onClick={handleDelete}
              className="px-3 py-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
              title="Удалить сегмент справа"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
