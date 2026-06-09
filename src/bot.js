const fetch = require('node-fetch');
const { askAI } = require('./ai');
const { createLead } = require('./supabase');
const { isExcludedChat } = require('./guard');
const { clearHistory } = require('./memory');

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

async function sendMessage(chatId, text, options = {}) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...options
  };

  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error('sendMessage HTTP error:', {
        chatId,
        status: res.status,
        statusText: res.statusText,
        body: errorBody
      });
    }
  } catch (err) {
    console.error('sendMessage request failed:', {
      chatId,
      message: err.message,
      stack: err.stack
    });
  }
}

async function sendAdminNotification(text) {
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (!adminChatId) return;
  await sendMessage(adminChatId, text);
}

const FORBIDDEN_VALUES = new Set([
  'имя', 'телефон', 'город', 'не указано', 'unknown', 'undefined', 'null', '-', ''
]);

function isPlaceholder(value) {
  if (!value) return true;
  const normalized = String(value).trim().toLowerCase();
  return FORBIDDEN_VALUES.has(normalized);
}

function isValidLeadData(data) {
  if (!data) return false;
  
  if (isPlaceholder(data.name)) return false;
  if (isPlaceholder(data.phone)) return false;
  if (isPlaceholder(data.business_name) && isPlaceholder(data.business_type)) return false;
  if (isPlaceholder(data.notes)) return false;
  
  return true;
}

function extractLeadData(aiReply) {
  try {
    const match = aiReply.match(/\{[\s\S]*"action"\s*:\s*"create_lead"[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    if (parsed.action === 'create_lead') return parsed;
    return null;
  } catch (err) {
    console.error('extractLeadData parse error:', {
      message: err.message,
      stack: err.stack,
      aiReplyPreview: String(aiReply).slice(0, 200)
    });
    return null;
  }
}

function isUncertainResponse(text) {
  const lower = text.toLowerCase();
  
  const priceKeywords = ['цена', 'стоимость', 'подключение', 'функц', 'срок', 'запуск', 'базов'];
  const isPriceRelated = priceKeywords.some(kw => lower.includes(kw));
  
  const uncertainPhrases = [
    'передам',
    'владельцу',
    'лично',
    'ближайшее время',
    'owner',
    'не уверен',
    'не знаю',
    'базе знаний нет',
  ];
  
  const hasUncertainPhrase = uncertainPhrases.some(p => lower.includes(p));
  
  return hasUncertainPhrase && !isPriceRelated;
}

async function handleMessage(message) {
  if (!message.text && !message.caption) return;

  const chatId = message.chat.id;
  const text = message.text || message.caption || '';
  const from = message.from;
  const chatType = message.chat.type;

  if (isExcludedChat(chatId)) return;

  if (chatType !== 'private') return;

  if (text.startsWith('/start')) {
    await sendMessage(chatId, 'Привет! Я AI-ассистент Vitrina AI. Чем могу помочь?');
    return;
  }

  if (text.startsWith('/reset')) {
    clearHistory(chatId);
    await sendMessage(chatId, 'История диалога очищена. Начнём сначала!');
    return;
  }

  if (text.startsWith('/lead')) {
    await sendMessage(chatId, 'Чтобы оставить заявку, просто опишите ваш бизнес и задачи — я помогу оформить.');
    return;
  }

  console.log(`[${chatId}] ${from?.first_name}: ${text}`);

  let aiReply;
  try {
    aiReply = await askAI(chatId, text);
  } catch (err) {
    console.error('handleMessage askAI error:', {
      chatId,
      message: err.message,
      stack: err.stack
    });
    await sendMessage(
      chatId,
      'Сейчас не удаётся обработать ваш запрос. Попробуйте через пару минут или отправьте /start.'
    );
    return;
  }

  const leadData = extractLeadData(aiReply);

  if (leadData) {
    const leadText = leadData.notes || text;

    const hasBusinessInfo = !isPlaceholder(leadData.business_name) || !isPlaceholder(leadData.business_type);
    const hasTaskInfo = !isPlaceholder(leadText);
    const hasName = !isPlaceholder(leadData.name);
    const hasPhone = !isPlaceholder(leadData.phone);

    if (!hasName || !hasPhone) {
      await sendMessage(chatId, 'Понял задачу. Чтобы передать заявку менеджеру, напишите, пожалуйста, ваше имя, город и номер телефона.');
      return;
    }

    if (!hasBusinessInfo || !hasTaskInfo) {
      await sendMessage(chatId, 'Для оформления заявки мне нужно узнать ваш бизнес и задачу. Расскажите, пожалуйста, подробнее.');
      return;
    }

    const lead = await createLead({
      chat_id: chatId,
      name: leadData.name,
      business_name: leadData.business_name,
      business_type: leadData.business_type,
      city: leadData.city,
      phone: leadData.phone,
      notes: leadText
    });

    if (lead) {
      await sendMessage(chatId, `Спасибо, ${leadData.name}! Заявка принята. Менеджер свяжется с вами в ближайшее время.`);

      const adminChatId = process.env.ADMIN_CHAT_ID;
      if (adminChatId && String(adminChatId) !== String(chatId)) {
        await sendAdminNotification(
          `Новый лид!\n` +
          `Имя: ${leadData.name}\n` +
          `Бизнес: ${leadData.business_name || '—'}\n` +
          `Тип: ${leadData.business_type || '—'}\n` +
          `Город: ${leadData.city || '—'}\n` +
          `Телефон: ${leadData.phone}\n` +
          `Заметки: ${leadText}\n` +
          `Chat ID: ${chatId}\n` +
          `Username: @${from?.username || '—'}`
        );
      } else if (adminChatId && String(adminChatId) === String(chatId)) {
        await sendAdminNotification(
          `[ТЕСТ] Уведомление админу\n` +
          `Новый лид!\n` +
          `Имя: ${leadData.name}\n` +
          `Бизнес: ${leadData.business_name || '—'}\n` +
          `Тип: ${leadData.business_type || '—'}\n` +
          `Город: ${leadData.city || '—'}\n` +
          `Телефон: ${leadData.phone}\n` +
          `Заметки: ${leadText}\n` +
          `Chat ID: ${chatId}\n` +
          `Username: @${from?.username || '—'}`
        );
      }
    } else {
      await sendMessage(chatId, 'Произошла ошибка при сохранении заявки. Попробуйте позже или напишите напрямую владельцу.');
    }

    return;
  }

  if (isUncertainResponse(aiReply)) {
    await sendMessage(chatId, aiReply);

    await sendAdminNotification(
      `Клиент нуждается в помощи\n\n` +
      `Имя: ${from?.first_name || '—'}\n` +
      `Username: @${from?.username || '—'}\n` +
      `Chat ID: ${chatId}\n` +
      `Сообщение: ${text}\n` +
      `Ответ AI: ${aiReply}`
    );
    return;
  }

  await sendMessage(chatId, aiReply);
}

async function handleUpdate(update) {
  try {
    const message = update.message || update.edited_message;
    if (message) {
      await handleMessage(message);
    }
  } catch (err) {
    console.error('handleUpdate error:', {
      updateId: update?.update_id,
      message: err.message,
      stack: err.stack
    });
    throw err;
  }
}

module.exports = { handleUpdate, sendMessage, sendAdminNotification };
