// POST /api/analyze  — Groq'ni serverdan chaqiradi (kalit brauzerga chiqmaydi).
// Kirish: Authorization: Bearer <Supabase access token>, body: { image: "data:image/...;base64,...", model }
const PROMPT = require('./_prompt');

const MODELS = new Set(['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b']); // js/config.js dagi MODELS bilan bir xil
const MAX_TOKENS = 8000;
const GROQ_TIMEOUT_MS = 55000;               // vercel.json dagi maxDuration (60 s) dan kichik
const MAX_IMAGE_CHARS = 4.2 * 1024 * 1024;   // Vercel body limiti ~4.5 MB
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 40;

const err = (res, status, message, extra) => {
  if (extra && extra['Retry-After']) res.setHeader('Retry-After', extra['Retry-After']);
  return res.status(status).json({ error: message });
};

// Supabase token haqiqiy ekanini tekshiradi va foydalanuvchi id sini qaytaradi
async function getUser(token) {
  const r = await fetch(process.env.SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id ? u.id : null;
}

// Service kalit bilan REST sarlavhalari (yangi sb_secret_ kalit JWT emas, faqat apikey da yuboriladi)
function svcHeaders(extra) {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const h = { apikey: k, 'Content-Type': 'application/json', ...extra };
  if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;
  return h;
}

// Kunlik limit: api_usage jadvalida so'nggi 24 soatdagi so'rovlarni sanaydi. Xato bo'lsa — o'tkazib yuboradi (log bilan).
async function checkLimit(uid) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: true };
  try {
    const base = process.env.SUPABASE_URL + '/rest/v1/api_usage';
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const c = await fetch(base + '?select=id&limit=1&user_id=eq.' + uid + '&created_at=gte.' + encodeURIComponent(since),
      { headers: svcHeaders({ Prefer: 'count=exact' }) });
    if (!c.ok) throw new Error('count HTTP ' + c.status);
    const total = Number((c.headers.get('content-range') || '').split('/')[1]);
    if (Number.isFinite(total) && total >= DAILY_LIMIT) return { ok: false };
    const i = await fetch(base, { method: 'POST', headers: svcHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ user_id: uid }) });
    if (!i.ok) throw new Error('insert HTTP ' + i.status);
  } catch (e) { console.error('usage limit:', e.message); }
  return { ok: true };
}

async function callGroq(body) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), GROQ_TIMEOUT_MS);
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    return { r, data };
  } finally { clearTimeout(timer); }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return err(res, 405, 'Faqat POST.');
  const need = ['GROQ_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter(k => !process.env[k]);
  if (need.length) return err(res, 500, "Serverda env yo'q: " + need.join(', '));

  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return err(res, 401, 'Kirish talab qilinadi.');
  let uid;
  try { uid = await getUser(m[1]); } catch { return err(res, 502, "Autentifikatsiya serveriga ulanib bo'lmadi."); }
  if (!uid) return err(res, 401, 'Sessiya tugagan. Sahifani yangilang.');

  const { image, model } = req.body || {};
  if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,/.test(image)) return err(res, 400, "Rasm noto'g'ri formatda.");
  if (image.length > MAX_IMAGE_CHARS) return err(res, 413, 'Rasm juda katta. Kichikroq rasm yuklang.');
  if (!MODELS.has(model)) return err(res, 400, "Noma'lum model.");

  const lim = await checkLimit(uid);
  if (!lim.ok) return err(res, 429, "Kunlik limit tugadi (" + DAILY_LIMIT + " ta). Ertaga qayta urining.");

  const body = {
    model, temperature: 0.05, max_tokens: MAX_TOKENS, response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: image } }] }]
  };
  try {
    let { r, data } = await callGroq(body);
    const msg0 = (data.error && data.error.message) || '';
    if (r.status === 400 && /response_format|json/i.test(msg0)) { delete body.response_format; ({ r, data } = await callGroq(body)); }

    if (r.ok) {
      const ch = data.choices && data.choices[0];
      if (!ch || !ch.message || !ch.message.content) return err(res, 502, "Bo'sh javob.");
      return res.status(200).json({ content: ch.message.content, finish_reason: ch.finish_reason || null, usage: data.usage || null });
    }
    const msg = (data.error && data.error.message) || 'Groq HTTP ' + r.status;
    console.error('groq', r.status, msg);
    if (r.status === 429) return err(res, 429, "So'rovlar limiti tugadi. Bir daqiqa kutib qayta urining.", { 'Retry-After': r.headers.get('retry-after') });
    if (r.status === 413) return err(res, 413, 'Rasm juda katta. Kichikroq rasm yuklang.');
    if (r.status === 401 || r.status === 403) return err(res, 502, "Serverdagi Groq kaliti noto'g'ri yoki ruxsati yo'q.");
    return err(res, 502, msg);
  } catch (e) {
    if (e.name === 'AbortError') return err(res, 504, 'Vaqt tugadi. Qayta urining.');
    console.error(e);
    return err(res, 502, "Groq'ga ulanib bo'lmadi.");
  }
};
