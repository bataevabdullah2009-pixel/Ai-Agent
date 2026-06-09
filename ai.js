const fetch = require('node-fetch');
const { getHistory, addMessage } = require('./memory');
const { buildGuardedSystemPrompt, isPromptInjection, isDangerousCommand } = require('./guard');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openai/gpt-4o-mini';

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

async function askAI(chatId, userMessage) {
  if (isDangerousCommand(userMessage)) {
    return 'Я не могу выполнить эту команду. Если у вас есть вопрос о наших услугах — задавайте!';
  }

  if (isPromptInjection(userMessage)) {
    return 'Я AI-ассистент Vitrina AI, готов помочь с вопросами о наших услугах. Чем могу быть полезен?';
  }

  addMessage(chatId, 'user', userMessage);

  const history = getHistory(chatId);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history
  ];

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://github.com/vitrina-ai',
      'X-Title': 'Vitrina AI Agent'
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('OpenRouter error:', response.status, err);
    addMessage(chatId, 'assistant', 'Извините, произошла ошибка. Попробуйте позже.');
    return 'Извините, произошла техническая ошибка. Попробуйте отправить сообщение ещё раз.';
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || 'Не удалось получить ответ.';

  addMessage(chatId, 'assistant', reply);

  return reply;
}

module.exports = { askAI };
