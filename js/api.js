(function (Q) {
  const C = Q.CFG;
  const PROMPT = `Sen Qur'on matni bo'yicha mutaxassissan. Rasmda so'zlar kichik kataklarga ajratilgan; har katakda arabcha so'z va uning tagida o'zbekcha tarjima bor. Katakning chap yuqori burchagida raqam bo'lishi mumkin.

TARTIB:
1. Raqamlar bor bo'lsa — so'zlarni RAQAM tartibida yoz (1, 2, 3...). Arabcha o'ngdan-chapga tartibni qo'llama.
2. Raqamlar yo'q bo'lsa — chapdan o'ngga yoz.

QOIDALAR:
- Har so'z uchun FAQAT o'sha katak ichidagi arabcha va tarjimani ol; boshqa katakdan ko'chirma.
- Arabcha so'zni harakatlari bilan aynan ko'ringanidek yoz. O'zingdan so'z qo'shma, o'zgartirma, tuzatma.
- Tarjima ko'rinmasa yoki xira bo'lsa "???" yoz.
- "full_arabic" — so'zlarning index tartibida birlashtirilgan oyat. "full_uzbek" — ravon tarjima.

FAQAT shu JSON formatda javob ber:
{"surah":"sura nomi (arabcha)","surah_number":0,"ayahs":[{"number":1,"words":[{"index":1,"arabic":"...","uzbek":"..."}],"full_arabic":"...","full_uzbek":"..."}]}`;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const toB64 = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error("Fayl o'qilmadi"));
    r.readAsDataURL(blob);
  });

  // Uzun tomonini MAX_IMG ga keltiradi (arabcha harakatlar o'qilishi uchun sifat yuqori)
  function prepare(file, max = C.MAX_IMG) {
    const log = Q.log.scope('img');
    return new Promise(resolve => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, max / Math.max(img.width, img.height));
        log.info('Rasm o\'qildi', { name: file.name || 'clipboard', type: file.type, kb: Math.round(file.size / 1024), w: img.width, h: img.height });
        if (k === 1) { log.debug('Kichraytirish kerak emas'); return resolve(file); }
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => { log.ok('Rasm kichraytirildi', { w: c.width, h: c.height, kb: Math.round((b || file).size / 1024), scale: +k.toFixed(3) }); resolve(b || file); }, 'image/jpeg', 0.9);
      };
      img.onerror = () => { URL.revokeObjectURL(url); log.warn('Rasmni dekodlab bo\'lmadi — asl fayl yuboriladi'); resolve(file); };
      img.src = url;
    });
  }

  function parseJSON(text) {
    let s = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error("JSON formatida javob kelmadi. Qayta urining.");
    try { return JSON.parse(s.slice(a, b + 1)); }
    catch { throw new Error("JSON buzuq keldi. Qayta urining."); }
  }

  const HTTP = { 401: "API kalit noto'g'ri yoki muddati o'tgan.", 403: "Kalitga ruxsat yo'q.", 413: "Rasm juda katta. Kichikroq rasm yuklang.", 429: "So'rovlar limiti tugadi. Bir daqiqa kutib qayta urining." };

  const fail = (msg, retryable) => Object.assign(new Error(msg), { retryable: !!retryable });
  // Ollama Cloud'da model nomi ':...-cloud' bilan ham, qo'shimchasiz ham uchraydi — topilmasa ikkinchisini sinaydi
  const altName = m => /-cloud$/.test(m) ? m.replace(/-cloud$/, '') : m + '-cloud';
  const fmt = n => n.toLocaleString('en-US').replace(/,/g, ' ');
  const HDRS = ['x-request-id', 'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-tokens', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens', 'retry-after'];

  // SSE oqimini o'qiydi; har ~250 ms da haqiqiy o'lchovlarni log qiladi
  async function readBody(res, log, tSend) {
    const ct = res.headers.get('content-type') || '';
    if (!/event-stream/i.test(ct)) {
      log.warn('Server oqim (stream) qaytarmadi — oddiy JSON o\'qilmoqda', { ct });
      const d = await res.json(), ch = d.choices && d.choices[0];
      return { content: ch && ch.message && ch.message.content, finish: ch && ch.finish_reason, usage: d.usage || null, chunks: 1, think: 0 };
    }
    const rd = res.body.getReader(), dec = new TextDecoder();
    let buf = '', content = '', think = 0, finish = null, usage = null, chunks = 0, tFirst = 0, tFirstOut = 0, lastN = 0, lastC = 0, lastT = performance.now();
    const tick = setInterval(() => {
      const now = performance.now(), dt = (now - lastT) / 1000;
      if (chunks === lastN) { log.debug('Oqim to\'xtab turibdi… ' + ((now - lastT) / 1000).toFixed(1) + ' s'); return; }
      const tail = content.slice(-48).replace(/\s+/g, ' ');
      log.info('▸ ' + fmt(content.length) + ' belgi · ' + fmt(chunks) + ' chunk · ' + Math.round((chunks - lastN) / dt) + ' chunk/s · ' + Math.round((content.length - lastC) / dt) + ' bel/s' + (think ? ' · fikr ' + fmt(think) : ''), tail ? { tail } : undefined);
      lastN = chunks; lastC = content.length; lastT = now;
    }, 250);
    try {
      for (; ;) {
        const { done, value } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const ln = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!ln.startsWith('data:')) continue;
          const p = ln.slice(5).trim(); if (p === '[DONE]') { log.debug('[DONE] belgisi keldi'); continue; }
          let j; try { j = JSON.parse(p); } catch { log.debug('Buzuq SSE bo\'lagi o\'tkazib yuborildi'); continue; }
          if (j.error) throw fail((j.error.message || safeStr(j.error)), true);
          chunks++;
          if (!tFirst) { tFirst = performance.now(); log.ok('Birinchi chunk keldi', { ttfb_ms: Math.round(tFirst - tSend) }); }
          const c = j.choices && j.choices[0];
          if (c) {
            const d = c.delta || {}, r = d.reasoning || d.reasoning_content;
            if (r) think += r.length;
            if (d.content) { if (!tFirstOut) { tFirstOut = performance.now(); log.ok('Birinchi javob belgisi', { ttft_ms: Math.round(tFirstOut - tSend) }); } content += d.content; }
            if (c.finish_reason) { finish = c.finish_reason; log.info('finish_reason: ' + finish); }
          }
          if (j.usage) usage = j.usage; else if (j.x_groq && j.x_groq.usage) usage = j.x_groq.usage;
        }
      }
    } finally { clearInterval(tick); }
    const secs = (performance.now() - (tFirstOut || tFirst || tSend)) / 1000;
    log.ok('Oqim tugadi', { belgi: content.length, chunk: chunks, fikr_belgi: think || undefined, belgi_s: secs > 0 ? Math.round(content.length / secs) : null });
    return { content, finish, usage, chunks, think };
  }
  const safeStr = d => { try { return JSON.stringify(d); } catch { return String(d); } };

  async function analyze({ file, key, model, provider = 'groq', onStatus }) {
    const P = C.PROVIDERS[provider], log = Q.log.scope('api'); let renamed = false;
    const tB = performance.now(), b64 = await toB64(file), t0 = performance.now();
    log.debug('Base64 tayyor', { kb: Math.round(b64.length * 0.75 / 1024), ms: Math.round(t0 - tB) });
    const body = {
      model, temperature: 0.05, max_tokens: C.MAX_TOKENS, stream: true, response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: 'data:' + (file.type || 'image/jpeg') + ';base64,' + b64 } }
      ] }]
    };
    log.info(P.name + ' → ' + model, { temperature: body.temperature, max_tokens: body.max_tokens, stream: true, json_mode: true, prompt_chars: PROMPT.length, key_len: key.length });
    for (let attempt = 0; ; attempt++) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), C.TIMEOUT_MS), tSend = performance.now();
      log.info('So\'rov yuborildi (urinish ' + (attempt + 1) + '/' + (C.RETRIES + 1) + ')', { url: P.url, model: body.model });
      const waitT = setInterval(() => log.debug('Server javobi kutilmoqda… ' + ((performance.now() - tSend) / 1000).toFixed(1) + ' s'), 500);
      let res;
      try {
        res = await fetch(P.url, {
          method: 'POST', signal: ctl.signal,
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } catch (e) {
        clearInterval(waitT); clearTimeout(timer);
        if (e.name === 'AbortError') { log.err('Vaqt tugadi', { s: C.TIMEOUT_MS / 1000 }); throw fail("Vaqt tugadi (" + C.TIMEOUT_MS / 1000 + " s). Qayta urining.", true); }
        log.err('Tarmoq xatosi / CORS', { msg: e.message, online: navigator.onLine });
        throw fail(P.name + ": tarmoq xatosi yoki CORS (brauzerdan to'g'ridan-to'g'ri so'rov ruxsat etilmagan bo'lishi mumkin).", true);
      }
      clearInterval(waitT);
      const hd = {}; HDRS.forEach(k => { const v = res.headers.get(k); if (v != null) hd[k.replace(/^x-/, '')] = v; });
      log[res.ok ? 'ok' : 'warn']('HTTP ' + res.status + ' · sarlavha ' + Math.round(performance.now() - tSend) + ' ms', Object.keys(hd).length ? hd : undefined);
      if (res.ok) {
        let out;
        try { out = await readBody(res, log, tSend); }
        catch (e) {
          clearTimeout(timer);
          if (e.name === 'AbortError') { log.err('Oqim vaqti tugadi', { s: C.TIMEOUT_MS / 1000 }); throw fail("Vaqt tugadi (" + C.TIMEOUT_MS / 1000 + " s). Qayta urining.", true); }
          log.err('Oqimni o\'qishda xato: ' + e.message); throw e.retryable === undefined ? fail(e.message, true) : e;
        }
        clearTimeout(timer);
        if (!out.content) { log.err('Bo\'sh javob', { finish: out.finish }); throw fail("Bo'sh javob."); }
        if (out.finish === 'length') { log.err('Javob uzilib qoldi (max_tokens)', { max_tokens: C.MAX_TOKENS }); throw fail("Javob uzilib qoldi. Kamroq oyatli rasm yuklang."); }
        if (out.usage) log.info('Token hisobi', out.usage);
        const p0 = performance.now(), parsed = parseJSON(out.content);
        log.ok('JSON tahlil qilindi', { ayahs: (parsed.ayahs || []).length, ms: Math.round(performance.now() - p0) });
        return { parsed, usage: out.usage || null, ms: Math.round(performance.now() - t0) };
      }
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      const msg = (data.error && data.error.message) || 'HTTP ' + res.status;
      log.warn('Xato javobi: ' + msg);
      if (res.status === 400 && body.response_format && /response_format|json/i.test(msg)) { log.warn('JSON-mode qo\'llanmadi — usiz qayta uriniladi'); delete body.response_format; continue; }
      if (provider === 'ollama' && !renamed && (res.status === 404 || /not found/i.test(msg))) { renamed = true; const old = body.model; body.model = altName(old); log.warn('Model topilmadi — nom almashtirildi', { from: old, to: body.model }); continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < C.RETRIES) {
        const wait = Number(res.headers.get('retry-after')) || 2 ** (attempt + 1);
        log.warn('Qayta urinish ' + wait + ' s dan keyin', { status: res.status, attempt: attempt + 1 });
        onStatus && onStatus('Qayta urinilmoqda (' + (attempt + 1) + '/' + C.RETRIES + ')...');
        await sleep(wait * 1000); continue;
      }
      log.err(P.name + ' rad etdi', { status: res.status });
      throw fail(P.name + ': ' + (HTTP[res.status] || msg), res.status === 429 || res.status >= 500);
    }
  }
  Q.api = { prepare, analyze };
})(window.QW);
