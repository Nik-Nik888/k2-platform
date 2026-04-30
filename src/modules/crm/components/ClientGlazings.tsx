import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { listGlazingsByClient, type GlazingSummary } from '@modules/glazing/api/glazingProjectApi';

// ═══════════════════════════════════════════════════════════════════
// ClientGlazings — блок «Проекты остекления клиента» в карточке заказа CRM.
// Архитектура аналогична ClientCabinets:
//   • Показывает список glazings.client_id = clientId
//   • Кнопка "+ Создать остекление" → /glazing?client_id=XXX
//   • Тап на карточку → /glazing/:glazingId
// ═══════════════════════════════════════════════════════════════════

interface ClientGlazingsProps {
  clientId: string;
  /** Колбэк закрыть OrderDetail после клика (как в ClientCabinets). */
  onClose?: () => void;
}

export default function ClientGlazings({ clientId, onClose }: ClientGlazingsProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<GlazingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listGlazingsByClient(clientId)
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Не удалось загрузить остекления');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  const handleOpen = (id: string) => {
    onClose?.();
    navigate(`/glazing/${id}`);
  };

  const handleCreate = () => {
    onClose?.();
    navigate(`/glazing?client_id=${clientId}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Остекление
        </h3>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="w-3.5 h-3.5" /> Создать остекление
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Загрузка…
        </div>
      )}

      {error && (
        <div className="text-xs text-red-500 py-2">{error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-xs text-gray-400 py-2">
          У клиента пока нет проектов остекления.
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-2">
          {items.map((g) => (
            <button
              key={g.id}
              onClick={() => handleOpen(g.id)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg
                         border border-gray-100 hover:border-brand-300
                         hover:bg-brand-50 transition text-left"
            >
              <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                {g.preview
                  ? <img src={g.preview} alt="" className="w-full h-full object-cover" />
                  : (
                    <svg viewBox="0 0 40 40" className="w-7 h-7 text-gray-400">
                      <rect x={6} y={6} width={28} height={28} fill="none"
                            stroke="currentColor" strokeWidth={2} rx={1} />
                      <line x1={20} y1={6} x2={20} y2={34}
                            stroke="currentColor" strokeWidth={1.5} />
                    </svg>
                  )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {g.name || 'Без названия'}
                </div>
                <div className="text-xs text-gray-500">
                  {g.frame_count} {pluralFrames(g.frame_count)}
                  {g.total_cost > 0 && ` · ${formatPrice(g.total_cost)}`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function pluralFrames(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'рама';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'рамы';
  return 'рам';
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price);
}
