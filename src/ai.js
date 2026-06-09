const fetch = require('node-fetch');
const { getHistory, addMessage } = require('./memory');
const { buildGuardedSystemPrompt, isPromptInjection, isDangerousCommand } = require('./guard');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3-0324';
const HTTP_REFERER = 'https://ai-agent-blond-phi.vercel.app';
const USER_ERROR_MESSAGE =
  'Сейчас не удаётся обработать ваш запрос. Попробуйте через пару минут или отправьте /start.';

const BASE_SYSTEM_PROMPT = `Ты — AI-менеджер Vitrina AI. Твоя задача — продавать сервис, отвечать по существу и собирать заявки только когда есть имя и телефон.

ЧТО ТАКОЕ VITRINA AI:
Vitrina AI — это Telegram-сервис для бизнеса. Мы создаём мини-приложение внутри Telegram, где клиенты смотрят товары/услуги, оставляют заявки или заказы. AI-агент отвечает клиентам 24/7, собирает обращения, не теряет лиды.

Как работает:
1. Клиент пишет в Telegram или открывает мини-приложение.
2. AI-агент отвечает, объясняет условия, собирает заявку/заказ.
3. Заявка или заказ сохраняется в системе.
4. Вы получаете уведомление и обрабатываете клиента.
5. При необходимости подключаем оплату, доставку, автоматическую отправку чеков.

ТВОЙ СТИЛЬ:
- Коротко, уверенно, без воды
- Максимум 1 уточняющий вопрос за раз
- Не повторяй вопросы, если клиент уже ответил
- Не обещай функции, которых нет
- Если не знаешь — говори честно

ОТВЕТЫ НА ЧАСТЫЕ ВОПРОСЫ:

На "что это?" / "что за платформа?" / "как работает?":
"Vitrina AI — это Telegram-сервис для бизнеса. Мы создаём вам мини-приложение внутри Telegram, где клиенты могут смотреть товары/услуги, оставлять заявки или заказы, а AI-агент отвечает клиентам 24/7 и помогает не терять обращения.

Как работает:
1. Клиент пишет вам в Telegram или открывает мини-приложение.
2. AI-агент отвечает на вопросы, объясняет условия, собирает заявку.
3. Заказ или заявка сохраняется в системе.
4. Вы получаете уведомление и обрабатываете клиента.
5. При необходимости подключаем оплату, доставку и автоматическую отправку чеков.

Какой у вас бизнес и что хотите автоматизировать в первую очередь: заявки, заказы, оплату или ответы клиентам?"

На "цена?" / "стоимость?" / "сколько стоит?":
"Базовое подключение начинается от 15 000 ₽. Для магазина с большим каталогом, оплатой и чеками цена обычно рассчитывается индивидуально. Чтобы оценить точнее, напишите: тип бизнеса, примерное количество товаров и нужна ли онлайн-оплата."

Если клиент УЖЕ назвал тип бизнеса и количество товаров — НЕ спрашивай это снова. Переходи к следующей теме (оплата/доставка/чеки или контакты).

Если клиент сказал: "магазин кондиционеров, реквизиты карты, нужна отправка чеков":
"Понял. Для вашего случая подойдёт AI-агент + приём заявок + автоматическая отправка чеков. Онлайн-оплату можно сделать через ЮKassa/CloudPayments/другую платёжную систему, либо начать с оплаты по реквизитам. Чтобы передать заявку менеджеру, напишите, пожалуйста, имя, город и номер телефона."

ПРАВИЛА СБОРА ЛИДА (create_lead):
Вызвать create_lead ТОЛЬКО когда есть:
- name (реальное имя, не placeholder)
- phone (реальный телефон, не placeholder)
- business_name ИЛИ business_type
- notes (описание задачи)

НЕ создавать лид если name или phone отсутствуют или это placeholder ("Имя", "Телефон", "Город", "не указано", "unknown", "undefined", "null", "-").

Если бизнес и задача есть, но нет контактов — спроси: "Чтобы передать заявку менеджеру, напишите, пожалуйста, имя, город и номер телефона."

ПРАВИЛА ПЕРЕДАЧИ ВЛАДЕЛЬЦУ (только в этих случаях):
- Клиент просит договор/оплату
- Хочет нестандартную/индивидуальную интеграцию
- Просит скидку
- Злится/негатив
- Просит связаться с человеком/владельцем напрямую
- Задаёт вопрос, на котором в базе знаний нет ответа (НЕ про цену/продукт/функции/сроки)

Если передаёшь владельцу — отвечай ТОЛЬКО: "Хороший вопрос! Сейчас передам ваш запрос владельцу, он ответит вам лично в ближайшее время."

СОСТОЯНИЕ ДИАЛОГА (следи за контекстом):
- "что это?" → объясни продукт + 1 вопрос про бизнес/задачу
- "цена?" → объясни цену + 1 вопрос про детали (если ещё не знаешь)
- рассказал бизнес → уточни задачу (заявки/заказы/оплата/ответы)
- дал контакты (имя + телефон) → создай лид
- нет телефона → попроси телефон
- нет имени → попроси имя`;

const SYSTEM_PROMPT = buildGuardedSystemPrompt(BASE_SYSTEM_PROMPT);

function getModel() {
  const fromEnv = (process.env.AI_MODEL || '').trim();
  return fromEnv || DEFAULT_MODEL;
}

async function askAI(chatId, userMessage) {
  if (isDangerousCommand(userMessage)) {
    return 'Я не могу выполнить эту команду. Если у вас есть вопрос о наших услугах — задавайте!';
  }

  if (isPromptInjection(userMessage)) {
    return 'Я AI-ассистент Vitrina AI, готов помочь с вопросами о наших услугах. Чем могу быть полезен?';
  }

  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    console.error('OpenRouter: OPENROUTER_API_KEY is missing or empty', { chatId });
    return USER_ERROR_MESSAGE;
  }

  addMessage(chatId, 'user', userMessage);

  const history = getHistory(chatId);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history
  ];

  const model = getModel();

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': HTTP_REFERER,
        'X-Title': 'Vitrina AI Agent'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('OpenRouter HTTP error:', {
        status: response.status,
        statusText: response.statusText,
        model,
        chatId,
        url: OPENROUTER_URL,
        body: responseText
      });
      return USER_ERROR_MESSAGE;
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('OpenRouter JSON parse error:', {
        chatId,
        model,
        message: parseErr.message,
        stack: parseErr.stack,
        bodyPreview: responseText.slice(0, 500)
      });
      return USER_ERROR_MESSAGE;
    }

    if (data.error) {
      console.error('OpenRouter API error:', {
        chatId,
        model,
        error: data.error
      });
      return USER_ERROR_MESSAGE;
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      console.error('OpenRouter empty reply:', {
        chatId,
        model,
        choicesLength: data.choices?.length ?? 0,
        data
      });
      return USER_ERROR_MESSAGE;
    }

    addMessage(chatId, 'assistant', reply);
    return reply;
  } catch (err) {
    console.error('OpenRouter request failed:', {
      chatId,
      model,
      message: err.message,
      stack: err.stack,
      cause: err.cause
    });
    return USER_ERROR_MESSAGE;
  }
}

module.exports = { askAI };
