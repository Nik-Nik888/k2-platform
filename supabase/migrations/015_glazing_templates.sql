-- ═══════════════════════════════════════════════════════════════════
-- 015_glazing_templates.sql
--
-- Пользовательские шаблоны проектов остекления.
-- Менеджер строит конструкцию в канвасе (рамы, импосты, кости, углы)
-- и сохраняет её как шаблон. В следующий раз при создании нового
-- проекта может выбрать этот шаблон во вкладке «Тип конструкции».
--
-- Сохраняется ТОЛЬКО геометрия (segments, corners). Поля config
-- (профиль, стеклопакет, фурнитура) не сохраняются — их менеджер
-- настраивает заново под каждый заказ.
--
-- Привязка к организации (org_id) — шаблоны видны всем менеджерам
-- одной компании.
-- ═══════════════════════════════════════════════════════════════════

-- ── Таблица glazing_templates ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS glazing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Название шаблона (то что вводит менеджер при сохранении)
  name TEXT NOT NULL,

  -- Тип конструкции — для фильтрации в попапе создания
  construction_type TEXT NOT NULL CHECK (construction_type IN (
    'window', 'balcony', 'balcony_block', 'loggia'
  )),

  -- Геометрия проекта в JSON: { segments: [...], corners: [...] }
  -- Без config — он настраивается отдельно для каждого заказа
  geometry JSONB NOT NULL,

  -- Метаданные
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Кто создал (для будущего, пока не используется в UI)
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ── Индексы ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_glazing_templates_org
  ON glazing_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_glazing_templates_org_type
  ON glazing_templates(org_id, construction_type);

-- ── RLS политика «изоляция по организации» ─────────────────────────
-- Используем тот же паттерн что и для остальных таблиц проекта:
-- get_user_org_id() — функция, определена в 001_core.sql.

ALTER TABLE glazing_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON glazing_templates;
CREATE POLICY "org_isolation" ON glazing_templates
  FOR ALL USING (org_id = get_user_org_id());

-- ── Триггер обновления updated_at ──────────────────────────────────
-- update_updated_at() — функция из 001_core.sql, переиспользуем её

DROP TRIGGER IF EXISTS trg_glazing_templates_updated_at ON glazing_templates;
CREATE TRIGGER trg_glazing_templates_updated_at
  BEFORE UPDATE ON glazing_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- Конец миграции 015_glazing_templates.sql
-- ═══════════════════════════════════════════════════════════════════
