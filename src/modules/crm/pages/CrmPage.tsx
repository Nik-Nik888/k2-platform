import { useEffect, useState } from 'react';
import { useCrmStore } from '@store/crmStore';
import type { OrderStatus, Order, Client } from '@shared/types';
import {
  Phone,
  Mail,
  MapPin,
  Calendar,
  Plus,
  X,
  ChevronRight,
  GripVertical,
} from 'lucide-react';

const STAGES: { status: OrderStatus; label: string; color: string }[] = [
  { status: 'lead', label: 'Заявки', color: 'bg-gray-400' },
  { status: 'measuring', label: 'Замер', color: 'bg-amber-500' },
  { status: 'calculating', label: 'Расчёт', color: 'bg-blue-500' },
  { status: 'approval', label: 'Согласование', color: 'bg-purple-500' },
  { status: 'contract', label: 'Договор', color: 'bg-emerald-500' },
  { status: 'production', label: 'Производство', color: 'bg-cyan-500' },
  { status: 'mounting', label: 'Монтаж', color: 'bg-orange-500' },
  { status: 'completed', label: 'Завершён', color: 'bg-green-600' },
];

const BALCONY_LABELS: Record<string, string> = {
  straight: 'Прямой балкон',
  corner_left: 'Угловой (лев.)',
  corner_right: 'Угловой (прав.)',
  erker: 'Эркер',
  loggia: 'Лоджия',
};

function formatDimensions(d: Order['dimensions']) {
  return `${d.length / 1000}×${d.width / 1000}м, ${d.floor} эт.`;
}

function OrderCard({
  order,
  client,
  onClick,
}: {
  order: Order;
  client: Client | undefined;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="card p-3.5 cursor-pointer hover:shadow-md hover:border-brand-300 
                 transition-all duration-150 group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {client?.name ?? 'Неизвестный'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {BALCONY_LABELS[order.balcony_type] ?? order.balcony_type}
          </p>
        </div>
        <GripVertical className="w-4 h-4 text-gray-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="mt-2.5 space-y-1">
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <MapPin className="w-3 h-3" />
          {formatDimensions(order.dimensions)}
        </p>
        {order.scheduled_date && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            {new Date(order.scheduled_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
          </p>
        )}
      </div>

      {order.total_cost && (
        <div className="mt-2.5 pt-2.5 border-t border-surface-100">
          <p className="text-sm font-bold text-brand-700">
            {order.total_cost.toLocaleString('ru-RU')} ₽
          </p>
        </div>
      )}
    </div>
  );
}

function OrderDetail({
  order,
  client,
  onClose,
  onStatusChange,
}: {
  order: Order;
  client: Client | undefined;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
}) {
  const currentStageIdx = STAGES.findIndex((s) => s.status === order.status);
  const nextStage = STAGES[currentStageIdx + 1];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 text-lg">
            Заказ #{order.id}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Client info */}
          {client && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Клиент
              </h3>
              <div className="space-y-2">
                <p className="font-semibold text-gray-900">{client.name}</p>
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" /> {client.phone}
                </p>
                {client.email && (
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" /> {client.email}
                  </p>
                )}
                {client.address && (
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" /> {client.address}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Balcony info */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Объект
            </h3>
            <div className="card p-4 bg-surface-50 border-surface-200 space-y-2">
              <p className="text-sm">
                <span className="text-gray-500">Тип:</span>{' '}
                <span className="font-medium">{BALCONY_LABELS[order.balcony_type]}</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Размеры:</span>{' '}
                <span className="font-medium">
                  {order.dimensions.length}×{order.dimensions.width}×{order.dimensions.height} мм
                </span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Этаж:</span>{' '}
                <span className="font-medium">{order.dimensions.floor}</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Крыша:</span>{' '}
                <span className="font-medium">{order.dimensions.has_roof ? 'Есть' : 'Нет'}</span>
              </p>
            </div>
          </div>

          {/* Status timeline */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Этап
            </h3>
            <div className="space-y-2">
              {STAGES.slice(0, 8).map((stage, i) => {
                const isCurrent = stage.status === order.status;
                const isPast = i < currentStageIdx;
                return (
                  <div
                    key={stage.status}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                      ${isCurrent ? 'bg-brand-50 border border-brand-200' : ''}
                      ${isPast ? 'text-gray-400' : 'text-gray-700'}
                    `}
                  >
                    <div
                      className={`w-2.5 h-2.5 rounded-full shrink-0
                        ${isCurrent ? stage.color : isPast ? 'bg-gray-300' : 'bg-gray-200'}
                      `}
                    />
                    <span className={isCurrent ? 'font-semibold text-brand-700' : ''}>
                      {stage.label}
                    </span>
                    {isCurrent && (
                      <span className="ml-auto text-xs text-brand-500 font-medium">Текущий</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Заметки
              </h3>
              <p className="text-sm text-gray-700 bg-surface-50 rounded-lg p-3">{order.notes}</p>
            </div>
          )}

          {/* Total */}
          {order.total_cost && (
            <div className="card p-4 bg-emerald-50 border-emerald-200">
              <p className="text-sm text-emerald-700">Стоимость</p>
              <p className="text-2xl font-bold text-emerald-800 mt-1">
                {order.total_cost.toLocaleString('ru-RU')} ₽
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {nextStage && (
              <button
                onClick={() => onStatusChange(nextStage.status)}
                className="btn-primary w-full"
              >
                Перевести в «{nextStage.label}»
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button className="btn-secondary w-full">
              Открыть в калькуляторе
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CrmPage() {
  const { clients, orders, loadData, selectedOrderId, selectOrder, updateOrderStatus, getClientById } = useCrmStore();
  const [showAddClient, setShowAddClient] = useState(false);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedOrder = orders.find((o) => o.id === selectedOrderId);
  const selectedClient = selectedOrder ? getClientById(selectedOrder.client_id) : undefined;

  return (
    <div className="space-y-4">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
          <p className="text-sm text-gray-500 mt-1">
            {orders.length} заказов · {clients.length} клиентов
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddClient(true)}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Новый клиент</span>
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 lg:-mx-6 lg:px-6">
        {STAGES.map((stage) => {
          const stageOrders = orders.filter((o) => o.status === stage.status);
          return (
            <div
              key={stage.status}
              className="shrink-0 w-[280px] flex flex-col"
            >
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
                <span className="text-xs text-gray-400 bg-surface-100 px-2 py-0.5 rounded-full ml-auto">
                  {stageOrders.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2.5 flex-1">
                {stageOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    client={getClientById(order.client_id)}
                    onClick={() => selectOrder(order.id)}
                  />
                ))}
                {stageOrders.length === 0 && (
                  <div className="card p-4 border-dashed border-2 border-surface-200 text-center">
                    <p className="text-xs text-gray-400">Нет заказов</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Order detail slide-over */}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          client={selectedClient}
          onClose={() => selectOrder(null)}
          onStatusChange={(status) => {
            updateOrderStatus(selectedOrder.id, status);
            selectOrder(null);
          }}
        />
      )}
    </div>
  );
}
