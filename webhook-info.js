const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    return res.status(500).json({ ok: false, error: 'BOT_TOKEN not set' });
  }

  const url = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    res.status(200).json({
      ok: data.ok,
      url: data.result?.url || 'not set',
      pending_update_count: data.result?.pending_update_count || 0,
      last_error_date: data.result?.last_error_date || null,
      last_error_message: data.result?.last_error_message || null
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
