import { Settings } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// ConfigGearButton — иконка-шестерёнка для открытия большого
// попапа настроек проекта (ConfigPopup).
//
// Размещается рядом с кнопкой «Сбросить» в тулбаре над канвасом.
// ═══════════════════════════════════════════════════════════════════

interface ConfigGearButtonProps {
  onClick: () => void;
  /** Подсказка при наведении. */
  title?: string;
  /** Disabled когда нет активного проекта. */
  disabled?: boolean;
}

export function ConfigGearButton({
  onClick, title = 'Настройки проекта', disabled,
}: ConfigGearButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="text-xs py-1.5 px-2.5 rounded-lg bg-lime-100 text-lime-700 hover:bg-lime-200
                 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
    >
      <Settings className="w-3.5 h-3.5" />
      <span>настройки</span>
    </button>
  );
}
