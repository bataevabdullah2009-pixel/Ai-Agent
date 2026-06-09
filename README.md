# Telegram AI Agent — Vercel Edition

AI-менеджер для Telegram Business на Vercel Serverless.

## Структура файлов

```
telegram-ai-agent/
├── api/
│   ├── telegram.js      — POST /api/telegram (webhook endpoint)
│   ├── set-webhook.js   — GET /api/set-webhook (установка webhook)
│   └── webhook-info.js  — GET /api/webhook-info (проверка webhook)
├── src/
│   ├── bot.js           — Обработка сообщений Telegram
│   ├── ai.js            — OpenRouter + system prompt
│   ├── memory.js        — Память диалогов по chat_id
│   ├── supabase.js      — Создание лидов в Supabase
│   └── guard.js         — Защита от инъекций
├── schema.sql           — SQL для таблицы leads
├── vercel.json          — Конфигурация Vercel
├── .env.example         — Шаблон переменных
└── package.json
```

---

## 1. Получение ключей

### Telegram Bot Token
1. [@BotFather](https://t.me/BotFather) → `/newbot`
2. Скопируй токен

### OpenRouter API Key
1. [openrouter.ai](https://openrouter.ai) → Keys → Create

### Supabase
1. [supabase.com](https://supabase.com) → New Project
2. Settings → API → URL + service_role key

### Telegram User ID (ADMIN_CHAT_ID)
1. [@userinfobot](https://t.me/userinfobot) → `/start`

---

## 2. Настройка Supabase

Выполни в SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  name TEXT,
  business_name TEXT,
  business_type TEXT,
  city TEXT,
  phone TEXT,
  notes TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_chat_id ON leads(chat_id);
CREATE INDEX idx_leads_status ON leads(status);
```

---

## 3. Деплой на Vercel

### Через CLI
```bash
# Установи Vercel CLI
npm i -g vercel

# Войди
vercel login

# Деплой
cd telegram-ai-agent
vercel --prod
```

### Через GitHub
1. Загрузи код на GitHub
2. [vercel.com/new](https://vercel.com/new) → Import Git Repository
3. Выбери репозиторий
4. Framework: Node.js
5. Deploy

### Добавь Environment Variables
В Dashboard → Settings → Environment Variables добавь:

| Variable | Значение |
|---|---|
| `BOT_TOKEN` | Токен от BotFather |
| `OPENROUTER_API_KEY` | API ключ OpenRouter |
| `SUPABASE_URL` | URL Supabase проекта |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `ADMIN_CHAT_ID` | Твой Telegram user ID |
| `WEBHOOK_URL` | `https://твой-проект.vercel.app` |
| `EXCLUDED_CHATS` | ID чатов через запятую (опционально) |

### Установи webhook
После деплоя открой:
```
https://твой-проект.vercel.app/api/set-webhook
```

Ответ должен быть:
```json
{"ok": true, "description": "Webhook was set", "webhook_url": "https://...vercel.app/api/telegram"}
```

### Проверь webhook
```
https://твой-проект.vercel.app/api/webhook-info
```

---

## 4. Подключение Telegram Business

1. Telegram → Настройки → Telegram Business → Автоматизация чатов
2. Нажми «Подключить бота»
3. Выбери своего бота
4. Включи «Обрабатывать все входящие сообщения»

---

## 5. API Endpoints

| Endpoint | Method | Описание |
|---|---|---|
| `/api/telegram` | POST | Webhook от Telegram |
| `/api/set-webhook` | GET | Установить webhook |
| `/api/webhook-info` | GET | Информация о текущем webhook |

---

## 6. Команды бота

| Команда | Описание |
|---|---|
| `/start` | Приветствие |
| `/reset` | Очистить историю диалога |
| `/lead` | Информация о заявке |

---

## 7. Важно о Serverless

В Vercel Serverless Functions память (`Map`) не сохраняется между вызовами.
Для продакшена замени `src/memory.js` на:

- **Vercel KV** (Redis) — fastest
- **Supabase** — хранить историю в таблице `conversations`

Текущая реализация работает для тестов: история живёт в рамках одного function instance.
