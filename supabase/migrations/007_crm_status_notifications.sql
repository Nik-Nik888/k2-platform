-- ══════════════════════════════════════════════════════════
-- Миграция 007: Telegram-уведомления об изменении статусов CRM
-- ══════════════════════════════════════════════════════════
-- При UPDATE orders.status шлёт сообщение в группу "К2 Воронка".
-- При INSERT нового заказа со статусом 'lead' — уведомление о новой заявке.
-- ВАЖНО: orders.status имеет тип enum order_status, поэтому везде явный каст ::TEXT.

BEGIN;

-- ══════════════════════════════════════════════════════════
-- Маппинг статусов в человеко-читаемые названия и эмодзи
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION crm_status_label(s TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'lead'         THEN '⚪ Заявка'
    WHEN 'measuring'    THEN '🟡 Замер'
    WHEN 'calculating'  THEN '🔵 Расчёт'
    WHEN 'approval'     THEN '🟣 Согласование'
    WHEN 'contract'     THEN '🟢 Договор'
    WHEN 'production'   THEN '🟠 Производство'
    WHEN 'mounting'     THEN '🔴 Монтаж'
    WHEN 'completed'    THEN '✅ Завершён'
    ELSE s
  END;
$$;

-- ══════════════════════════════════════════════════════════
-- Триггер: уведомление о смене статуса заказа
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  client_rec RECORD;
  order_num TEXT;
  msg TEXT;
  assignee_name TEXT := NULL;
BEGIN
  IF NEW.status IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT name, phone, address
  INTO client_rec
  FROM clients
  WHERE id = NEW.client_id;

  IF NEW.assigned_to IS NOT NULL THEN
    SELECT u.email
    INTO assignee_name
    FROM auth.users u
    WHERE u.id = NEW.assigned_to;
  END IF;

  BEGIN
    order_num := COALESCE(NEW.order_number, '#' || substring(NEW.id::TEXT, 1, 8));
  EXCEPTION WHEN undefined_column THEN
    order_num := '#' || substring(NEW.id::TEXT, 1, 8);
  END;

  -- Явный каст enum в TEXT
  msg := '➡️ <b>Заказ ' || order_num || '</b>'
      || E'\n' || crm_status_label(OLD.status::TEXT) || '  →  ' || crm_status_label(NEW.status::TEXT);

  IF client_rec.name IS NOT NULL THEN
    msg := msg || E'\n\n👤 <b>' || client_rec.name || '</b>';
    IF client_rec.phone IS NOT NULL THEN
      msg := msg || E'\n📞 ' || client_rec.phone;
    END IF;
    IF client_rec.address IS NOT NULL THEN
      msg := msg || E'\n📍 ' || client_rec.address;
    END IF;
  END IF;

  IF assignee_name IS NOT NULL THEN
    msg := msg || E'\n\n👷 ' || assignee_name;
  END IF;

  PERFORM tg_send('crm', msg);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_order_status_change_trg ON orders;
CREATE TRIGGER notify_order_status_change_trg
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_order_status_change();

-- ══════════════════════════════════════════════════════════
-- Триггер: уведомление о новых заявках
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  client_rec RECORD;
  order_num TEXT;
  msg TEXT;
BEGIN
  -- Каст enum в TEXT
  IF NEW.status::TEXT != 'lead' THEN
    RETURN NEW;
  END IF;

  SELECT name, phone, address
  INTO client_rec
  FROM clients
  WHERE id = NEW.client_id;

  BEGIN
    order_num := COALESCE(NEW.order_number, '#' || substring(NEW.id::TEXT, 1, 8));
  EXCEPTION WHEN undefined_column THEN
    order_num := '#' || substring(NEW.id::TEXT, 1, 8);
  END;

  msg := '🆕 <b>Новая заявка ' || order_num || '</b>';

  IF client_rec.name IS NOT NULL THEN
    msg := msg || E'\n\n👤 <b>' || client_rec.name || '</b>';
    IF client_rec.phone IS NOT NULL THEN
      msg := msg || E'\n📞 ' || client_rec.phone;
    END IF;
    IF client_rec.address IS NOT NULL THEN
      msg := msg || E'\n📍 ' || client_rec.address;
    END IF;
  END IF;

  PERFORM tg_send('crm', msg);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_lead_trg ON orders;
CREATE TRIGGER notify_new_lead_trg
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_lead();

COMMIT;
