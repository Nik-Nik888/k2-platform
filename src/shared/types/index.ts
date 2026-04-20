// ─── Core / Auth ────────────────────────────────────────
export type UserRole = 'owner' | 'admin' | 'manager' | 'worker';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan_id: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  org_id: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  max_users: number;
  max_orders_per_month: number;
  features: string[];
}

export interface Subscription {
  id: string;
  org_id: string;
  plan_id: string;
  status: 'active' | 'trial' | 'grace' | 'expired';
  current_period_start: string;
  current_period_end: string;
  created_at: string;
}

// ─── CRM ────────────────────────────────────────────────
export type LeadSource = 'site' | 'avito' | 'recommendation' | 'phone' | 'other';

export type OrderStatus =
  | 'lead'        // Заявка
  | 'measuring'   // Замер
  | 'calculating' // Расчёт
  | 'approval'    // Согласование
  | 'contract'    // Договор
  | 'production'  // Производство
  | 'mounting'    // Монтаж
  | 'completed'   // Завершён
  | 'cancelled';  // Отменён

export interface Client {
  id: string;
  org_id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  source: LeadSource;
  notes: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  org_id: string;
  client_id: string;
  status: OrderStatus;
  balcony_type: BalconyType;
  dimensions: BalconyDimensions;
  total_cost: number | null;
  assigned_to: string | null;  // user_id
  scheduled_date: string | null;
  notes: string | null;
  ignore_duplicates?: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Balcony / 3D ───────────────────────────────────────
export type BalconyType = 'straight' | 'corner_left' | 'corner_right' | 'erker' | 'loggia';

export interface BalconyDimensions {
  length: number;      // мм
  width: number;       // мм
  height: number;      // мм
  parapet_height: number; // мм
  floor: number;       // этаж
  has_roof: boolean;
}

export interface BalconyConfig {
  id: string;
  order_id: string;
  type: BalconyType;
  dimensions: BalconyDimensions;
  wall_finish: string | null;
  floor_finish: string | null;
  ceiling_finish: string | null;
  insulation_type: string | null;
}

// ─── Glazing (2D) ───────────────────────────────────────
export type SectionType = 'fixed' | 'sliding' | 'tilt_turn' | 'tilt';
export type ProfileType = 'rehau' | 'kbe' | 'veka' | 'novotex' | 'aluminium_cold' | 'aluminium_warm';
export type GlassType = 'single' | 'double' | 'triple' | 'energy_saving';

export interface GlazingSection {
  id: string;
  type: SectionType;
  width: number;     // мм
  height: number;    // мм
}

export interface GlazingConfig {
  id: string;
  order_id: string;
  profile: ProfileType;
  glass: GlassType;
  sections: GlazingSection[];
  total_cost: number;
}

// ─── Materials / Calculator ─────────────────────────────
export type MaterialUnit = 'шт' | 'м' | 'м²' | 'м³' | 'кг' | 'л' | 'уп' | 'рул';

export interface Material {
  id: string;
  org_id: string;
  name: string;
  category_id: string;
  unit: MaterialUnit;
  price: number;
  description: string | null;
  sku: string | null;
}

export interface MaterialCategory {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

export interface CalculationItem {
  material_id: string;
  material_name: string;
  quantity: number;
  unit: MaterialUnit;
  price_per_unit: number;
  total: number;
}

export interface MaterialCalculation {
  id: string;
  order_id: string;
  mode: string;
  items: CalculationItem[];
  total_cost: number;
  created_at: string;
}

// ─── Estimates ──────────────────────────────────────────
export interface EstimateSection {
  title: string;
  items: CalculationItem[];
  subtotal: number;
}

export interface Estimate {
  id: string;
  order_id: string;
  org_id: string;
  sections: EstimateSection[];
  total: number;
  discount: number;
  final_total: number;
  pdf_url: string | null;
  version: number;
  created_at: string;
}

// ─── Warehouse ──────────────────────────────────────────
export type MovementType = 'in' | 'out' | 'adjustment' | 'reserve';

export interface WarehouseStock {
  id: string;
  material_id: string;
  quantity: number;
  min_quantity: number;
  warehouse_name: string;
}

export interface StockMovement {
  id: string;
  material_id: string;
  quantity: number;
  type: MovementType;
  order_id: string | null;
  comment: string | null;
  created_by: string;
  created_at: string;
}

// ─── Navigation / UI ────────────────────────────────────
export interface NavItem {
  label: string;
  path: string;
  icon: string;
  module: string;
  requiredPlan?: string[];
}
