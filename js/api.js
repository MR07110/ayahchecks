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
    return new Promise(resolve => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, max / Math.max(img.width, img.height));
        if (k === 1 && file.size < 2.5 * 1024 * 1024) return resolve(file);   // Vercel body limiti ~4.5 MB
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => resolve(b || file), 'image/jpeg', 0.9);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
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

  const HTTP = { 401: "Serverdagi API kalit noto'g'ri yoki muddati o'tgan (Vercel env).", 403: "Kalitga ruxsat yo'q.", 413: "Rasm juda katta. Kichikroq rasm yuklang.", 429: "So'rovlar limiti tugadi. Bir daqiqa kutib qayta urining." };

  async function analyze({ file, model, provider = 'groq', onStatus }) {
    const P = C.PROVIDERS[provider], L = Q.log;
    const b64 = await toB64(file), t0 = performance.now();
    L.info('Rasm tayyor: ' + Math.round(file.size / 1024) + ' KB');
    const body = {
      model, temperature: 0.05, max_tokens: C.MAX_TOKENS, response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: 'data:' + (file.type || 'image/jpeg') + ';base64,' + b64 } }
      ] }]
    };
    for (let attempt = 0; ; attempt++) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), C.TIMEOUT_MS);
      let res, data;
      try {
        L.info(P.name + ' ga yuborilmoqda (' + model + ')' + (attempt ? ', urinish ' + (attempt + 1) : '') + '...');
        res = await fetch(P.url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        L.info('Javob keldi: HTTP ' + res.status);
        data = await res.json().catch(() => ({}));
      } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') { L.err('Vaqt tugadi'); throw new Error("Vaqt tugadi (" + C.TIMEOUT_MS / 1000 + " s). Qayta urining."); }
        L.err('Tarmoq xatosi: ' + e.message);
        throw new Error("Tarmoq xatosi yoki CORS.");
      }
      clearTimeout(timer);
      if (res.ok) {
        const ch = data.choices && data.choices[0];
        if (!ch || !ch.message || !ch.message.content) throw new Error("Bo'sh javob.");
        if (ch.finish_reason === 'length') throw new Error("Javob uzilib qoldi. Kamroq oyatli rasm yuklang.");
        const parsed = parseJSON(ch.message.content), ms = Math.round(performance.now() - t0);
        L.ok('JSON o\'qildi: ' + ((parsed.ayahs || []).length) + ' oyat, ' + (ms / 1000).toFixed(1) + ' s' + (data.usage ? ', ' + data.usage.total_tokens + ' token' : ''));
        return { parsed, usage: data.usage || null, ms };
      }
      const msg = (data.error && data.error.message) || 'HTTP ' + res.status;
      if (res.status === 400 && body.response_format && /response_format|json/i.test(msg)) { delete body.response_format; continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < C.RETRIES) {
        const wait = Number(res.headers.get('retry-after')) || 2 ** (attempt + 1);
        onStatus && onStatus('Qayta urinilmoqda (' + (attempt + 1) + '/' + C.RETRIES + ')...');
        L.warn('HTTP ' + res.status + ' — ' + wait + ' s kutib qayta uriniladi (' + (attempt + 1) + '/' + C.RETRIES + ')');
        await sleep(wait * 1000); continue;
      }
      L.err('HTTP ' + res.status + ': ' + msg);
      throw new Error(HTTP[res.status] || msg);
    }
  }
  Q.api = { prepare, analyze };
})(window.QW);
