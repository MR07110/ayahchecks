// /api/worker — server navbati. Brauzer yopiq bo'lsa ham ishlaydi.
// Kim chaqiradi: (1) brauzer "Boshlash" bosganda va har ~15 s da, (2) pg_cron (supabase/cron.sql), (3) o'zi (zanjir), (4) Vercel cron (kuniga 1 marta).
// Bir vaqtda faqat bitta worker ishlaydi (app_state.lease_until). Har so'rovdan keyin 20 s pauza (PAUSE_SECONDS).
const crypto = require('crypto');
const PROMPT = require('./_prompt');
const sb = require('./_sb');
globalThis.QW = globalThis.QW || { CFG: {} };
const Q = globalThis.QW;
require('../js/naming.js'); require('../js/validate.js'); require('../js/verify.js');   // brauzer bilan bir xil mantiq

const MODELS = new Set(['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b']);   // js/config.js bilan bir xil
const PAUSE_MS = (Number(process.env.PAUSE_SECONDS) || 20) * 1000;   // har so'rovdan keyingi pauza
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 1000;   // qayta urinishlar ham hisobga kiradi
const DEADLINE_MS = 52000;      // maxDuration (60 s) dan ancha kichik: oxirgi ish tugab saqlanishiga zaxira
const MIN_JOB_MS = 30000;       // ish boshlash uchun kamida shuncha vaqt qolishi kerak
const sleep = ms => new Promise(r => setTimeout(r, ms));
const secret = () => process.env.CRON_SECRET || crypto.createHash('sha256').update('ayahchecks:' + (process.env.SUPABASE_SERVICE_ROLE_KEY || '')).digest('hex');

// ---------- Groq holati ----------
async function probeGroq() {   // tokenlarni sarflamaydi: faqat kalit ishlayaptimi
  const key = process.env.GROQ_API_KEY;
  if (!key) return false;
  try { const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(8000) }); return r.ok; }
  catch { return false; }
}
const halt = (reason, message, resumeMs) => sb.patchState({ halt_reason: reason, halt_message: message, halted_at: sb.iso(), resume_at: resumeMs ? sb.iso(Date.now() + resumeMs) : null, last_probe_at: null });
const clearHalt = () => sb.patchState({ halt_reason: null, halt_message: null, halted_at: null, resume_at: null, fail_count: 0 });

// true = hali to'xtagan. Kalit tuzalgan bo'lsa o'zi tozalaydi va davom etadi (sahifani yangilash shart emas).
async function stillHalted(st) {
  if (!st.halt_reason) return false;
  if (st.resume_at) {                                   // kunlik limit: vaqti kelguncha kutamiz
    if (Date.now() < new Date(st.resume_at)) return true;
    await clearHalt(); return false;
  }
  if (st.last_probe_at && Date.now() - new Date(st.last_probe_at) < 3000) return true;
  await sb.patchState({ last_probe_at: sb.iso() });
  if (!(await probeGroq())) return true;
  await clearHalt(); return false;
}

async function callGroq(model, image, timeoutMs) {
  const body = {
    model, temperature: 0.05, max_tokens: 8000, response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: image } }] }]
  };
  const once = async () => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', signal: ctl.signal,
        headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      return { r, data: await r.json().catch(() => ({})) };
    } finally { clearTimeout(timer); }
  };
  try {
    let { r, data } = await once();
    if (r.status === 400 && /response_format|json/i.test((data.error && data.error.message) || '')) { delete body.response_format; ({ r, data } = await once()); }
    if (r.ok) {
      const ch = data.choices && data.choices[0], c = ch && ch.message && ch.message.content;
      return c ? { kind: 'ok', content: c, finish: ch.finish_reason } : { kind: 'down', msg: "Groq bo'sh javob berdi" };
    }
    const msg = (data.error && data.error.message) || 'Groq HTTP ' + r.status, ra = Number(r.headers.get('retry-after')) || 0;
    if (r.status === 401 || r.status === 403) return { kind: 'auth', msg };
    if (r.status === 429) return /per day|\bTPD\b|\bRPD\b/i.test(msg) ? { kind: 'quota', msg, retryMs: (ra || 3600) * 1000 } : { kind: 'rate', msg, retryMs: Math.min(Math.max(ra, 1) * 1000, 120000) };
    if (r.status === 413) return { kind: 'big', msg };
    if (r.status >= 500 || r.status === 408) return { kind: 'down', msg };
    return { kind: 'bad', msg };
  } catch (e) {
    return { kind: 'down', msg: e.name === 'AbortError' ? 'Groq javob bermadi (vaqt tugadi)' : "Groq'ga ulanib bo'lmadi" };
  }
}

function parseJSON(text) {
  const s = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('JSON formatida javob kelmadi.');
  try { return JSON.parse(s.slice(a, b + 1)); } catch { throw new Error('JSON buzuq keldi.'); }
}

async function underLimit(uid) {   // kunlik limit; xato bo'lsa o'tkazib yuboradi
  try {
    const since = encodeURIComponent(sb.iso(Date.now() - 24 * 3600 * 1000));
    if (await sb.count('api_usage', 'user_id=eq.' + uid + '&created_at=gte.' + since) >= DAILY_LIMIT) return false;
    await sb.insertUsage(uid);
  } catch (e) { console.error('usage limit:', e.message); }
  return true;
}

// ---------- bitta ishni bajarish ----------
async function processJob(job, deadline, warm) {
  const fail = msg => sb.patchJob(job.id, { status: 'error', message: msg });
  const requeue = (msg, keepAttempt) => sb.patchJob(job.id, { status: 'queued', message: msg, attempts: keepAttempt ? Math.max(0, job.attempts - 1) : job.attempts });
  try {
    if (!MODELS.has(job.model)) return fail("Noma'lum model.");
    if (!(await underLimit(job.user_id))) return fail('Kunlik limit tugadi (' + DAILY_LIMIT + ' ta). Ertaga qayta urining.');
    const image = await sb.downloadImage(job.image_path);
    if (!image) return fail('Rasm serverda topilmadi. Qayta yuklang.');

    const g = await callGroq(job.model, image, Math.max(10000, Math.min(50000, deadline - Date.now() - 4000)));
    const st = await sb.getState();
    const next = { next_request_at: sb.iso(Date.now() + (g.kind === 'rate' ? Math.max(PAUSE_MS, g.retryMs) : PAUSE_MS)) };

    if (g.kind === 'auth') {
      await sb.patchState(next);
      await halt('groq_key', "Groq API kaliti noto'g'ri yoki ruxsati yo'q. Vercel env'dagi GROQ_API_KEY ni yangilang. (" + g.msg + ')');
      return requeue('Groq kaliti kutilmoqda', true);
    }
    if (g.kind === 'quota') {
      await sb.patchState(next);
      await halt('groq_quota', 'Groq limiti tugadi. Yangi GROQ_API_KEY qo\'ying yoki limit tiklanishini kuting. (' + g.msg + ')', g.retryMs);
      return requeue('Groq limiti tugadi', true);
    }
    if (g.kind === 'rate') { await sb.patchState(next); return requeue("Groq limiti: ~" + Math.round(g.retryMs / 1000) + " s kutilmoqda", true); }
    if (g.kind === 'down') {
      const fc = (st.fail_count || 0) + 1;
      await sb.patchState({ ...next, fail_count: fc });
      // Groq o'chib qolsa rasm "Xato" bo'lmasin: 5-xatoda ilova to'xtaydi, ish navbatda qoladi.
      // Faqat aynan shu rasm bir necha marta (6+) muammo bersa xato deb belgilanadi.
      if (fc >= 5) { await halt('groq_down', 'Groq API 5 marta ketma-ket javob bermadi: ' + g.msg); return requeue('Groq ishlamayapti', false); }
      return job.attempts >= 6 ? fail(g.msg) : requeue('Groq xatosi, qayta uriniladi: ' + g.msg);
    }
    await sb.patchState({ ...next, fail_count: 0 });
    if (g.kind === 'big') return fail('Rasm juda katta. Kichikroq rasm yuklang.');
    if (g.kind === 'bad') return fail(g.msg);
    if (g.finish === 'length') return fail('Javob uzilib qoldi. Kamroq oyatli rasm yuklang.');

    let parsed;
    try { parsed = parseJSON(g.content); } catch (e) { return job.attempts >= 3 ? fail(e.message) : requeue(e.message + ' Qayta uriniladi.'); }
    let v = Q.validate(parsed);
    if (v.issues.some(i => i.lvl === 'err' && !i.ayah)) return fail('Rasmdan oyat topilmadi. Aniqroq rasm yuklang.');

    await sb.patchJob(job.id, { status: 'verifying' });
    await warm;
    let ver = null;
    try { ver = await Q.verify(parsed); } catch (e) { console.error('verify:', e.message); }   // Mus'haf yuklanmasa ham natija saqlanadi
    if (ver) v = Q.validate(parsed);

    await sb.patchJob(job.id, { status: 'saving' });
    const checkId = await sb.insertCheck({
      id: job.id, user_id: job.user_id, surah: parsed.surah || '', surah_number: parsed.surah_number || null,
      ayah_count: (parsed.ayahs || []).length, score: v.score == null ? null : Math.round(v.score), file_name: Q.name.file(parsed), data: parsed
    });
    await sb.patchJob(job.id, { status: 'done', check_id: checkId, image_path: null, message: (parsed.surah || '') + ' · ' + v.ayahs + ' oyat · ' + v.score + '%' });
    await sb.removeImage(job.image_path);
  } catch (e) {
    console.error('job', job.id, e.message);
    await sb.patchJob(job.id, job.attempts >= 3 ? { status: 'error', message: e.message } : { status: 'queued', message: 'Server xatosi, qayta uriniladi' }).catch(() => {});
  }
}

async function chainNext(req) {   // keyingi worker'ni ishga tushiradi (qulf bo'shatilgandan keyin)
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return;
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 2500);
  try { await fetch('https://' + host + '/api/worker', { method: 'POST', headers: { Authorization: 'Bearer ' + secret() }, signal: ctl.signal }); } catch { /* cron/brauzer baribir qayta ishga tushiradi */ }
}

// Navbatni ishlaydi: har so'rovdan keyin PAUSE_MS pauza. Qulf handler'da olingan; bu yerda bo'shatiladi.
async function loop(req) {
  const t0 = Date.now(), deadline = t0 + DEADLINE_MS;
  let processed = 0, chain = false, warm = null, st;
  try {
    for (;;) {
      st = await sb.getState();
      if (st.halt_reason) break;
      const peek = await sb.rpc('claim_next_job', { p_dry: true });   // ish bormi? (Stop bosilgan bo'lsa bo'sh)
      if (!peek || !peek.length) break;
      if (!warm) warm = Q.verifyLoad().catch(() => null);            // Mus'haf bazasini oldindan yuklab qo'yadi
      const wait = Math.max(0, new Date(st.next_request_at || 0) - Date.now());
      if (deadline - Date.now() - wait < MIN_JOB_MS) {               // vaqt yetmaydi: pauzani o'tkazib, keyingi worker'ga uzatamiz
        await sleep(Math.max(0, Math.min(wait, deadline - Date.now() - 3000)));
        chain = true; break;
      }
      if (wait) await sleep(wait);                                    // 20 s pauza
      const c = await sb.rpc('claim_next_job', { p_dry: false });     // Stop shu orada bosilgan bo'lsa — bo'sh
      if (!c || !c.length) continue;
      await processJob(c[0], deadline, warm);                         // Stop bosilsa ham joriy ish oxirigacha bajariladi
      processed++;
    }
  } finally { await sb.rpc('release_worker').catch(() => {}); }
  if (chain) await chainNext(req);
  return { processed, chained: chain };
}

module.exports = async (req, res) => {
  const need = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k]);
  if (need.length) return res.status(500).json({ error: "Serverda env yo'q: " + need.join(', ') });
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return res.status(401).json({ error: 'Kirish talab qilinadi.' });
  if (m[1] !== secret()) {
    let uid = null; try { uid = await sb.getUser(m[1]); } catch { /* */ }
    if (!uid) return res.status(401).json({ error: 'Sessiya tugagan.' });
  }
  try {
    let st = await sb.getState();
    if (!process.env.GROQ_API_KEY && st.halt_reason !== 'groq_key') { await halt('groq_key', "GROQ_API_KEY Vercel env'da yo'q. Uni qo'shing va Redeploy qiling."); st = await sb.getState(); }
    if (await stillHalted(st)) return res.status(200).json({ status: 'halted', reason: st.halt_reason });

    if (!(await sb.rpc('claim_worker', { p_seconds: 65 }))) return res.status(200).json({ status: 'busy' });
    // Ish javobdan keyin ham davom etadi (waitUntil): brauzer/cron ulanishi uzilsa ham to'xtamaydi
    const job = loop(req).catch(e => console.error('loop:', e.message));
    let waitUntil = null; try { ({ waitUntil } = require('@vercel/functions')); } catch { /* lokal/eski muhit */ }
    if (waitUntil) { waitUntil(job); return res.status(202).json({ status: 'started' }); }
    return res.status(200).json({ status: 'ok', ...(await job) });
  } catch (e) {
    console.error('worker:', e.message);
    await sb.rpc('release_worker').catch(() => {});
    return res.status(500).json({ error: e.message });
  }
};
