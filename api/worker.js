// /api/worker — server navbati. Brauzer yopiq bo'lsa ham ishlaydi.
// Kim chaqiradi: (1) brauzer "Boshlash" bosganda va har ~15 s da, (2) pg_cron (supabase/cron.sql), (3) o'zi (zanjir), (4) Vercel cron (kuniga 1 marta).
// Bir vaqtda faqat bitta worker ishlaydi (app_state.lease_until). Har so'rovdan keyin 20 s pauza (PAUSE_SECONDS).
const crypto = require('crypto');
const VISION_PROMPT = require('./_prompt');        // 1-bosqich: rasm modeli (faqat OCR matn)
const TEXT_PROMPT = require('./_prompt_text');     // 2-bosqich: matn modeli (barcha ishni shu qiladi)
const sb = require('./_sb');
globalThis.QW = globalThis.QW || { CFG: {} };
const Q = globalThis.QW;
require('../js/naming.js'); require('../js/validate.js'); require('../js/verify.js');   // brauzer bilan bir xil mantiq

const MODELS = new Set(['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b']);   // RASM modellari (js/config.js bilan bir xil): faqat rasmni matnga aylantiradi
const TEXT_MODEL = process.env.TEXT_MODEL || '';   // MATN modeli: qolgan hamma ishni qiladi (Vercel env: TEXT_MODEL)
const PAUSE_MS = (Number(process.env.PAUSE_SECONDS) || 20) * 1000;   // har so'rovdan keyingi pauza
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 1000;   // qayta urinishlar ham hisobga kiradi
const DEADLINE_MS = 54000;      // maxDuration (60 s) dan kichik: oxirgi ish tugab saqlanishiga zaxira
const MIN_JOB_MS = 40000;       // ish boshlash uchun kamida shuncha vaqt qolishi kerak (Groq'ga ~36 s beriladi)
const MAX_ATTEMPTS = 6;         // bitta rasm shuncha urinishdan keyingina "Xato" bo'ladi
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

async function callGroq(model, image, timeoutMs, opt) {
  opt = opt || {};
  const t0 = Date.now();
  const body = {
    model, temperature: 0.05, max_tokens: opt.max || 16000, reasoning_effort: 'none',   // "o'ylash" tokenlari javobni uzib qo'ymasin
    messages: [{ role: 'user', content: image ? [{ type: 'text', text: opt.text }, { type: 'image_url', image_url: { url: image } }] : opt.text }]
  };
  if (!opt.plain) body.response_format = { type: 'json_object' };   // rasm modeli oddiy matn yozadi, matn modeli JSON
  const once = async () => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), Math.max(5000, timeoutMs - (Date.now() - t0)));
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
    for (let i = 0; i < 3 && r.status === 400; i++) {   // model ba'zi parametrni qabul qilmasa — uni olib tashlab qayta uriniladi
      const m = (data.error && data.error.message) || '';
      if ('reasoning_effort' in body && /reasoning/i.test(m)) delete body.reasoning_effort;
      else if (body.response_format && /response_format|json/i.test(m)) delete body.response_format;
      else if (body.max_tokens > 8000 && /max_tokens|max_completion_tokens|context|too large|too long/i.test(m)) body.max_tokens = 8000;
      else break;
      ({ r, data } = await once());
    }
    if (r.ok) {
      const ch = data.choices && data.choices[0], c = ch && ch.message && ch.message.content;
      if (!c || !String(c).replace(/<think>[\s\S]*?<\/think>/gi, '').trim()) return { kind: 'empty', msg: "Groq bo'sh javob berdi", finish: ch && ch.finish_reason };
      return { kind: 'ok', content: c, finish: ch.finish_reason };
    }
    const msg = (data.error && data.error.message) || 'Groq HTTP ' + r.status, ra = Number(r.headers.get('retry-after')) || 0;
    if (r.status === 401 || r.status === 403) return { kind: 'auth', msg };
    if (r.status === 429) return /per day|\bTPD\b|\bRPD\b/i.test(msg) ? { kind: 'quota', msg, retryMs: (ra || 3600) * 1000 } : { kind: 'rate', msg, retryMs: Math.min(Math.max(ra, 1) * 1000, 120000) };
    if (r.status === 404) return { kind: 'model', msg: (image ? 'Rasm' : 'Matn') + ' modeli topilmadi: ' + model + ' (' + msg + ')' };
    if (r.status === 413) return { kind: 'big', msg };
    if (r.status >= 500 || r.status === 408) return { kind: 'down', msg };
    return { kind: 'bad', msg };
  } catch (e) {
    return e.name === 'AbortError' ? { kind: 'timeout', msg: 'Groq vaqtida javob bermadi' } : { kind: 'down', msg: "Groq'ga ulanib bo'lmadi" };
  }
}

// Javob uzilib qolsa (token tugadi): tugallangan oyatlarni saqlab qoladi
function salvage(text) {
  const s = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const at = s.indexOf('"ayahs"'), st = at < 0 ? -1 : s.indexOf('[', at);
  if (st < 0) return null;
  const ayahs = []; let depth = 0, from = -1, inStr = false, esc = false;
  for (let i = st + 1; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth++ === 0) from = i; }
    else if (ch === '}') { if (--depth === 0 && from >= 0) { try { ayahs.push(JSON.parse(s.slice(from, i + 1))); } catch { /* buzuq oyat tashlanadi */ } from = -1; } }
  }
  if (!ayahs.length) return null;
  const num = /"surah_number"\s*:\s*(\d+)/.exec(s), nm = /"surah"\s*:\s*"([^"]*)"/.exec(s);
  return { surah: nm ? nm[1] : '', surah_number: num ? Number(num[1]) : 0, ayahs };
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

// Transkriptni (RAQAM | ARABCHA | O'ZBEKCHA qatorlari) aynan JSON'ga aylantiradi: modelga qayta yozdirmaymiz (token sarflamaydi, ko'chirishda xato bo'lmaydi)
function parseTranscript(text) {
  const out = { surah: '', surah_number: 0, ayahs: [] };
  let cur = null, last = 0, key = 0, prevNum = 0;
  const open = num => { prevNum = Number(num) > 0 ? Number(num) : prevNum + 1; cur = { number: prevNum, words: [], full_uzbek: '' }; out.ayahs.push(cur); last = 0; };
  String(text || '').split('\n').forEach(raw => {
    const line = raw.trim(); let m;
    if ((m = /^SURA\s*:\s*(.*)$/i.exec(line))) { if (!out.surah) out.surah = m[1].trim(); return; }
    if ((m = /^OYAT\s*:\s*(\d+)?/i.exec(line))) { open(m[1]); return; }
    if ((m = /^TO['\u02bb\u2019`]?LIQ TARJIMA\s*:\s*(.*)$/i.exec(line))) { if (cur) cur.full_uzbek = m[1].trim(); return; }
    const p = line.split('|');
    if (p.length < 3) return;
    const num = /^\d+$/.test(p[0].trim()) ? Number(p[0].trim()) : 0;
    if (!cur || (num && last && num <= last)) open();   // so'z raqami yana 1 dan boshlansa — yangi oyat
    cur.words.push({ index: num || cur.words.length + 1, arabic: p[1].trim(), uzbek: p.slice(2).join('|').trim(), k: String(++key) });
    if (num) last = num;
  });
  return out;
}

// ---------- bitta ishni bajarish ----------
async function processJob(job, deadline, warm) {
  const fail = msg => sb.patchJob(job.id, { status: 'error', message: msg });
  const requeue = (msg, keepAttempt, dropTr) => { const p = { status: 'queued', message: msg, attempts: keepAttempt ? Math.max(0, job.attempts - 1) : job.attempts }; return sb.patchJob(job.id, dropTr ? { ...p, transcript: null } : p).catch(() => sb.patchJob(job.id, p)); };   // dropTr: transkript yaroqsiz — keyingi urinishda rasm qayta o'qiladi
  try {
    if (!MODELS.has(job.model)) return fail("Noma'lum model.");
    if (!(await underLimit(job.user_id))) return fail('Kunlik limit tugadi (' + DAILY_LIMIT + ' ta). Ertaga qayta urining.');
    const image = await sb.downloadImage(job.image_path);
    if (!image) return fail('Rasm serverda topilmadi. Qayta yuklang.');

    const again = msg => job.attempts >= MAX_ATTEMPTS ? fail(msg + ' (' + MAX_ATTEMPTS + ' marta urinildi)') : requeue(msg + '. Qayta uriniladi');
    // Ikkala bosqich (rasm modeli va matn modeli) uchun bir xil xato boshqaruvi. true = ish shu yerda tugadi (qayta navbat/xato).
    const handled = async g => {
      const st = await sb.getState();
      const next = { next_request_at: sb.iso(Date.now() + (g.kind === 'rate' ? Math.max(PAUSE_MS, g.retryMs) : PAUSE_MS)) };
      if (g.kind === 'auth') {
        await sb.patchState(next);
        await halt('groq_key', "Groq API kaliti noto'g'ri yoki ruxsati yo'q. Vercel env'dagi GROQ_API_KEY ni yangilang. (" + g.msg + ')');
        await requeue('Groq kaliti kutilmoqda', true); return true;
      }
      if (g.kind === 'quota') {
        await sb.patchState(next);
        await halt('groq_quota', 'Groq limiti tugadi. Yangi GROQ_API_KEY qo\'ying yoki limit tiklanishini kuting. (' + g.msg + ')', g.retryMs);
        await requeue('Groq limiti tugadi', true); return true;
      }
      if (g.kind === 'rate') { await sb.patchState(next); await requeue("Groq limiti: ~" + Math.round(g.retryMs / 1000) + " s kutilmoqda", true); return true; }
      if (g.kind === 'down') {
        const fc = (st.fail_count || 0) + 1;
        await sb.patchState({ ...next, fail_count: fc });
        // Faqat haqiqiy uzilishlar (5xx / tarmoq) ilovani to'xtatadi va 1 daqiqadan keyin o'zi qayta urinadi.
        if (fc >= 5) { await halt('groq_down', 'Groq API 5 marta ketma-ket javob bermadi: ' + g.msg, 60000); await requeue('Groq ishlamayapti', true); return true; }
        await again('Groq xatosi: ' + g.msg); return true;
      }
      // Vaqt tugashi va bo'sh javob — bitta rasmning muammosi: ilovani to'xtatmaydi, faqat shu rasm qayta uriniladi
      if (g.kind === 'timeout' || g.kind === 'empty') { await sb.patchState(next); await again(g.msg); return true; }
      await sb.patchState({ ...next, fail_count: 0 });
      if (g.kind === 'model') { await fail(g.msg); return true; }
      if (g.kind === 'big') { await fail('Rasm juda katta. Kichikroq rasm yuklang.'); return true; }
      if (g.kind === 'bad') { await (job.attempts >= 3 ? fail(g.msg) : requeue(g.msg + '. Qayta uriniladi')); return true; }
      return false;
    };

    // ---- 1-bosqich: RASM MODELI faqat rasmni oddiy matn (transkript) qiladi ----
    let transcript = String(job.transcript || '').trim(), cutV = false;   // oldingi urinishdan saqlangan transkript bor bo'lsa, rasm modeli qayta chaqirilmaydi (token tejaladi)
    const t0 = Date.now(), avail = deadline - t0;
    if (!transcript) {
      await sb.patchJob(job.id, { message: "1/2: rasm o'qilmoqda" }).catch(() => {});
      const gv = await callGroq(job.model, image, Math.max(12000, Math.min(28000, Math.round(avail * 0.55) - 2000)), { text: VISION_PROMPT, plain: true, max: 8000 });
      if (await handled(gv)) return;
      transcript = String(gv.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[a-z]*/gi, '').trim();
      if (!transcript.split('\n').some(l => (l.match(/\|/g) || []).length >= 2)) return again("Rasmdan matn o'qilmadi");
      if (gv.finish === 'length') { if (job.attempts < MAX_ATTEMPTS) return requeue('Rasm matni uzilib qoldi. Qayta uriniladi'); cutV = true; }
      else sb.patchJob(job.id, { transcript }).catch(() => {});   // keyingi urinishlar uchun saqlab qo'yamiz
    }

    // ---- 2-bosqich: transkriptni server o'zi JSON'ga aylantiradi (aynan ko'chiradi). Matn modeli FAQAT bo'sh tarjimalar uchun chaqiriladi ----
    const parsed = parseTranscript(transcript), blanks = [];
    parsed.ayahs.forEach(a => a.words.forEach(w => { if (!w.uzbek && !/\?\?\?/.test(w.arabic)) blanks.push(w); }));
    let cut = cutV, textUsed = null;
    if (blanks.length) {
      await sb.patchJob(job.id, { message: '2/2: ' + blanks.length + " ta bo'sh tarjima yozilmoqda" }).catch(() => {});
      sb.insertUsage(job.user_id).catch(() => {});
      const lines = []; parsed.ayahs.forEach(a => a.words.forEach(w => lines.push(w.k + ' | ' + w.arabic + ' | ' + (w.uzbek || '_'))));
      const askText = m => callGroq(m, null, Math.max(8000, Math.min(32000, deadline - Date.now() - 3500)), { text: TEXT_PROMPT + lines.join('\n'), max: Math.min(4000, 300 + blanks.length * 40) });
      let tm = TEXT_MODEL || job.model, g = await askText(tm);
      if (g.kind === 'model' && tm !== job.model) { tm = job.model; g = await askText(tm); }   // TEXT_MODEL hisobda yo'q/o'chirilgan: hisobingizda ishlayotgan rasm modeli (matnni ham biladi) ishlatiladi
      if (await handled(g)) return;
      let tr = null; try { tr = parseJSON(g.content).t; } catch (e) { /* quyida */ }
      if (!tr || typeof tr !== 'object') { if (job.attempts < MAX_ATTEMPTS) return requeue('JSON buzuq keldi. Qayta uriniladi'); }   // oxirgi urinishda tarjimasiz saqlanadi
      else blanks.forEach(w => { const s = String(tr[w.k] == null ? '' : tr[w.k]).trim(); if (s) { w.uzbek = s; w.ai = true; } });
      textUsed = tm;
    }
    parsed.ayahs.forEach(a => a.words.forEach(w => { delete w.k; }));
    parsed.transcript = transcript; parsed.models = { vision: job.model, text: textUsed };   // nosozlik bo'lsa: rasm modeli aynan nimani ko'rganini ko'rish uchun
    (parsed.ayahs || []).forEach(a => {                 // full_arabic ni so'zlardan o'zimiz yig'amiz (modelga yozdirmaymiz: tez va aniq)
      if (!a || !Array.isArray(a.words)) return;
      a.words.sort((x, y) => (Number(x.index) || 0) - (Number(y.index) || 0));
      a.full_arabic = a.words.map(w => w.arabic).join(' ');
      if (!String(a.full_uzbek || '').trim()) a.full_uzbek = a.words.map(w => w.uzbek).join(' ');   // to'liq tarjima = kitobdagi so'zma-so'z tarjima, aynan shu tartibda
    });
    let v = Q.validate(parsed);
    if (v.issues.some(i => i.lvl === 'err' && !i.ayah)) return job.attempts >= MAX_ATTEMPTS ? fail('Rasmdan oyat topilmadi (' + MAX_ATTEMPTS + ' marta urinildi)') : requeue('Rasmdan oyat topilmadi. Qayta uriniladi', false, true);

    await sb.patchJob(job.id, { status: 'verifying' });
    await warm;
    let ver = null;
    try { ver = await Q.verify(parsed); } catch (e) { console.error('verify:', e.message); }   // Mus'haf yuklanmasa ham natija saqlanadi
    if (ver && ver.checked === 0 && job.attempts < 3) return requeue("Mus'hafdan mos oyat topilmadi. Qayta uriniladi", false, true);   // o'qish butunlay xato: saqlab "Tayyor" qilmaymiz
    if (ver && ver.degenerate) return fail("Model rasmni o'qiy olmadi: bitta oyatni qayta-qayta yozdi (xira, qiyshiq yoki uzoq rasm). Rasmni yaqinroq, yorug' joyda, tekis holatda qayta oling.");
    if (ver && ver.checked === 0) return fail("Rasmdagi matn Mus'haf bilan mos kelmadi (model rasmni o'qiy olmadi yoki boshqa narsa o'qidi). Rasmni yaqinroq, yorug' joyda, tekis holatda qayta oling.");   // taxminiy/to'qilgan natijani \"Tayyor\" deb saqlamaymiz
    if (ver) v = Q.validate(parsed);
    // Sahifadagi boshqa oyatlarga mos kelmagan (model o'ylab topgan) oyatlar: ko'p bo'lsa qayta uriniladi, oz bo'lsa belgilanadi
    const sus = (parsed.ayahs || []).filter(a => a.suspect).length;
    if (ver && sus && sus * 2 >= (parsed.ayahs || []).length && job.attempts < 3) return requeue("Ko'p oyat sahifaga mos kelmadi (" + sus + " ta). Qayta uriniladi", false, true);
    if (sus) { parsed.suspectCount = sus; v.score = Math.min(v.score || 0, 60); }
    if (cut) { parsed.incomplete = true; v.score = Math.min(v.score || 0, 50); }

    await sb.patchJob(job.id, { status: 'saving' });
    const checkId = await sb.insertCheck({
      id: job.id, user_id: job.user_id, surah: parsed.surah || '', surah_number: parsed.surah_number || null,
      ayah_count: (parsed.ayahs || []).length, score: v.score == null ? null : Math.round(v.score), file_name: Q.name.file(parsed), data: parsed
    });
    await sb.patchJob(job.id, { status: 'done', check_id: checkId, image_path: null, message: (parsed.surah || '') + ' · ' + v.ayahs + ' oyat · ' + v.score + '%' + (sus ? ' · ' + sus + ' ta gumonli oyat' : '') + (cut ? ' · TO\'LIQ EMAS (javob uzilgan)' : '') });
    await sb.removeImage(job.image_path);
  } catch (e) {
    console.error('job', job.id, e.message);
    await sb.patchJob(job.id, job.attempts >= MAX_ATTEMPTS ? { status: 'error', message: e.message } : { status: 'queued', message: 'Server xatosi, qayta uriniladi' }).catch(() => {});
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
  let processed = 0, chain = false, warm = null, errors = 0;
  try {
    for (;;) {
      try {
        const st = await sb.getState();
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
        processed++; errors = 0;
      } catch (e) {                                                     // vaqtinchalik xato (baza/tarmoq) navbatni to'xtatib qo'ymasin
        console.error('loop:', e.message);
        if (++errors >= 3 || deadline - Date.now() < 8000) { await sleep(3000); chain = true; break; }
        await sleep(1500);
      }
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
module.exports.processJob = processJob; module.exports.parseTranscript = parseTranscript;   // test uchun
