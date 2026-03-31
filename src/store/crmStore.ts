import { create } from 'zustand';
import type { Client, Order, OrderStatus } from '@shared/types';
import {
  fetchClients,
  fetchOrders,
  createClient as apiCreateClient,
  createOrder as apiCreateOrder,
  updateOrderStatus as apiUpdateOrderStatus,
} from '@modules/crm/api/crmApi';

// ─── Store ──────────────────────────────────────────────
interface CrmState {
  clients: Client[];
  orders: Order[];
  selectedOrderId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadData: () => Promise<void>;
  addClient: (client: Omit<Client, 'id' | 'org_id' | 'created_at'>) => Promise<Client | null>;
  addOrder: (order: Omit<Order, 'id' | 'org_id' | 'created_at' | 'updated_at'>) => Promise<Order | null>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  moveOrder: (orderId: string, newStatus: OrderStatus, insertIndex: number) => void;
  selectOrder: (orderId: string | null) => void;
  getClientById: (clientId: string) => Client | undefined;
  getOrdersByStatus: (status: OrderStatus) => Order[];
}

export const useCrmStore = create<CrmState>((set, get) => ({
  clients: [],
  orders: [],
  selectedOrderId: null,
  isLoading: false,
  error: null,

  loadData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [clients, orders] = await Promise.all([
        fetchClients(),
        fetchOrders(),
      ]);
      set({ clients, orders, isLoading: false });
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
      set({ error: 'Не удалось загрузить данные', isLoading: false });
    }
  },

  addClient: async (clientData) => {
    const newClient = await apiCreateClient(clientData);
    if (newClient) {
      set((s) => ({ clients: [newClient, ...s.clients] }));
    }
    return newClient;
  },

  addOrder: async (orderData) => {
    const newOrder = await apiCreateOrder(orderData);
    if (newOrder) {
      set((s) => ({ orders: [newOrder, ...s.orders] }));
    }
    return newOrder;
  },

  updateOrderStatus: async (orderId, status) => {
    // Оптимистичное обновление: сначала меняем в UI, потом в БД
    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === orderId ? { ...o, status, updated_at: new Date().toISOString() } : o
      ),
    }));

    const success = await apiUpdateOrderStatus(orderId, status);
    if (!success) {
      // Откатываем если ошибка — перезагружаем данные
      await get().loadData();
    }
  },

  moveOrder: (orderId, newStatus, insertIndex) => {
    const order = get().orders.find((o) => o.id === orderId);
    if (!order) return;

    // Обновляем UI сразу
    set((s) => {
      const withoutOrder = s.orders.filter((o) => o.id !== orderId);
      const targetColumnOrders = withoutOrder.filter((o) => o.status === newStatus);
      const otherOrders = withoutOrder.filter((o) => o.status !== newStatus);

      const updatedOrder = { ...order, status: newStatus, updated_at: new Date().toISOString() };
      targetColumnOrders.splice(insertIndex, 0, updatedOrder);

      return { orders: [...otherOrders, ...targetColumnOrders] };
    });

    // Сохраняем в БД асинхронно
    apiUpdateOrderStatus(orderId, newStatus).then((success) => {
      if (!success) {
        get().loadData(); // Откат при ошибке
      }
    });
  },

  selectOrder: (orderId) => set({ selectedOrderId: orderId }),

  getClientById: (clientId) => get().clients.find((c) => c.id === clientId),

  getOrdersByStatus: (status) => get().orders.filter((o) => o.status === status),
}));