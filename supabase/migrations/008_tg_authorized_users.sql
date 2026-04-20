-- ══════════════════════════════════════════════════════════
-- Миграция 008: whitelist Telegram-пользователей
-- ══════════════════════════════════════════════════════════
-- Кто может создавать лиды через бот в ЛС.
-- Связывает telegram user_id с org_id (кто от имени какой организации работает).

BEGIN;

CREATE TABLE IF NOT EXISTS tg_authorized_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id BIGINT NOT NULL UNIQUE,
  tg_username TEXT,
  tg_first_name TEXT,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'manager',  -- 'manager', 'admin'
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_auth_users_tg_id ON tg_authorized_users(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_tg_auth_users_org ON tg_authorized_users(org_id);

-- RLS: только владельцы организации могут видеть/менять
ALTER TABLE tg_authorized_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tg_auth_users_select ON tg_authorized_users;
CREATE POLICY tg_auth_users_select ON tg_authorized_users FOR SELECT
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS tg_auth_users_insert ON tg_authorized_users;
CREATE POLICY tg_auth_users_insert ON tg_authorized_users FOR INSERT
  WITH CHECK (org_id = get_user_org_id());

DROP POLICY IF EXISTS tg_auth_users_update ON tg_authorized_users;
CREATE POLICY tg_auth_users_update ON tg_authorized_users FOR UPDATE
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS tg_auth_users_delete ON tg_authorized_users;
CREATE POLICY tg_auth_users_delete ON tg_authorized_users FOR DELETE
  USING (org_id = get_user_org_id());

-- ══════════════════════════════════════════════════════════
-- Seed: добавляем тебя (Николая) в whitelist
-- ══════════════════════════════════════════════════════════
-- tg_user_id 352840452 взят из /getUpdates
-- org_id 980bd825-13c8-49a0-9490-2cfd7b8fc755 — К2 Балкон

INSERT INTO tg_authorized_users (tg_user_id, tg_username, tg_first_name, org_id, role)
VALUES (
  352840452,
  'NikolaySherbakov',
  'Николай',
  '980bd825-13c8-49a0-9490-2cfd7b8fc755',
  'admin'
)
ON CONFLICT (tg_user_id) DO UPDATE SET
  tg_username = EXCLUDED.tg_username,
  is_active = TRUE;

COMMIT;
