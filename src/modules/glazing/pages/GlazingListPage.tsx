import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import {
  listAllGlazings,
  deleteGlazing,
  type GlazingSummaryWithClient,
} from '../api/glazingProjectApi';

// ═══════════════════════════════════════════════════════════════════
// GlazingListPage — список всех проектов остекления организации.
// Маршрут: /glazing/list
//
// Функционал (по образу CabinetListPage):
//   • Список с превью, ценой, клиентом
//   • Фильтр: все / черновики (без клиента) / по клиенту
//   • Удаление с подтверждением
//   • Тап на карточку → /glazing/:id
//   • Кнопка «+ Создать новый» → /glazing (новый черновик)
// ═══════════════════════════════════════════════════════════════════

type FilterValue = 'all' | 'drafts';

export function GlazingListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<GlazingSummaryWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    listAllGlazings()
      .then((rows) => setItems(rows))
      .catch((err) => {
        console.error('Failed to list glazings:', err);
        setError(err?.message || 'Не удалось загрузить список');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const onDelete = async (id: string) => {
    try {
      await deleteGlazing(id);
      setConfirmDelete(null);
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Ошибка удаления: ' + msg);
    }
  };

  const filtered = items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'drafts') return item.client_id === null;
    return true;
  });

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const fmtPrice = (n: number) =>
    new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Проекты остекления</h1>
        <button
          onClick={() => navigate('/glazing')}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Создать новый
        </button>
      </div>

      {/* Фильтр */}
      <div className="card p-2 flex items-center gap-2 text-xs flex-wrap">
        <span className="text-gray-500 px-1">Фильтр:</span>
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded font-medium ${
            filter === 'all'
              ? 'bg-brand-500 text-white'
              : 'bg-surface-100 text-gray-700 hover:bg-surface-200'
          }`}
        >
          Все ({items.length})
        </button>
        <button
          onClick={() => setFilter('drafts')}
          className={`px-3 py-1 rounded font-medium ${
            filter === 'drafts'
              ? 'bg-brand-500 text-white'
              : 'bg-surface-100 text-gray-700 hover:bg-surface-200'
          }`}
        >
          Черновики ({items.filter((i) => !i.client_id).length})
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
        </div>
      )}

      {error && (
        <div className="text-sm text-red-500 py-4 text-center">{error}</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="card p-8 text-center text-sm text-gray-400">
          {filter === 'all'
            ? 'Проектов остекления пока нет. Нажмите «Создать новый» чтобы начать.'
            : 'Нет проектов под выбранный фильтр.'}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="card p-3 flex flex-col gap-2 hover:border-brand-300
                         transition cursor-pointer group relative"
              onClick={() => navigate(`/glazing/${item.id}`)}
            >
              {/* Превью */}
              <div className="bg-gray-100 rounded-lg h-32 flex items-center justify-center overflow-hidden">
                {item.preview ? (
                  <img
                    src={item.preview}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <svg viewBox="0 0 80 60" className="w-16 h-12 text-gray-400">
                    <rect x={6} y={6} width={68} height={48} fill="none"
                          stroke="currentColor" strokeWidth={2} rx={1} />
                    <line x1={40} y1={6} x2={40} y2={54}
                          stroke="currentColor" strokeWidth={1.5} />
                  </svg>
                )}
              </div>

              {/* Заголовок и метаданные */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {item.name || 'Без названия'}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {item.client_name ? (
                    <span>👤 {item.client_name}</span>
                  ) : (
                    <span className="text-amber-600">📝 Черновик</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {item.frame_count} рам · {fmtDate(item.updated_at)}
                </div>
                {item.total_cost > 0 && (
                  <div className="text-sm font-semibold text-brand-700 mt-1">
                    {fmtPrice(item.total_cost)}
                  </div>
                )}
              </div>

              {/* Удалить (на ховере) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(item.id);
                }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full
                           bg-white border border-red-200 text-red-500
                           opacity-0 group-hover:opacity-100 hover:bg-red-50
                           flex items-center justify-center transition"
                title="Удалить"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Подтверждение удаления */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50
                     flex items-center justify-center p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
        >
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl">
            <h3 className="text-base font-bold mb-2">Удалить проект?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Это действие нельзя отменить. Проект будет полностью удалён из БД.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Отмена
              </button>
              <button
                onClick={() => onDelete(confirmDelete)}
                className="text-xs py-1.5 px-3 rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
