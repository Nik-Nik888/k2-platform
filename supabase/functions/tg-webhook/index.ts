// Edge Function: tg-webhook
// Принимает обновления от Telegram Bot API (webhook).
// При входящем сообщении в ЛС от авторизованного пользователя
// парсит текст регуляркой и создаёт клиента + заказ в CRM.
//
// Публичный URL (для Telegram setWebhook):
// https://vhxqoribxhvahmfhamaw.supabase.co/functions/v1/tg-webhook

// @ts-ignore
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
// @ts-ignore
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-ignore
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Регулярка для российского мобильного номера
// Ловит: +79001234567, 89001234567, 9001234567, 7(900)123-45-67, +7 900 123 45 67 и т.п.
const PHONE_RE = /(?:\+?7|8)?[\s\-()]*(?:9\d{2})[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}/;

// ── Нормализация телефона к виду 7xxxxxxxxxx ────────────
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return '7' + digits.slice(1);
  if (digits.length === 11 && digits.startsWith('7')) return digits;
  if (digits.length === 10 && digits.startsWith('9')) return '7' + digits;
  return digits;
}

// ── Парсинг текста: телефон + имя + всё остальное ──────
function parseLeadText(text: string): {
  name: string;
  phone: string;
  notes: string;
} {
  const phoneMatch = text.match(PHONE_RE);
  const phone = phoneMatch ? normalizePhone(phoneMatch[0]) : '';

  if (!phone) {
    return { name: text.slice(0, 100).trim(), phone: '', notes: '' };
  }

  // Убираем телефон из текста и смотрим что осталось
  const withoutPhone = text.replace(phoneMatch![0], '').trim();

  // Берём первое слово (или два слова) до телефона как имя
  const beforePhone = text.slice(0, phoneMatch!.index).trim();
  let name = beforePhone;
  if (!name || name.length < 2) {
    // Если перед телефоном пусто — берём первое слово из остатка
    const firstWord = withoutPhone.split(/\s+/)[0] || 'Без имени';
    name = firstWord;
  }
  // Ограничиваем имя разумной длиной (max 50 символов)
  if (name.length > 50) name = name.slice(0, 50).trim();

  // Notes = всё остальное (включая что было после телефона)
  const notes = withoutPhone.length > name.length
    ? withoutPhone.replace(name, '').trim()
    : '';

  return { name, phone, notes };
}

// ── Отправка ответа в Telegram ──────────────────────────
async function tgReply(chat_id: number, text: string, parse_mode = 'HTML') {
  const r = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text,
        parse_mode,
        disable_web_page_preview: true,
      }),
    }
  );
  return r.json();
}

// ── Supabase REST wrapper ──────────────────────────────
async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...init.headers,
      apikey: SERVICE_ROLE_KEY || '',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  return res.json();
}

// ══════════════════════════════════════════════════════════
// Главный обработчик
// ══════════════════════════════════════════════════════════

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Нам интересны только личные сообщения с текстом
  const msg = update.message;
  if (!msg || !msg.text || msg.chat.type !== 'private') {
    return new Response('OK', { status: 200 });
  }

  const tgUserId = msg.from.id as number;
  const chatId = msg.chat.id as number;
  const text = msg.text.trim();

  // ── Команды ────────────────────────────────────────────
  if (text === '/start' || text === '/help') {
    await tgReply(chatId,
      '👋 <b>Привет! Я бот К2 Платформа.</b>\n\n' +
      'Я помогаю создавать заявки в CRM.\n\n' +
      '<b>Как пользоваться:</b>\n' +
      'Просто напиши мне сообщение в свободной форме — имя, телефон и другие данные клиента. Я распознаю телефон и создам карточку в CRM.\n\n' +
      '<b>Пример:</b>\n' +
      '<code>Иван Петров 89001234567\nул. Бекетова 12, прямой балкон 3.2×1.5</code>\n\n' +
      '<b>Если у тебя нет доступа</b> — обратись к администратору.\n\n' +
      `Твой Telegram ID: <code>${tgUserId}</code>`
    );
    return new Response('OK', { status: 200 });
  }

  // ── Проверка whitelist ────────────────────────────────
  try {
    const authUsers = await sb(
      `tg_authorized_users?tg_user_id=eq.${tgUserId}&is_active=eq.true&select=*`
    );

    if (!Array.isArray(authUsers) || authUsers.length === 0) {
      await tgReply(chatId,
        '⛔ <b>У вас нет доступа</b>\n\n' +
        'Обратитесь к администратору, чтобы он добавил вас в систему.\n\n' +
        `Сообщите ему свой Telegram ID: <code>${tgUserId}</code>`
      );
      return new Response('OK', { status: 200 });
    }

    const authUser = authUsers[0];
    const orgId = authUser.org_id;

    // ── Парсим текст ─────────────────────────────────────
    const { name, phone, notes } = parseLeadText(text);

    if (!phone) {
      await tgReply(chatId,
        '⚠️ <b>Не удалось распознать телефон</b>\n\n' +
        'Убедись, что сообщение содержит номер в формате:\n' +
        '<code>+79001234567</code> или <code>89001234567</code>\n\n' +
        '<b>Пример:</b>\n' +
        '<code>Иван 89001234567 адрес и описание</code>'
      );
      return new Response('OK', { status: 200 });
    }

    // ── Ищем клиента по телефону ─────────────────────────
    // Сравниваем только цифры (на случай если в БД номер в другом формате)
    const allClients = await sb(
      `clients?org_id=eq.${orgId}&select=id,name,phone`
    );

    const phoneDigits = phone.replace(/\D/g, '');
    let clientId: string;
    let isNewClient = false;

    const existing = (allClients as any[]).find((c) => {
      const cDigits = (c.phone || '').replace(/\D/g, '');
      return cDigits === phoneDigits ||
             cDigits.endsWith(phoneDigits.slice(-10)) ||
             phoneDigits.endsWith(cDigits.slice(-10));
    });

    if (existing) {
      clientId = existing.id;
    } else {
      // Создаём нового клиента
      const created = await sb('clients', {
        method: 'POST',
        body: JSON.stringify({
          org_id: orgId,
          name: name || 'Без имени',
          phone,
          notes: notes || null,
          source: 'phone',
        }),
      });
      clientId = (created as any[])[0].id;
      isNewClient = true;
    }

    // ── Создаём заказ ────────────────────────────────────
    const newOrder = await sb('orders', {
      method: 'POST',
      body: JSON.stringify({
        org_id: orgId,
        client_id: clientId,
        status: 'lead',
        balcony_type: 'straight',    // дефолт, менеджер поменяет в CRM
        dimensions: {},
        notes: notes || null,
      }),
    });

    const order = (newOrder as any[])[0];
    const orderRef = order.order_number
      ? `№${order.order_number}`
      : `#${String(order.id).slice(0, 8)}`;

    // ── Ответ менеджеру ──────────────────────────────────
    await tgReply(chatId,
      `✅ <b>Заявка создана: ${orderRef}</b>\n\n` +
      `👤 <b>${existing ? existing.name : name}</b>` +
      (isNewClient ? ' <i>(новый клиент)</i>' : ' <i>(существующий клиент)</i>') +
      `\n📞 ${phone}` +
      (notes ? `\n📝 ${notes}` : '') +
      `\n\n🔗 Открой CRM, чтобы дозаполнить детали.`
    );

    return new Response('OK', { status: 200 });

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error('tg-webhook error:', errMsg);
    await tgReply(chatId, `⚠️ Ошибка при создании заявки.\n<code>${errMsg.slice(0, 200)}</code>`);
    return new Response('OK', { status: 200 });
  }
});
