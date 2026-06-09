const { handleUpdate } = require('../src/bot');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    await handleUpdate(update);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(200).json({ ok: true });
  }
};
