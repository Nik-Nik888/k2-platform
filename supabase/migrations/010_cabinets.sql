-- =====================================================
-- К2 Платформа: Миграция #010 — Шкафы (Cabinets)
-- Таблица для сохранения проектов корпусной мебели.
-- =====================================================

CREATE TABLE cabinets (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id          UUID,                         -- опциональная привязка к клиенту CRM (orders.id или clients.id)
  name               TEXT NOT NULL DEFAULT 'Без названия',
  corpus             JSONB NOT NULL,               -- { width, height, depth, thickness }
  elements           JSONB NOT NULL DEFAULT '[]',  -- массив элементов (полки, стойки, ящики, двери...)
  corpus_texture_id  TEXT,                         -- id текстуры корпуса (egger-h1137 и т.д.)
  facade_texture_id  TEXT,                         -- id текстуры фасада
  preview            TEXT,                         -- base64 PNG превью для списка (опционально, может быть null)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для быстрых запросов
CREATE INDEX cabinets_org_idx     ON cabinets(org_id);
CREATE INDEX cabinets_client_idx  ON cabinets(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX cabinets_updated_idx ON cabinets(updated_at DESC);

-- Триггер для авто-обновления updated_at при UPDATE
CREATE OR REPLACE FUNCTION update_cabinet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cabinets_set_updated_at
  BEFORE UPDATE ON cabinets
  FOR EACH ROW
  EXECUTE FUNCTION update_cabinet_updated_at();

-- ─── RLS политики ────────────────────────────────────
-- Шкафы видят/правят только пользователи своей организации.
ALTER TABLE cabinets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON cabinets
  FOR ALL USING (org_id = get_user_org_id());

-- Комментарий
COMMENT ON TABLE  cabinets IS 'Сохранённые проекты корпусной мебели (шкафы)';
COMMENT ON COLUMN cabinets.corpus IS 'JSON: { width, height, depth, thickness }';
COMMENT ON COLUMN cabinets.elements IS 'JSON-массив элементов (shelf, stud, drawers, rod, door, panel)';
COMMENT ON COLUMN cabinets.preview IS 'Base64 PNG-превью для миниатюры (опционально)';
