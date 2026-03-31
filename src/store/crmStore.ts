import { create } from 'zustand';
import type { Client, Order, OrderStatus } from '@shared/types';

// Demo data for development
const DEMO_CLIENTS: Client[] = [
  {
    id: '1', org_id: '1', name: 'Иванов Сергей', phone: '+7 (903) 123-45-67',
    email: 'ivanov@mail.ru', address: 'ул. Минина 25, кв. 14', source: 'site',
    notes: 'Интересует утепление + остекление', created_at: '2026-03-15',
  },
  {
    id: '2', org_id: '1', name: 'Петрова Елена', phone: '+7 (920) 987-65-43',
    email: null, address: 'пр. Гагарина 101, кв. 8', source: 'avito',
    notes: 'Лоджия 6м, хочет тёплое остекление', created_at: '2026-03-20',
  },
  {
    id: '3', org_id: '1', name: 'Козлов Дмитрий', phone: '+7 (910) 555-12-34',
    email: 'kozlov@gmail.com', address: 'ул. Белинского 60, кв. 45', source: 'recommendation',
    notes: null, created_at: '2026-03-25',
  },
  {
    id: '4', org_id: '1', name: 'Смирнова Анна', phone: '+7 (908) 777-88-99',
    email: null, address: 'ул. Ванеева 12, кв. 3', source: 'phone',
    notes: 'Балкон с выносом, этаж 5', created_at: '2026-03-28',
  },
];

const DEMO_ORDERS: Order[] = [
  {
    id: '1', org_id: '1', client_id: '1', status: 'contract',
    balcony_type: 'straight', total_cost: 89500, assigned_to: null,
    scheduled_date: '2026-04-10', notes: 'Подписан договор, ждём материалы',
    dimensions: { length: 3000, width: 900, height: 2600, parapet_height: 1000, floor: 7, has_roof: false },
    created_at: '2026-03-15', updated_at: '2026-03-29',
  },
  {
    id: '2', org_id: '1', client_id: '2', status: 'calculating',
    balcony_type: 'loggia', total_cost: null, assigned_to: null,
    scheduled_date: null, notes: 'Замер сделан, считаем материалы',
    dimensions: { length: 6000, width: 1200, height: 2700, parapet_height: 1100, floor: 3, has_roof: false },
    created_at: '2026-03-20', updated_at: '2026-03-27',
  },
  {
    id: '3', org_id: '1', client_id: '3', status: 'measuring',
    balcony_type: 'corner_left', total_cost: null, assigned_to: null,
    scheduled_date: '2026-04-02', notes: 'Назначен замер на 2 апреля',
    dimensions: { length: 3500, width: 900, height: 2600, parapet_height: 1000, floor: 12, has_roof: true },
    created_at: '2026-03-25', updated_at: '2026-03-26',
  },
  {
    id: '4', org_id: '1', client_id: '4', status: 'lead',
    balcony_type: 'straight', total_cost: null, assigned_to: null,
    scheduled_date: null, notes: null,
    dimensions: { length: 2800, width: 850, height: 2600, parapet_height: 1000, floor: 5, has_roof: false },
    created_at: '2026-03-28', updated_at: '2026-03-28',
  },
];

interface CrmState {
  clients: Client[];
  orders: Order[];
  selectedOrderId: string | null;
  isLoading: boolean;

  // Actions
  loadData: () => void;
  addClient: (client: Omit<Client, 'id' | 'org_id' | 'created_at'>) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  selectOrder: (orderId: string | null) => void;
  getClientById: (clientId: string) => Client | undefined;
  getOrdersByStatus: (status: OrderStatus) => Order[];
}

export const useCrmStore = create<CrmState>((set, get) => ({
  clients: [],
  orders: [],
  selectedOrderId: null,
  isLoading: false,

  loadData: () => {
    set({ clients: DEMO_CLIENTS, orders: DEMO_ORDERS });
  },

  addClient: (client) => {
    const newClient: Client = {
      ...client,
      id: crypto.randomUUID(),
      org_id: '1',
      created_at: new Date().toISOString(),
    };
    set((s) => ({ clients: [...s.clients, newClient] }));
  },

  updateOrderStatus: (orderId, status) => {
    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === orderId ? { ...o, status, updated_at: new Date().toISOString() } : o
      ),
    }));
  },

  selectOrder: (orderId) => set({ selectedOrderId: orderId }),

  getClientById: (clientId) => get().clients.find((c) => c.id === clientId),

  getOrdersByStatus: (status) => get().orders.filter((o) => o.status === status),
}));
