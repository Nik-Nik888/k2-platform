import { create } from 'zustand';
import { loadCalcData } from '@modules/calculator/api/calcApi';
import type { CalcDB } from '@modules/calculator/api/calcApi';

interface CalcState {
  db: CalcDB | null;
  isLoading: boolean;
  error: string | null;
  activeTab: string;
  sel: Record<string, Record<string, unknown>>; // selections per tab

  // Actions
  loadData: () => Promise<void>;
  setActiveTab: (tab: string) => void;
  setOpt: (tabId: string, catId: number, optId: number | null) => void;
  setDim: (tabId: string, key: string, value: number) => void;
  setDir: (tabId: string, dir: string) => void;
  setQty: (tabId: string, catId: number, matId: string, qty: number) => void;
  setExtra: (tabId: string, key: string, value: unknown) => void;
  toggleRemove: (tabId: string, catId: number, omId: number) => void;
  isRemoved: (tabId: string, catId: number, omId: number) => boolean;
  getOpt: (tabId: string, catId: number) => number | null;
  getDims: (tabId: string) => { height: number; length: number };
  getDir: (tabId: string) => string;
  getQty: (tabId: string, catId: number, matId: string) => number | undefined;
  getSel: (tabId: string) => Record<string, unknown>;
}

export const useCalcStore = create<CalcState>((set, get) => ({
  db: null,
  isLoading: false,
  error: null,
  activeTab: 'arrival',
  sel: {},

  loadData: async () => {
    set({ isLoading: true, error: null });
    try {
      const db = await loadCalcData();
      set({ db, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка загрузки';
      console.error('Ошибка загрузки калькулятора:', err);
      set({ error: message, isLoading: false });
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setOpt: (tabId, catId, optId) => {
    set((s) => ({
      sel: {
        ...s.sel,
        [tabId]: { ...s.sel[tabId], [catId]: optId },
      },
    }));
  },

  setDim: (tabId, key, value) => {
    set((s) => {
      const tabSel = s.sel[tabId] || {};
      const dims = (tabSel._dims as Record<string, number>) || {};
      return {
        sel: {
          ...s.sel,
          [tabId]: { ...tabSel, _dims: { ...dims, [key]: value } },
        },
      };
    });
  },

  setDir: (tabId, dir) => {
    set((s) => ({
      sel: {
        ...s.sel,
        [tabId]: { ...s.sel[tabId], _dir: dir },
      },
    }));
  },

  setQty: (tabId, catId, matId, qty) => {
    set((s) => ({
      sel: {
        ...s.sel,
        [tabId]: { ...s.sel[tabId], ['_q_' + catId + '_' + matId]: qty },
      },
    }));
  },

  setExtra: (tabId, key, value) => {
    set((s) => ({
      sel: {
        ...s.sel,
        [tabId]: { ...s.sel[tabId], [key]: value },
      },
    }));
  },

  toggleRemove: (tabId, catId, omId) => {
    const key = '_rm_' + catId + '_' + omId;
    const cur = !!(get().sel[tabId] || {})[key];
    set((s) => ({
      sel: {
        ...s.sel,
        [tabId]: { ...s.sel[tabId], [key]: !cur },
      },
    }));
  },

  isRemoved: (tabId, catId, omId) => {
    return !!(get().sel[tabId] || {})['_rm_' + catId + '_' + omId];
  },

  getOpt: (tabId, catId) => {
    const v = (get().sel[tabId] || {})[catId];
    return v !== undefined && v !== null ? Number(v) : null;
  },

  getDims: (tabId) => {
    const d = (get().sel[tabId] || {})._dims as Record<string, number> | undefined;
    return { height: d?.height || 0, length: d?.length || 0 };
  },

  getDir: (tabId) => {
    return ((get().sel[tabId] || {})._dir as string) || 'vertical';
  },

  getQty: (tabId, catId, matId) => {
    const v = (get().sel[tabId] || {})['_q_' + catId + '_' + matId];
    return v !== undefined ? Number(v) : undefined;
  },

  getSel: (tabId) => {
    return get().sel[tabId] || {};
  },
}));
