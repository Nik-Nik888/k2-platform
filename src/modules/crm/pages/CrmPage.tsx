import { useEffect, useState, useRef } from 'react';
import { useCrmStore } from '@store/crmStore';
import type { OrderStatus, Order, Client, LeadSource, BalconyType } from '@shared/types';
import {
  Phone, Mail, MapPin, Calendar, Plus, X,
  ChevronRight, GripVertical, Loader2, AlertCircle, Users,
} from 'lucide-react';
import ClientInstallments from '@modules/installments/components/ClientInstallments';
import ClientCabinets from '../components/ClientCabinets';
import ClientGlazings from '../components/ClientGlazings';
import ClientCalculations from '../components/ClientCalculations';
import OrderDuplicatesWarning from '../components/OrderDuplicatesWarning';

// ─── Этапы канбана ──────────────────────────────────────
const STAGES: { status: OrderStatus; label: string; color: string; bg: string }[] = [
  { status: 'lead', label: 'Заявки', color: '#9CA3AF', bg: '#F3F4F6' },
  { status: 'measuring', label: 'Замер', color: '#F59E0B', bg: '#FFFBEB' },
  { status: 'calculating', label: 'Расчёт', color: '#3B82F6', bg: '#EFF6FF' },
  { status: 'approval', label: 'Согласование', color: '#8B5CF6', bg: '#F5F3FF' },
  { status: 'contract', label: 'Договор', color: '#10B981', bg: '#ECFDF5' },
  { status: 'production', label: 'Производство', color: '#06B6D4', bg: '#ECFEFF' },
  { status: 'mounting', label: 'Монтаж', color: '#F97316', bg: '#FFF7ED' },
  { status: 'completed', label: 'Завершён', color: '#16A34A', bg: '#F0FDF4' },
];

const BALCONY_LABELS: Record<string, string> = {
  straight: 'Прямой балкон',
  corner_left: 'Угловой (лев.)',
  corner_right: 'Угловой (прав.)',
  erker: 'Эркер',
  loggia: 'Лоджия',
};

const SOURCE_LABELS: Record<LeadSource, string> = {
  site: 'Сайт',
  avito: 'Авито',
  recommendation: 'Рекомендация',
  phone: 'Звонок',
  other: 'Другое',
};

// ─── Модалка добавления клиента + заказа ────────────────
function AddClientModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (client: Omit<Client, 'id' | 'org_id' | 'created_at'>, orderNotes: string, balconyType: BalconyType) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    source: 'phone' as LeadSource,
    notes: '',
    balconyType: 'straight' as BalconyType,
  });

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    await onSubmit(
      {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        source: form.source,
        notes: form.notes.trim() || null,
      },
      form.notes,
      form.balconyType,
    );
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="font-bold text-gray-900 text-lg">Новый клиент</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Имя *</label>
            <input type="text" className="input" placeholder="Иванов Сергей Петрович"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Телефон *</label>
            <input type="tel" className="input" placeholder="+7 (900) 123-45-67"
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Email</label>
              <input type="email" className="input" placeholder="email@mail.ru"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Источник</label>
              <select className="input" value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value as LeadSource })}>
                {Object.entries(SOURCE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Адрес</label>
            <input type="text" className="input" placeholder="ул. Минина 25, кв. 14"
              value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Тип объекта</label>
            <select className="input" value={form.balconyType}
              onChange={(e) => setForm({ ...form, balconyType: e.target.value as BalconyType })}>
              {Object.entries(BALCONY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Заметки</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Что интересует клиента..."
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3 rounded-b-2xl">
          <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
          <button onClick={handleSubmit} disabled={!form.name.trim() || !form.phone.trim() || saving}
            className="btn-primary flex-1">
            {saving ? (<><Loader2 className="w-4 h-4 animate-spin" /> Сохранение...</>) : (<><Plus className="w-4 h-4" /> Создать</>)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Карточка заказа ────────────────────────────────────
function OrderCard({
  order, client, stageColor, isDragging, isJustDropped, isSelected,
  onDragStart, onDragEnd, onClick,
}: {
  order: Order; client: Client | undefined; stageColor: string;
  isDragging: boolean; isJustDropped: boolean; isSelected: boolean;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onClick: () => void;
}) {
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}
      className="relative bg-white rounded-xl border p-3.5 transition-all duration-200 group select-none"
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.3 : 1,
        transform: isJustDropped ? 'scale(1.03)' : isDragging ? 'scale(0.95)' : 'scale(1)',
        borderColor: isSelected ? stageColor : isJustDropped ? stageColor : '#F3F4F6',
        boxShadow: isJustDropped
          ? `0 0 0 3px ${stageColor}20, 0 4px 12px rgba(0,0,0,0.08)`
          : isSelected ? `0 0 0 2px ${stageColor}30` : '0 1px 3px rgba(0,0,0,0.04)',
      }}>
      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-3.5 h-3.5 text-gray-300" />
      </div>
      <div className="pr-5">
        <p className="text-sm font-semibold text-gray-900 truncate">{client?.name ?? 'Загрузка...'}</p>
        <p className="text-xs text-gray-500 mt-0.5">{BALCONY_LABELS[order.balcony_type] ?? order.balcony_type}</p>
      </div>
      <div className="mt-2.5 space-y-1">
        {client?.address && (
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <MapPin className="w-3 h-3" /><span className="truncate">{client.address}</span>
          </p>
        )}
        {order.scheduled_date && (
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            {new Date(order.scheduled_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
          </p>
        )}
      </div>
      {order.total_cost && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-50">
          <p className="text-sm font-bold" style={{ color: stageColor }}>
            {order.total_cost.toLocaleString('ru-RU')} ₽
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Панель деталей заказа ──────────────────────────────
function OrderDetail({
  order, client, onClose, onStatusChange, onRefresh, onSelectOrder,
}: {
  order: Order; client: Client | undefined; onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onRefresh: () => void;
  onSelectOrder: (id: string | null) => void;
}) {
  const currentStageIdx = STAGES.findIndex((s) => s.status === order.status);
  const currentStage = STAGES[currentStageIdx];
  const nextStage = STAGES[currentStageIdx + 1];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto"
        style={{ animation: 'slideIn 0.25s ease-out' }}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: currentStage?.color }} />
            <h2 className="font-bold text-gray-900 text-lg">{client?.name ?? 'Заказ'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {client && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Клиент</h3>
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
                <p className="text-xs text-gray-400">
                  Источник: {SOURCE_LABELS[client.source as LeadSource] ?? client.source}
                </p>
              </div>
            </div>
          )}

          {client && (
            <OrderDuplicatesWarning
              order={order}
              onRefresh={onRefresh}
              onMergedInto={(targetId) => onSelectOrder(targetId)}
            />
          )}

          {client && (
            <ClientInstallments clientId={client.id} onClose={onClose} />
          )}

          {client && (
            <ClientCabinets clientId={client.id} onClose={onClose} />
          )}

          {client && (
            <ClientGlazings clientId={client.id} onClose={onClose} />
          )}

          {client && (
            <ClientCalculations clientId={client.id} onClose={onClose} />
          )}

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Объект</h3>
            <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: currentStage?.bg }}>
              <p className="text-sm"><span className="text-gray-500">Тип:</span>{' '}
                <span className="font-medium">{BALCONY_LABELS[order.balcony_type] ?? order.balcony_type}</span></p>
              {order.dimensions && (
                <>
                  <p className="text-sm"><span className="text-gray-500">Размеры:</span>{' '}
                    <span className="font-medium">{order.dimensions.length}×{order.dimensions.width}×{order.dimensions.height} мм</span></p>
                  <p className="text-sm"><span className="text-gray-500">Этаж:</span>{' '}
                    <span className="font-medium">{order.dimensions.floor}</span></p>
                </>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Этап</h3>
            <div className="space-y-1.5">
              {STAGES.map((stage, i) => {
                const isCurrent = stage.status === order.status;
                const isPast = i < currentStageIdx;
                return (
                  <div key={stage.status} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: isCurrent ? stage.bg : 'transparent',
                      border: isCurrent ? `1px solid ${stage.color}30` : '1px solid transparent',
                    }}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: isCurrent ? stage.color : isPast ? '#D1D5DB' : '#E5E7EB' }} />
                    <span className={isCurrent ? 'font-semibold' : isPast ? 'text-gray-400' : 'text-gray-500'}
                      style={isCurrent ? { color: stage.color } : {}}>{stage.label}</span>
                    {isCurrent && <span className="ml-auto text-xs font-medium" style={{ color: stage.color }}>Текущий</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {order.notes && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Заметки</h3>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{order.notes}</p>
            </div>
          )}

          {order.total_cost && (
            <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-100">
              <p className="text-sm text-emerald-700">Стоимость</p>
              <p className="text-2xl font-bold text-emerald-800 mt-1">
                {order.total_cost.toLocaleString('ru-RU')} ₽
              </p>
            </div>
          )}

          <div className="space-y-2 pt-2">
            {nextStage && (
              <button onClick={() => onStatusChange(nextStage.status)} className="btn-primary w-full">
                Перевести в «{nextStage.label}» <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
      </div>
    </div>
  );
}

// ─── Главная страница CRM ───────────────────────────────
export function CrmPage() {
  const {
    clients, orders, loadData, selectedOrderId, selectOrder,
    updateOrderStatus, moveOrder, addClient, addOrder, getClientById,
    isLoading, error,
  } = useCrmStore();

  const [showAddClient, setShowAddClient] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ col: string; index: number } | null>(null);
  const [justDropped, setJustDropped] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => { loadData(); }, [loadData]);

  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    setDragId(orderId);
    e.dataTransfer.effectAllowed = 'move';
    const el = e.currentTarget as HTMLElement;
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.width = el.offsetWidth + 'px';
    ghost.style.opacity = '0.85';
    ghost.style.transform = 'rotate(2deg)';
    ghost.style.position = 'absolute';
    ghost.style.top = '-9999px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, el.offsetWidth / 2, 20);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragOverCol = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(status);
    const colOrders = orders.filter((o) => o.status === status && o.id !== dragId);
    const colEl = e.currentTarget as HTMLElement;
    const rect = colEl.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let insertIdx = colOrders.length;
    for (let i = 0; i < colOrders.length; i++) {
      const cardEl = cardRefs.current[colOrders[i]!.id];
      if (cardEl) {
        const cardRect = cardEl.getBoundingClientRect();
        const cardMid = cardRect.top + cardRect.height / 2 - rect.top;
        if (y < cardMid) { insertIdx = i; break; }
      }
    }
    setDropIndicator({ col: status, index: insertIdx });
  };

  const handleDrop = (e: React.DragEvent, targetStatus: OrderStatus) => {
    e.preventDefault();
    if (!dragId) return;
    const insertIdx = dropIndicator?.col === targetStatus ? dropIndicator.index
      : orders.filter((o) => o.status === targetStatus).length;
    moveOrder(dragId, targetStatus, insertIdx);
    setJustDropped(dragId);
    setTimeout(() => setJustDropped(null), 600);
    setDragId(null); setDragOverCol(null); setDropIndicator(null);
  };

  const handleDragEnd = () => {
    setDragId(null); setDragOverCol(null); setDropIndicator(null);
  };

  const handleCreateClient = async (
    clientData: Omit<Client, 'id' | 'org_id' | 'created_at'>,
    notes: string, balconyType: BalconyType,
  ) => {
    const newClient = await addClient(clientData);
    if (newClient) {
      await addOrder({
        client_id: newClient.id, status: 'lead', balcony_type: balconyType,
        dimensions: { length: 3000, width: 900, height: 2600, parapet_height: 1000, floor: 1, has_roof: false },
        total_cost: null, assigned_to: null, scheduled_date: null, notes: notes || null,
      });
      setShowAddClient(false);
    }
  };

  const selectedOrder = orders.find((o) => o.id === selectedOrderId);
  const selectedClient = selectedOrder ? getClientById(selectedOrder.client_id) : undefined;

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <span className="ml-3 text-gray-500">Загрузка данных...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
          <p className="text-sm text-gray-500 mt-1">
            {orders.length} заказов · {clients.length} клиентов
            {orders.length > 0 && (
              <span className="ml-2 text-brand-500">— перетаскивайте карточки между этапами</span>
            )}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddClient(true)}>
          <Plus className="w-4 h-4" /><span className="hidden sm:inline">Новый клиент</span>
        </button>
      </div>

      {orders.length === 0 && !isLoading && (
        <div className="card p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="text-lg font-semibold text-gray-700 mt-4">Пока нет заказов</h3>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Добавьте первого клиента — он автоматически попадёт в колонку «Заявки»
          </p>
          <button className="btn-primary mt-4" onClick={() => setShowAddClient(true)}>
            <Plus className="w-4 h-4" /> Добавить клиента
          </button>
        </div>
      )}

      {orders.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 lg:-mx-6 lg:px-6" style={{ minHeight: 480 }}>
          {STAGES.map((stage) => {
            const stageOrders = orders.filter((o) => o.status === stage.status);
            const isOverThis = dragOverCol === stage.status && dragId !== null && !stageOrders.find((o) => o.id === dragId);
            const hasDraggedCard = stageOrders.some((o) => o.id === dragId);

            return (
              <div key={stage.status} className="shrink-0 w-[270px] flex flex-col"
                onDragOver={(e) => handleDragOverCol(e, stage.status)}
                onDragLeave={() => { if (dragOverCol === stage.status) { setDragOverCol(null); setDropIndicator(null); } }}
                onDrop={(e) => handleDrop(e, stage.status)}>

                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full ml-auto">
                    {stageOrders.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1 rounded-xl p-1.5 transition-all duration-200"
                  style={{
                    backgroundColor: isOverThis ? stage.bg : 'transparent',
                    outline: isOverThis ? `2px dashed ${stage.color}50` : '2px dashed transparent',
                    minHeight: 120,
                  }}>
                  {stageOrders.map((order, idx) => {
                    const showIndicatorBefore = dropIndicator?.col === stage.status && dropIndicator?.index === idx && dragId !== null && !hasDraggedCard;
                    return (
                      <div key={order.id} ref={(el) => { cardRefs.current[order.id] = el; }}>
                        {showIndicatorBefore && (
                          <div className="flex items-center gap-1 py-1 px-0.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                            <div className="flex-1 h-0.5 rounded-full" style={{ backgroundColor: stage.color }} />
                          </div>
                        )}
                        <OrderCard order={order} client={getClientById(order.client_id)} stageColor={stage.color}
                          isDragging={dragId === order.id} isJustDropped={justDropped === order.id}
                          isSelected={selectedOrderId === order.id}
                          onDragStart={(e) => handleDragStart(e, order.id)} onDragEnd={handleDragEnd}
                          onClick={() => selectOrder(order.id === selectedOrderId ? null : order.id)} />
                      </div>
                    );
                  })}

                  {dropIndicator?.col === stage.status && dropIndicator?.index === stageOrders.length && dragId !== null && !hasDraggedCard && (
                    <div className="flex items-center gap-1 py-1 px-0.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      <div className="flex-1 h-0.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    </div>
                  )}

                  {stageOrders.length === 0 && !isOverThis && (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                      <p className="text-xs text-gray-400">Перетащите сюда</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedOrder && (
        <OrderDetail order={selectedOrder} client={selectedClient}
          onClose={() => selectOrder(null)}
          onStatusChange={(status) => {
            updateOrderStatus(selectedOrder.id, status);
            setJustDropped(selectedOrder.id);
            setTimeout(() => setJustDropped(null), 600);
            selectOrder(null);
          }}
          onRefresh={loadData}
          onSelectOrder={selectOrder}
        />
      )}

      {showAddClient && (
        <AddClientModal onClose={() => setShowAddClient(false)} onSubmit={handleCreateClient} />
      )}
    </div>
  );
}