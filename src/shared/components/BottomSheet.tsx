import { useEffect } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Максимальная высота в процентах от viewport. По умолчанию 85. */
  maxHeight?: number;
}

/**
 * Мобильный боттомшит — слайд снизу.
 * Тёмная подложка закрывает по клику.
 * Esc закрывает.
 */
export default function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = 85,
}: BottomSheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    // Блокируем скролл body когда шит открыт
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(2px)',
          animation: 'fadeIn 0.2s ease-out',
        }}
      />
      {/* Sheet */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxHeight: `${maxHeight}vh`,
          background: '#0b0c10',
          borderTop: '1px solid rgba(50,50,60,0.4)',
          borderRadius: '16px 16px 0 0',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.25s ease-out',
          color: '#e5e7eb',
          fontFamily: "'IBM Plex Mono',monospace",
          boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Pull indicator */}
        <div
          style={{
            padding: '8px 0 4px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'rgba(100,100,100,0.4)',
            }}
          />
        </div>

        {/* Header */}
        {title && (
          <div
            style={{
              padding: '4px 16px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(50,50,60,0.3)',
            }}
          >
            <h2
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#d1d5db',
                margin: 0,
              }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: 20,
                padding: 0,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
          }}
        >
          {children}
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
