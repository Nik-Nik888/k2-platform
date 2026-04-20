-- ══════════════════════════════════════════════════════════
-- Миграция 005: Telegram-уведомления о рассрочках
-- ══════════════════════════════════════════════════════════
-- Требует расширений: pg_net, pg_cron (включены в Dashboard)
-- Требует секретов в Vault: telegram_bot_token, tg_chat_installments, tg_chat_crm

BEGIN;

-- ══════════════════════════════════════════════════════════
-- 1. Хелпер tg_send: вызов Edge Function tg-notify
-- ══════════════════════════════════════════════════════════
-- Использует pg_net для асинхронного HTTP POST.
-- Не блокирует основной поток — отправляет в фоне.

CREATE OR REPLACE FUNCTION tg_send(
  chat_key TEXT,        -- 'installments', 'crm' или прямой chat_id
  message_text TEXT,    -- текст сообщения (HTML)
  service_role_key TEXT DEFAULT NULL  -- передаётся для авторизации Edge Function
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id BIGINT;
  url TEXT := 'https://vhxqoribxhvahmfhamaw.supabase.co/functions/v1/tg-notify';
  auth_key TEXT;
BEGIN
  -- Если ключ не передан — берём из Vault
  IF service_role_key IS NULL THEN
    SELECT decrypted_secret INTO auth_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  ELSE
    auth_key := service_role_key;
  END IF;

  IF auth_key IS NULL THEN
    RAISE WARNING 'tg_send: service_role_key not found in Vault. Save it via vault.create_secret().';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || auth_key
    ),
    body := jsonb_build_object(
      'chat', chat_key,
      'text', message_text
    )
  ) INTO request_id;

  RETURN request_id;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 2. Функция notify_installments_due
-- ══════════════════════════════════════════════════════════
-- Запускается ежедневно. Собирает 4 типа уведомлений:
--   1. За 3 дня до платежа
--   2. В день платежа (сегодня)
--   3. Просроченные (вчера и раньше)
--   4. Понедельный дайджест (только по понедельникам)

CREATE OR REPLACE FUNCTION notify_installments_due()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today DATE := (now() AT TIME ZONE 'Europe/Moscow')::DATE;
  in_3_days DATE := today + 3;
  is_monday BOOLEAN := EXTRACT(ISODOW FROM today) = 1;

  msg TEXT;
  cnt INTEGER;
  rec RECORD;
  result JSONB := '{"sent": []}'::JSONB;
BEGIN
  -- ── 1. Платежи через 3 дня ────────────────────────────
  msg := '';
  cnt := 0;
  FOR rec IN
    SELECT
      c.name AS client_name,
      c.phone AS client_phone,
      c.address AS client_address,
      ip.amount,
      i.contract_number,
      ip.due_date
    FROM installment_payments ip
    JOIN installments i ON i.id = ip.installment_id
    JOIN clients c ON c.id = i.client_id
    WHERE ip.due_date = in_3_days
      AND ip.status = 'pending'
      AND i.status = 'active'
    ORDER BY ip.amount DESC
  LOOP
    cnt := cnt + 1;
    msg := msg || E'\n• <b>' || rec.client_name || '</b> — '
                || to_char(rec.amount, 'FM999G999G990') || ' ₽'
                || E'\n  📞 ' || rec.client_phone
                || COALESCE(E'  📍 ' || rec.client_address, '')
                || COALESCE(E'  📄 №' || rec.contract_number, '');
  END LOOP;

  IF cnt > 0 THEN
    msg := '⏰ <b>Через 3 дня платежи (' || to_char(in_3_days, 'DD.MM') || ')</b>'
        || E'\nКлиентов: ' || cnt
        || E'\n' || msg;
    PERFORM tg_send('installments', msg);
    result := jsonb_set(result, '{sent}', (result->'sent') || to_jsonb('in_3_days: ' || cnt::TEXT));
  END IF;

  -- ── 2. Платежи сегодня ────────────────────────────────
  msg := '';
  cnt := 0;
  FOR rec IN
    SELECT
      c.name AS client_name,
      c.phone AS client_phone,
      c.address AS client_address,
      ip.amount,
      i.contract_number
    FROM installment_payments ip
    JOIN installments i ON i.id = ip.installment_id
    JOIN clients c ON c.id = i.client_id
    WHERE ip.due_date = today
      AND ip.status = 'pending'
      AND i.status = 'active'
    ORDER BY ip.amount DESC
  LOOP
    cnt := cnt + 1;
    msg := msg || E'\n• <b>' || rec.client_name || '</b> — '
                || to_char(rec.amount, 'FM999G999G990') || ' ₽'
                || E'\n  📞 ' || rec.client_phone
                || COALESCE(E'  📍 ' || rec.client_address, '')
                || COALESCE(E'  📄 №' || rec.contract_number, '');
  END LOOP;

  IF cnt > 0 THEN
    msg := '📅 <b>Сегодня платежи (' || to_char(today, 'DD.MM') || ')</b>'
        || E'\nКлиентов: ' || cnt
        || E'\n' || msg;
    PERFORM tg_send('installments', msg);
    result := jsonb_set(result, '{sent}', (result->'sent') || to_jsonb('today: ' || cnt::TEXT));
  END IF;

  -- ── 3. Просроченные платежи ───────────────────────────
  -- Также автоматически переводим статусы в 'overdue'
  UPDATE installment_payments
  SET status = 'overdue'
  WHERE due_date < today
    AND status = 'pending';

  msg := '';
  cnt := 0;
  FOR rec IN
    SELECT
      c.name AS client_name,
      c.phone AS client_phone,
      c.address AS client_address,
      ip.amount,
      i.contract_number,
      ip.due_date,
      (today - ip.due_date) AS days_overdue
    FROM installment_payments ip
    JOIN installments i ON i.id = ip.installment_id
    JOIN clients c ON c.id = i.client_id
    WHERE ip.status = 'overdue'
      AND i.status = 'active'
    ORDER BY ip.due_date ASC, ip.amount DESC
  LOOP
    cnt := cnt + 1;
    msg := msg || E'\n• <b>' || rec.client_name || '</b> — '
                || to_char(rec.amount, 'FM999G999G990') || ' ₽'
                || ' (просрочка ' || rec.days_overdue || ' дн.)'
                || E'\n  📞 ' || rec.client_phone
                || COALESCE(E'  📍 ' || rec.client_address, '')
                || COALESCE(E'  📄 №' || rec.contract_number, '');
  END LOOP;

  IF cnt > 0 THEN
    msg := '🚨 <b>Просроченные платежи</b>'
        || E'\nВсего: ' || cnt
        || E'\n' || msg;
    PERFORM tg_send('installments', msg);
    result := jsonb_set(result, '{sent}', (result->'sent') || to_jsonb('overdue: ' || cnt::TEXT));
  END IF;

  -- ── 4. Понедельный дайджест (только по понедельникам) ──
  IF is_monday THEN
    msg := '';
    cnt := 0;
    DECLARE
      total_amount NUMERIC := 0;
    BEGIN
      FOR rec IN
        SELECT
          c.name AS client_name,
          ip.amount,
          ip.due_date
        FROM installment_payments ip
        JOIN installments i ON i.id = ip.installment_id
        JOIN clients c ON c.id = i.client_id
        WHERE ip.due_date BETWEEN today AND today + 6
          AND ip.status IN ('pending', 'overdue')
          AND i.status = 'active'
        ORDER BY ip.due_date ASC
      LOOP
        cnt := cnt + 1;
        total_amount := total_amount + rec.amount;
        msg := msg || E'\n• ' || to_char(rec.due_date, 'DD.MM (Dy)') || ' — '
                    || rec.client_name || ' — '
                    || to_char(rec.amount, 'FM999G999G990') || ' ₽';
      END LOOP;

      IF cnt > 0 THEN
        msg := '📊 <b>Дайджест на неделю</b>'
            || E'\nПлатежей: ' || cnt
            || ', сумма: ' || to_char(total_amount, 'FM999G999G990') || ' ₽'
            || E'\n' || msg;
        PERFORM tg_send('installments', msg);
        result := jsonb_set(result, '{sent}', (result->'sent') || to_jsonb('weekly: ' || cnt::TEXT));
      END IF;
    END;
  END IF;

  RETURN result;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 3. Cron-задача: каждый день в 10:00 МСК = 07:00 UTC
-- ══════════════════════════════════════════════════════════

-- Сначала удаляем существующую задачу с таким именем (если была)
SELECT cron.unschedule('notify_installments_due_daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'notify_installments_due_daily'
);

-- Создаём cron-задачу
SELECT cron.schedule(
  'notify_installments_due_daily',
  '0 7 * * *',  -- 07:00 UTC = 10:00 МСК ежедневно
  'SELECT notify_installments_due();'
);

COMMIT;
