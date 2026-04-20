-- ══════════════════════════════════════════════════════════
-- Миграция 009: управление дублями заказов клиента
-- ══════════════════════════════════════════════════════════
-- Добавляет:
--   - orders.ignore_duplicates — флаг "не показывать предупреждение о дублях"
--   - merge_orders(source_id, target_id) — функция слияния заказов

BEGIN;

-- ── Поле для игнорирования предупреждения ──────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ignore_duplicates BOOLEAN NOT NULL DEFAULT FALSE;

-- ══════════════════════════════════════════════════════════
-- Функция: слить source заказ в target заказ
-- ══════════════════════════════════════════════════════════
-- - Добавляет notes source в notes target (с разделителем)
-- - Удаляет source
-- - Возвращает ID target

CREATE OR REPLACE FUNCTION merge_orders(
  source_id UUID,
  target_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  source_rec RECORD;
  target_rec RECORD;
  merged_notes TEXT;
BEGIN
  -- Проверяем оба заказа
  SELECT * INTO source_rec FROM orders WHERE id = source_id;
  SELECT * INTO target_rec FROM orders WHERE id = target_id;

  IF source_rec IS NULL THEN
    RAISE EXCEPTION 'Source order % not found', source_id;
  END IF;
  IF target_rec IS NULL THEN
    RAISE EXCEPTION 'Target order % not found', target_id;
  END IF;
  IF source_rec.client_id != target_rec.client_id THEN
    RAISE EXCEPTION 'Orders belong to different clients';
  END IF;
  IF source_rec.org_id != target_rec.org_id THEN
    RAISE EXCEPTION 'Orders belong to different organizations';
  END IF;

  -- Склеиваем заметки
  merged_notes := COALESCE(target_rec.notes, '');
  IF source_rec.notes IS NOT NULL AND source_rec.notes != '' THEN
    IF merged_notes != '' THEN
      merged_notes := merged_notes || E'\n\n--- Перенесено из #'
                   || substring(source_id::TEXT, 1, 8) || ' ---\n'
                   || source_rec.notes;
    ELSE
      merged_notes := source_rec.notes;
    END IF;
  END IF;

  UPDATE orders SET notes = merged_notes WHERE id = target_id;

  -- Удаляем source заказ
  DELETE FROM orders WHERE id = source_id;

  RETURN target_id;
END;
$$;

COMMIT;
