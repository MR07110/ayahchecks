(function (Q) {
  const C = Q.CFG;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const toB64 = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error("Fayl o'qilmadi"));
    r.readAsDataURL(blob);
  });

  // Uzun tomonini MAX_IMG ga keltiradi; hajm MAX_SEND dan oshsa JPEG sifatini tushiradi (Vercel body limiti uchun)
  function prepare(file, max = C.MAX_IMG) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = async () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, max / Math.max(img.width, img.height));
        if (k === 1 && file.size <= C.MAX_SEND) return resolve(file);
        const c = document.createElement('canvas'), x = c.getContext('2d');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);   // shaffof PNG qora bo'lib qolmasin
        x.drawImage(img, 0, 0, c.width, c.height);
        const enc = q => new Promise(r => c.toBlob(r, 'image/jpeg', q));
        let q = 0.9, b = await enc(q);
        while (b && b.size > C.MAX_SEND && q > 0.5) { q -= 0.1; b = await enc(q); }
        resolve(b || file);
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

  const RETRY = new Set([429, 502, 503, 504]);

  async function analyze({ file, model, onStatus }) {
    if (file.size > C.MAX_SEND * 1.3) throw new Error("Rasm juda katta. Kichikroq rasm yuklang.");
    const token = await Q.supa.token();
    if (!token) throw new Error("Sessiya topilmadi. Sahifani yangilang.");
    const b64 = await toB64(file), t0 = performance.now();
    const payload = JSON.stringify({ model, image: 'data:' + (file.type || 'image/jpeg') + ';base64,' + b64 });
    for (let attempt = 0; ; attempt++) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), C.TIMEOUT_MS);
      let res, data;
      try {
        res = await fetch('/api/analyze', {
          method: 'POST', signal: ctl.signal,
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: payload
        });
        data = await res.json().catch(() => ({}));
      } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error("Vaqt tugadi (" + C.TIMEOUT_MS / 1000 + " s). Qayta urining.");
        throw new Error("Tarmoq xatosi. Internetni tekshiring.");
      }
      clearTimeout(timer);
      if (res.ok) {
        if (!data.content) throw new Error("Bo'sh javob.");
        if (data.finish_reason === 'length') throw new Error("Javob uzilib qoldi. Kamroq oyatli rasm yuklang.");
        return { parsed: parseJSON(data.content), usage: data.usage || null, ms: Math.round(performance.now() - t0) };
      }
      if (RETRY.has(res.status) && attempt < C.RETRIES) {
        const wait = Math.min(Number(res.headers.get('retry-after')) || 2 ** (attempt + 1), 20);
        onStatus && onStatus('Qayta urinilmoqda (' + (attempt + 1) + '/' + C.RETRIES + ')...');
        await sleep(wait * 1000); continue;
      }
      throw new Error(data.error || 'Server xatosi (HTTP ' + res.status + ').');
    }
  }
  Q.api = { prepare, analyze };
})(window.QW);
