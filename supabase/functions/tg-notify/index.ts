// Edge Function: tg-notify
// Отправляет сообщение в Telegram-группу через Bot API.
//
// POST { chat: 'installments' | 'crm' | string (chat_id), text: string, parse_mode?: 'HTML' | 'MarkdownV2' }
//
// Если chat это строка 'installments' или 'crm' — берётся соответствующий chat_id из секретов.
// Если chat начинается с '-' или это число — используется как chat_id напрямую.

// @ts-ignore - Deno globals доступны в Edge Function рантайме
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
// @ts-ignore
const TG_CHAT_INSTALLMENTS = Deno.env.get('TG_CHAT_INSTALLMENTS');
// @ts-ignore
const TG_CHAT_CRM = Deno.env.get('TG_CHAT_CRM');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Payload {
  chat: 'installments' | 'crm' | string;
  text: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
}

function resolveChatId(chat: string): string | null {
  if (chat === 'installments') return TG_CHAT_INSTALLMENTS || null;
  if (chat === 'crm') return TG_CHAT_CRM || null;
  // Прямой chat_id (отрицательное число или просто число)
  if (/^-?\d+$/.test(chat)) return chat;
  return null;
}

// @ts-ignore
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!TELEGRAM_BOT_TOKEN) {
    return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { chat, text, parse_mode } = payload;
  if (!chat || !text) {
    return new Response(
      JSON.stringify({ error: 'Required fields: chat, text' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const chatId = resolveChatId(chat);
  if (!chatId) {
    return new Response(
      JSON.stringify({ error: `Unknown chat: ${chat}. Use 'installments', 'crm', or chat_id` }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Шлём в Telegram
  try {
    const tgResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parse_mode || 'HTML',
          disable_web_page_preview: true,
        }),
      }
    );

    const tgResult = await tgResponse.json();

    if (!tgResult.ok) {
      return new Response(
        JSON.stringify({ error: 'Telegram API error', details: tgResult }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, message_id: tgResult.result.message_id }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Network error', message: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
