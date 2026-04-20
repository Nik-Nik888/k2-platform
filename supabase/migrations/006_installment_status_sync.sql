-- ══════════════════════════════════════════════════════════
-- Миграция 006: автообновление статусов рассрочек
-- ══════════════════════════════════════════════════════════
-- Меняет installments.status на основе статусов платежей:
--   - 'overdue' если есть хотя бы один просроченный платёж
--   - 'completed' если все платежи оплачены
--   - 'active' если есть pending и нет overdue

BEGIN;

-- ══════════════════════════════════════════════════════════
-- 1. Функция sync_installment_status: пересчёт по графику
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_installment_status(p_installment_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cnt_overdue INTEGER;
  cnt_pending INTEGER;
  cnt_total INTEGER;
  cur_status TEXT;
  new_status TEXT;
BEGIN
  -- Не трогаем отменённые рассрочки
  SELECT status INTO cur_status FROM installments WHERE id = p_installment_id;
  IF cur_status = 'cancelled' OR cur_status IS NULL THEN
    RETURN cur_status;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status = 'overdue'),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*)
  INTO cnt_overdue, cnt_pending, cnt_total
  FROM installment_payments
  WHERE installment_id = p_installment_id;

  IF cnt_total = 0 THEN
    new_status := cur_status;
  ELSIF cnt_overdue > 0 THEN
    new_status := 'overdue';
  ELSIF cnt_pending = 0 THEN
    -- Все платежи оплачены
    new_status := 'completed';
  ELSE
    new_status := 'active';
  END IF;

  IF new_status != cur_status THEN
    UPDATE installments SET status = new_status WHERE id = p_installment_id;
  END IF;

  RETURN new_status;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 2. Триггер на изменение платежей -> пересинк статуса рассрочки
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trg_sync_installment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM sync_installment_status(OLD.installment_id);
    RETURN OLD;
  ELSE
    PERFORM sync_installment_status(NEW.installment_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS sync_installment_status_trg ON installment_payments;
CREATE TRIGGER sync_installment_status_trg
  AFTER INSERT OR UPDATE OR DELETE ON installment_payments
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_installment_status();

-- ══════════════════════════════════════════════════════════
-- 3. Пересинк всех существующих рассрочек один раз
-- ══════════════════════════════════════════════════════════

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM installments WHERE status != 'cancelled' LOOP
    PERFORM sync_installment_status(rec.id);
  END LOOP;
END $$;

COMMIT;
