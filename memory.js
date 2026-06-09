const conversations = new Map();

const MAX_MESSAGES = 20;
const TTL_MS = 60 * 60 * 1000;

function getHistory(chatId) {
  const entry = conversations.get(chatId);
  if (!entry) return [];

  if (Date.now() - entry.updatedAt > TTL_MS) {
    conversations.delete(chatId);
    return [];
  }

  entry.updatedAt = Date.now();
  return entry.messages;
}

function addMessage(chatId, role, content) {
  const entry = conversations.get(chatId) || { messages: [], updatedAt: Date.now() };

  entry.messages.push({ role, content });

  if (entry.messages.length > MAX_MESSAGES) {
    entry.messages = entry.messages.slice(-MAX_MESSAGES);
  }

  entry.updatedAt = Date.now();
  conversations.set(chatId, entry);
}

function clearHistory(chatId) {
  conversations.delete(chatId);
}

module.exports = { getHistory, addMessage, clearHistory };
