// Vercel serverless proxy: brauzer -> /api/groq -> Groq.
// GROQ_API_KEY faqat serverda (Vercel Environment Variables), brauzerga chiqmaydi.
// Kalit hech qachon brauzerga tushmaydi.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Faqat POST' } });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: { message: 'Serverda GROQ_API_KEY sozlanmagan.' } });
  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body
    });
    const text = await r.text();
    const ra = r.headers.get('retry-after');
    if (ra) res.setHeader('retry-after', ra);
    res.status(r.status).setHeader('content-type', 'application/json').send(text);
  } catch (e) {
    res.status(502).json({ error: { message: 'Groq ga ulanib bo\'lmadi: ' + e.message } });
  }
};
module.exports.config = { maxDuration: 60 };
