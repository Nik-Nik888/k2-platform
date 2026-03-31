-- =====================================================
-- К2 Платформа: Миграция #001 — Ядро (Core)
-- Организации, пользователи, тарифы, подписки
-- =====================================================

-- Расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Тарифные планы ──────────────────────────────────
CREATE TABLE plans (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  price       INTEGER NOT NULL DEFAULT 0,            -- цена в рублях
  max_users   INTEGER NOT NULL DEFAULT 1,
  max_orders_per_month INTEGER NOT NULL DEFAULT 30,
  features    JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (name, price, max_users, max_orders_per_month, features) VALUES
  ('Старт',   2990,  1,  30,  '["calculator", "glazing_2d", "estimates_basic", "crm"]'),
  ('Профи',   5990,  5,  150, '["calculator", "glazing_2d", "visualizer_3d", "estimates_branded", "warehouse", "crm"]'),
  ('Премиум', 11990, -1, -1,  '["calculator", "glazing_2d", "visualizer_3d", "estimates_full", "warehouse", "crm", "api", "whitelabel"]');

-- ─── Организации ─────────────────────────────────────
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  plan_id     UUID REFERENCES plans(id),
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  inn         TEXT,
  city        TEXT DEFAULT 'Нижний Новгород',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Пользователи ────────────────────────────────────
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'manager', 'worker');

CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role        user_role NOT NULL DEFAULT 'manager',
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_org ON users(org_id);

-- ─── Подписки ────────────────────────────────────────
CREATE TYPE subscription_status AS ENUM ('active', 'trial', 'grace', 'expired');

CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id               UUID NOT NULL REFERENCES plans(id),
  status                subscription_status NOT NULL DEFAULT 'trial',
  current_period_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  yokassa_subscription_id TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_org ON subscriptions(org_id);

-- ─── Клиенты (CRM) ──────────────────────────────────
CREATE TYPE lead_source AS ENUM ('site', 'avito', 'recommendation', 'phone', 'other');

CREATE TABLE clients (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  email       TEXT,
  address     TEXT,
  source      lead_source NOT NULL DEFAULT 'phone',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_org ON clients(org_id);

-- ─── Заказы ──────────────────────────────────────────
CREATE TYPE order_status AS ENUM (
  'lead', 'measuring', 'calculating', 'approval',
  'contract', 'production', 'mounting', 'completed', 'cancelled'
);

CREATE TYPE balcony_type AS ENUM (
  'straight', 'corner_left', 'corner_right', 'erker', 'loggia'
);

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id),
  status          order_status NOT NULL DEFAULT 'lead',
  balcony_type    balcony_type NOT NULL DEFAULT 'straight',
  dimensions      JSONB NOT NULL DEFAULT '{}'::JSONB,
  total_cost      INTEGER,
  assigned_to     UUID REFERENCES users(id),
  scheduled_date  DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_org ON orders(org_id);
CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status);

-- ─── Конфигурации остекления ─────────────────────────
CREATE TABLE glazing_configs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  profile     TEXT NOT NULL,
  glass       TEXT NOT NULL,
  sections    JSONB NOT NULL DEFAULT '[]'::JSONB,
  total_cost  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Материалы и категории ───────────────────────────
CREATE TABLE material_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES material_categories(id),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE materials (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category_id UUID REFERENCES material_categories(id),
  unit        TEXT NOT NULL DEFAULT 'шт',
  price       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  description TEXT,
  sku         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_materials_org ON materials(org_id);

-- ─── Расчёты материалов ──────────────────────────────
CREATE TABLE material_calculations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL,
  items       JSONB NOT NULL DEFAULT '[]'::JSONB,
  total_cost  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Сметы ───────────────────────────────────────────
CREATE TABLE estimates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sections    JSONB NOT NULL DEFAULT '[]'::JSONB,
  total       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  final_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  pdf_url     TEXT,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Склад ───────────────────────────────────────────
CREATE TABLE warehouse_stock (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  min_quantity    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  warehouse_name  TEXT NOT NULL DEFAULT 'Основной'
);

CREATE TYPE movement_type AS ENUM ('in', 'out', 'adjustment', 'reserve');

CREATE TABLE stock_movements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity    NUMERIC(10, 2) NOT NULL,
  type        movement_type NOT NULL,
  order_id    UUID REFERENCES orders(id),
  comment     TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── RLS (Row Level Security) ────────────────────────
ALTER TABLE organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials        ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_stock  ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates        ENABLE ROW LEVEL SECURITY;

-- Функция для получения org_id текущего пользователя
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Политики: каждая компания видит только свои данные
CREATE POLICY "org_isolation" ON organizations
  FOR ALL USING (id = get_user_org_id());

CREATE POLICY "org_isolation" ON users
  FOR ALL USING (org_id = get_user_org_id());

CREATE POLICY "org_isolation" ON clients
  FOR ALL USING (org_id = get_user_org_id());

CREATE POLICY "org_isolation" ON orders
  FOR ALL USING (org_id = get_user_org_id());

CREATE POLICY "org_isolation" ON materials
  FOR ALL USING (org_id = get_user_org_id());

CREATE POLICY "org_isolation" ON estimates
  FOR ALL USING (org_id = get_user_org_id());

-- Склад: через material -> org_id
CREATE POLICY "org_isolation" ON warehouse_stock
  FOR ALL USING (
    material_id IN (SELECT id FROM materials WHERE org_id = get_user_org_id())
  );

-- ─── Автообновление updated_at ──────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
