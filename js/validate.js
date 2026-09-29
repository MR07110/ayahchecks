(function (Q) {
  const DIA = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
  // Arabcha matnni solishtirish uchun: harakatlar, tatvil va shakl farqlarini olib tashlaydi
  const norm = s => String(s == null ? '' : s).replace(DIA, '')
    .replace(/[آأإٱ]/g, 'ا').replace(/[ىیې]/g, 'ي').replace(/ک/g, 'ك')
    .replace(/[^\u0621-\u064A]/g, '');
  // Levenshtein asosidagi o'xshashlik: 0..1
  function sim(a, b) {
    if (a === b) return a.length ? 1 : 0;
    if (!a.length || !b.length) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return 1 - prev[b.length] / Math.max(a.length, b.length);
  }
  function validate(data) {
    const issues = [], ayahs = Array.isArray(data && data.ayahs) ? data.ayahs : [];
    let words = 0, checks = 0, ok = 0;
    if (!ayahs.length) issues.push({ lvl: 'err', ayah: 0, msg: 'Oyatlar topilmadi' });
    ayahs.forEach((a, k) => {
      a.words = Array.isArray(a.words) ? a.words : [];
      const ws = a.words, n = a.number;
      const t = (cond, lvl, msg) => { checks++; if (cond) ok++; else issues.push({ lvl, ayah: n, msg }); };
      words += ws.length;
      t(ws.length > 0, 'err', "So'zlar yo'q");
      const seq = ws.map(w => Number(w.index)).sort((x, y) => x - y).every((v, i) => v === i + 1);
      t(seq, 'warn', "Indekslar 1..N ketma-ket emas (tartib avtomatik tuzatildi)");
      ws.forEach((w, i) => { if (!Number.isFinite(Number(w.index))) w.index = i + 1; });
      ws.sort((x, y) => Number(x.index) - Number(y.index));
      ws.forEach((w, i) => { w.index = i + 1; });
      t(ws.every(w => norm(w.arabic).length > 0), 'err', "Bo'sh arabcha katak bor");
      ws.forEach(w => { w._bad = !String(w.uzbek || '').trim() || /\?\?\?/.test(w.uzbek); });
      const q = ws.filter(w => w._bad).length;
      t(q === 0, 'warn', q + " ta tarjima o'qilmadi (???)");
      const u = ws.map(w => String(w.uzbek || '').trim().toLowerCase());
      const dup = u.filter((x, i) => i > 0 && x.length > 3 && x === u[i - 1]).length;   // ketma-ket bir xil = nusxa; uzoqda takrorlansa ("ularga") to'g'ri
      t(dup === 0, 'warn', dup + " ta ketma-ket takroriy tarjima (nusxa bo'lishi mumkin)");
      const s = sim(norm(ws.map(w => w.arabic).join('')), norm(a.full_arabic));
      a.match = s;
      t(s >= 0.9, 'warn', "So'zlar va to'liq oyat mos emas (" + Math.round(s * 100) + '%)');
      t(!!String(a.full_uzbek || '').trim(), 'warn', "To'liq tarjima yo'q");
      if (k > 0) t(Number(n) === Number(ayahs[k - 1].number) + 1, 'warn', "Oyat raqami ketma-ket emas");
    });
    return { issues, words, ayahs: ayahs.length, score: checks ? Math.round(ok / checks * 100) : 0 };
  }
  Q.norm = norm; Q.sim = sim; Q.validate = validate;
})(typeof window !== "undefined" ? window.QW : globalThis.QW);
