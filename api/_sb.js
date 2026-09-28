// Supabase REST yordamchilari (faqat server; service kalit bilan). Hech qanday paket kerak emas.
const base = () => process.env.SUPABASE_URL;

// Yangi sb_secret_ kalit JWT emas — faqat apikey da yuboriladi; eski eyJ... kalit Authorization ham talab qiladi
function headers(extra) {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const h = { apikey: k, 'Content-Type': 'application/json', ...extra };
  if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;
  return h;
}
async function rest(method, path, body, prefer) {
  const r = await fetch(base() + '/rest/v1/' + path, {
    method, headers: headers(prefer ? { Prefer: prefer } : {}), body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(method + ' ' + path.split('?')[0] + ' HTTP ' + r.status + ': ' + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}
const iso = ms => new Date(ms == null ? Date.now() : ms).toISOString();

module.exports = {
  iso,
  rpc: (fn, args) => rest('POST', 'rpc/' + fn, args || {}),
  async getState() { return (await rest('GET', 'app_state?id=eq.1&select=*'))[0] || {}; },
  patchState: patch => rest('PATCH', 'app_state?id=eq.1', { ...patch, updated_at: iso() }, 'return=minimal'),
  patchJob: (id, patch) => rest('PATCH', 'jobs?id=eq.' + id, { ...patch, updated_at: iso() }, 'return=minimal'),
  // id = job id: qayta urinishda ikkinchi nusxa yaratilmaydi (dublikat e'tiborsiz qoldiriladi)
  async insertCheck(rec) { await rest('POST', 'checks?on_conflict=id', rec, 'resolution=ignore-duplicates,return=minimal'); return rec.id; },
  async count(table, filter) {
    const r = await fetch(base() + '/rest/v1/' + table + '?select=id&limit=1&' + filter, { headers: headers({ Prefer: 'count=exact' }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('count HTTP ' + r.status);
    return Number((r.headers.get('content-range') || '').split('/')[1]);
  },
  insertUsage: uid => rest('POST', 'api_usage', { user_id: uid }, 'return=minimal'),
  // Storage'dan rasmni data: URL qilib qaytaradi (topilmasa null)
  async downloadImage(path) {
    const r = await fetch(base() + '/storage/v1/object/images/' + path.split('/').map(encodeURIComponent).join('/'), { headers: headers(), signal: AbortSignal.timeout(20000) });
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) throw new Error('Storage HTTP ' + r.status);
    const type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const buf = Buffer.from(await r.arrayBuffer());
    return 'data:' + (/^image\//.test(type) ? type : 'image/jpeg') + ';base64,' + buf.toString('base64');
  },
  async removeImage(path) {
    try { await fetch(base() + '/storage/v1/object/images', { method: 'DELETE', headers: headers(), body: JSON.stringify({ prefixes: [path] }), signal: AbortSignal.timeout(10000) }); } catch { /* muhim emas */ }
  },
  async getUser(token) {   // brauzer tokenini tekshiradi
    const r = await fetch(base() + '/auth/v1/user', { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const u = await r.json().catch(() => null);
    return u && u.id ? u.id : null;
  }
};
