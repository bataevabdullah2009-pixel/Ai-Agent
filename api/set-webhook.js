const fetch = require('node-fetch');

function getWebhookBase(req) {
  if (process.env.WEBHOOK_URL) {
    return process.env.WEBHOOK_URL.replace(/\/$/, '');
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return null;

  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const botToken = process.env.BOT_TOKEN;
  const webhookBase = getWebhookBase(req);

  if (!botToken) {
    return res.status(500).json({ ok: false, error: 'BOT_TOKEN not set' });
  }

  if (!webhookBase) {
    return res.status(500).json({ ok: false, error: 'WEBHOOK_URL not set and host unavailable' });
  }

  const webhookTarget = `${webhookBase}/api/telegram`;
  const url = `https://api.telegram.org/bot${botToken}/setWebhook`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookTarget,
        allowed_updates: ['message', 'edited_message']
      })
    });

    const data = await response.json();

    res.status(200).json({
      ok: data.ok,
      description: data.description,
      webhook_url: webhookTarget
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
