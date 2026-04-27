import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Box as BoxIcon, Loader2 } from 'lucide-react';
import { listCabinetsByClient, type CabinetSummary } from '@modules/cabinet/api/cabinetApi';

interface ClientCabinetsProps {
  clientId: string;
  onClose?: () => void; // чтобы закрыть OrderDetail после клика на шкаф
}

/**
 * Блок "Шкафы клиента" в карточке заказа CRM.
 * - Показывает все шкафы привязанные к этому client_id (status != draft по факту -
 *   draft = client_id IS NULL, поэтому фильтр уже сделан запросом).
 * - Кнопка "+ Создать шкаф для клиента" — навигация на /cabinet?client_id=XXX,
 *   и в редакторе клиент сразу привязан к новому шкафу.
 */
export default function ClientCabinets({ clientId, onClose }: ClientCabinetsProps) {
  const navigate = useNavigate();
  const [cabinets, setCabinets] = useState<CabinetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listCabinetsByClient(clientId)
      .then(rows => { if (!cancelled) setCabinets(rows); })
      .catch(err => {
        if (!cancelled) setError(err?.message || 'Не удалось загрузить шкафы');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  const handleOpen = (cabinetId: string) => {
    onClose?.();
    navigate(`/cabinet/${cabinetId}`);
  };

  const handleCreate = () => {
    onClose?.();
    navigate(`/cabinet?client_id=${clientId}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Шкафы
        </h3>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="w-3.5 h-3.5" /> Создать шкаф
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

      {!loading && !error && cabinets.length === 0 && (
        <div className="text-xs text-gray-400 py-2">
          У клиента пока нет шкафов.
        </div>
      )}

      {!loading && !error && cabinets.length > 0 && (
        <div className="space-y-2">
          {cabinets.map(c => (
            <button
              key={c.id}
              onClick={() => handleOpen(c.id)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-brand-300 hover:bg-brand-50 transition text-left"
            >
              <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                {c.preview
                  ? <img src={c.preview} alt="" className="w-full h-full object-cover" />
                  : <BoxIcon className="w-5 h-5 text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {c.name || 'Без названия'}
                </div>
                <div className="text-xs text-gray-500">
                  {c.corpus.width}×{c.corpus.height}×{c.corpus.depth} мм · {c.element_count} {c.element_count === 1 ? 'деталь' : 'деталей'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
