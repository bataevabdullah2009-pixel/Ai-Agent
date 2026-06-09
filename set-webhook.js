const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
  const botToken = process.env.BOT_TOKEN;
  const webhookUrl = process.env.WEBHOOK_URL;

  if (!botToken || !webhookUrl) {
    return res.status(500).json({
      ok: false,
      error: 'BOT_TOKEN or WEBHOOK_URL not set'
    });
  }

  const url = `https://api.telegram.org/bot${botToken}/setWebhook`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `${webhookUrl}/api/telegram`,
        allowed_updates: ['message', 'edited_message']
      })
    });

    const data = await response.json();

    res.status(200).json({
      ok: data.ok,
      description: data.description,
      webhook_url: `${webhookUrl}/api/telegram`
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
