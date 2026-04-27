import { create } from 'zustand';
import { loadCalcData } from '@modules/calculator/api/calcApi';
import type { CalcDB } from '@modules/calculator/api/calcApi';

// ── Типы ────────────────────────────────────────────────
export interface FurnitureItem {
  catSelections: Record<number, number | null>; // catId → optId
}

export interface WindowItem {
  h: number;
  w: number;
}

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

  // ── Блочные размеры (остекление) ──
  getBlockDims: (tabId: string, key: string) => { height: number; length: number };
  setBlockDim: (tabId: string, key: string, dimKey: string, value: number) => void;

  // ── Окна (массив) ──
  getWindows: (tabId: string) => WindowItem[];
  setWindows: (tabId: string, windows: WindowItem[]) => void;
  addWindow: (tabId: string) => void;
  removeWindow: (tabId: string, index: number) => void;
  updateWindow: (tabId: string, index: number, key: 'h' | 'w', value: number) => void;

  // ── Мебель (массив позиций) ──
  getFurniture: (tabId: string) => FurnitureItem[];
  addFurniture: (tabId: string) => void;
  removeFurniture: (tabId: string, index: number) => void;
  updateFurnitureCat: (tabId: string, index: number, catId: number, optId: number | null) => void;
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

  // ── Блочные размеры (остекление: _glazingDims, _bbDims, _winDims, _roofDims, _sidingDims) ──
  getBlockDims: (tabId, key) => {
    const d = (get().sel[tabId] || {})[key] as Record<string, number> | undefined;
    return { height: d?.height || 0, length: d?.length || 0 };
  },

  setBlockDim: (tabId, key, dimKey, value) => {
    set((s) => {
      const tabSel = s.sel[tabId] || {};
      const cur = (tabSel[key] as Record<string, number>) || {};
      return {
        sel: {
          ...s.sel,
          [tabId]: { ...tabSel, [key]: { ...cur, [dimKey]: value } },
        },
      };
    });
  },

  // ── Окна (массив) ──
  getWindows: (tabId) => {
    const w = (get().sel[tabId] || {})._windows as WindowItem[] | undefined;
    return w || [{ h: 1400, w: 1200 }];
  },

  setWindows: (tabId, windows) => {
    set((s) => ({
      sel: { ...s.sel, [tabId]: { ...s.sel[tabId], _windows: windows } },
    }));
  },

  addWindow: (tabId) => {
    const cur = get().getWindows(tabId);
    get().setWindows(tabId, [...cur, { h: 1400, w: 1200 }]);
  },

  removeWindow: (tabId, index) => {
    const cur = get().getWindows(tabId);
    get().setWindows(tabId, cur.filter((_, i) => i !== index));
  },

  updateWindow: (tabId, index, key, value) => {
    const cur = [...get().getWindows(tabId)];
    const item = cur[index];
    if (!item) return; // защита от out-of-bounds index
    cur[index] = { ...item, [key]: value };
    get().setWindows(tabId, cur);
  },

  // ── Мебель (массив позиций) ──
  getFurniture: (tabId) => {
    const f = (get().sel[tabId] || {})._furnitureItems as FurnitureItem[] | undefined;
    return f || [];
  },

  addFurniture: (tabId) => {
    const cur = get().getFurniture(tabId);
    set((s) => ({
      sel: {
        ...s.sel,
        [tabId]: { ...s.sel[tabId], _furnitureItems: [...cur, { catSelections: {} }] },
      },
    }));
  },

  removeFurniture: (tabId, index) => {
    const cur = get().getFurniture(tabId);
    set((s) => ({
      sel: {
        ...s.sel,
        [tabId]: { ...s.sel[tabId], _furnitureItems: cur.filter((_, i) => i !== index) },
      },
    }));
  },

  updateFurnitureCat: (tabId, index, catId, optId) => {
    const cur = [...get().getFurniture(tabId)];
    const item = cur[index];
    if (!item) return; // защита от out-of-bounds index
    cur[index] = {
      ...item,
      catSelections: { ...item.catSelections, [catId]: optId },
    };
    set((s) => ({
      sel: {
        ...s.sel,
        [tabId]: { ...s.sel[tabId], _furnitureItems: cur },
      },
    }));
  },
}));