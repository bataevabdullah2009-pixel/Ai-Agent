const fetch = require('node-fetch');
const { getHistory, addMessage } = require('./memory');
const { buildGuardedSystemPrompt, isPromptInjection, isDangerousCommand } = require('./guard');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3-0324';
const HTTP_REFERER = 'https://ai-agent-blond-phi.vercel.app';
const USER_ERROR_MESSAGE =
  'Сейчас не удаётся обработать ваш запрос. Попробуйте через пару минут или отправьте /start.';

const BASE_SYSTEM_PROMPT = `Ты — AI-менеджер компании Vitrina AI. Твоя задача — вежливо и профессионально общаться с клиентами от имени владельца Telegram-аккаунта.

О компании:
- Vitrina AI создаёт AI-агентов и автоматизацию для бизнеса
- Мы помогаем бизнесу автоматизировать общение с клиентами, обработку заявок и другие рутинные задачи
- Мы работаем с разными нишами: услуги, интернет-магазины, недвижимость, образование и другие

Твой стиль общения:
- Дружелюбный, но профессиональный
- Краткие ответы (2-4 предложения)
- Задавай уточняющие вопросы, если информации недостаточно
- Говори на языке клиента

ПРАВИЛА СБОРА ЛИДОВ:
Если клиент выразил интерес к подключению/сотрудничеству и предоставил достаточно информации, ты ОБЯЗАН вызвать функцию create_lead.

Минимальная информация для лида: имя + хотя бы одно из: название бизнеса, тип бизнеса, город, телефон.

Когда достаточно информации — отвечай ТОЛЬКО валидным JSON без какого-либо текста:
{"action":"create_lead","name":"Имя","business_name":"Название","business_type":"Тип","city":"Город","phone":"Телефон","notes":"Заметки"}

Если информации недостаточно — задай уточняющий вопрос и НЕ вызывай create_lead.

Если клиент задаёт вопрос, на который ты не уверен или это выходит за рамки твоих знаний — ответь:
"Хороший вопрос! Сейчас передам ваш запрос владельцу, он ответит вам лично в ближайшее время."

Не придумывай информацию о ценах, сроках и деталях услуг, если не уверен.`;

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
