-- ═══════════════════════════════════════════════════════════════════
-- 018_glazings.sql
--
-- Таблица для проектов остекления, привязанных к клиентам CRM.
-- Архитектура аналогична `cabinets` (миграция 010):
--   • один клиент = много проектов остекления
--   • каждый проект = независимая сущность с превью и стоимостью
--   • открывается через /glazing/:glazingId
--
-- В отличие от старой схемы (orders.form_data.glazing) — это отдельные
-- сущности, не привязанные к конкретному заказу. Один клиент может
-- иметь несколько проектов: "Балкон зал", "Окно кухня", "Лоджия" и т.п.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS glazings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Опциональная привязка к клиенту CRM (по аналогии с cabinets.client_id).
  -- При создании нового проекта без клиента (черновик) поле = NULL.
  client_id   UUID,

  name        TEXT NOT NULL DEFAULT 'Без названия',

  -- Полный объект GlazingFormData (projects + activeProjectId).
  -- Один проект остекления может содержать несколько GlazingProject
  -- (балкон + несколько окон) — это исторически унаследованная структура,
  -- но на уровне сетки клиента отображается как ОДНА сущность.
  data        JSONB NOT NULL,

  -- Сумма расчёта остекления (для отображения в карточке заказа).
  -- Пересчитывается при сохранении.
  total_cost  NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- Base64 PNG превью (для сетки в ClientGlazings).
  preview     TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Индексы ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS glazings_org_idx
  ON glazings(org_id);
CREATE INDEX IF NOT EXISTS glazings_client_idx
  ON glazings(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS glazings_updated_idx
  ON glazings(updated_at DESC);

-- ── Триггер обновления updated_at ──────────────────────────────────
-- Используем существующую функцию update_updated_at() из 001_core.sql

DROP TRIGGER IF EXISTS glazings_set_updated_at ON glazings;
CREATE TRIGGER glazings_set_updated_at
  BEFORE UPDATE ON glazings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ── RLS политика ───────────────────────────────────────────────────

ALTER TABLE glazings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON glazings;
CREATE POLICY "org_isolation" ON glazings
  FOR ALL USING (org_id = get_user_org_id());

-- ═══════════════════════════════════════════════════════════════════
-- Конец миграции 018_glazings.sql
-- ═══════════════════════════════════════════════════════════════════
