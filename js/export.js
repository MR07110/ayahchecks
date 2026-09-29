// JSON yuklab olish (bittalab va ZIP) + tushunarli sarlavha/fayl nomlari.
(function (Q) {
  const p2 = n => String(n).padStart(2, '0'), p3 = n => String(n).padStart(3, '0');
  const slug = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['’`ʻʼ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const stamp = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + '-' + p2(d.getMinutes());

  function range(item) {
    const n = ((item.data && item.data.ayahs) || []).map(a => Number(a.number)).filter(Number.isFinite).sort((a, b) => a - b);
    if (!n.length) return { from: null, to: null, count: 0, contiguous: true };
    return { from: n[0], to: n[n.length - 1], count: n.length, contiguous: n.every((v, i) => i === 0 || v === n[i - 1] + 1) };
  }
  function title(item) {
    const d = item.data || {}, n = Number(d.surah_number), nm = Q.SURAH[n];
    const sura = nm ? n + '-sura · ' + nm : (d.surah || "Noma'lum sura"), r = range(item);
    const oyat = !r.count ? "oyat yo'q" : r.count === 1 ? r.from + '-oyat' : r.contiguous ? r.from + '–' + r.to + '-oyatlar' : r.count + ' oyat (' + r.from + '…' + r.to + ')';
    return sura + ' · ' + oyat;
  }
  // Masalan: 002-Al-Baqara_oyat-5-9_IMG-2041.json
  function filename(item) {
    const d = item.data || {}, n = Number(d.surah_number), nm = Q.SURAH[n], r = range(item);
    const a = nm ? p3(n) + '-' + slug(nm) : 'sura-nomalum';
    const o = !r.count ? 'oyatsiz' : r.from === r.to ? 'oyat-' + r.from : r.contiguous ? 'oyat-' + r.from + '-' + r.to : 'oyat-' + r.from + '-' + r.to + '_' + r.count + 'ta';
    let img = slug(String(item.file || '').replace(/\.[A-Za-z0-9]+$/, '')).slice(0, 40);
    if (!img) img = stamp(new Date(item.date || Date.now()));
    return [a, o, img].join('_') + '.json';
  }
  // Toza JSON: asl maydonlar (surah, surah_number, ayahs...) saqlanadi, ichki maydonlar (diff, src, _bad) tashlanadi
  function clean(item) {
    const d = item.data || {};
    return {
      surah: d.surah || null, surah_number: d.surah_number || null, surah_name_uz: Q.SURAH[Number(d.surah_number)] || null,
      source_image: item.file || null, created_at: item.date || null, model: item.model || null,
      ayahs: (d.ayahs || []).map(a => ({
        number: a.number,
        words: (a.words || []).map(w => ({ index: w.index, arabic: w.arabic, uzbek: w.uzbek })),
        full_arabic: a.full_arabic, full_uzbek: a.full_uzbek,
        verified: a.src ? (!a.lDiff && !a.mkDiff) : null,
        similarity: typeof a.verified === 'number' ? Math.round(a.verified * 1000) / 1000 : null
      }))
    };
  }
  function download(name, blob) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const json = o => JSON.stringify(o, null, 2);

  // ---- ZIP (siqmasdan, "store") ----
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files, when) {
    const enc = new TextEncoder(), parts = [], cen = [];
    const dt = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
    const dd = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
    let off = 0;
    files.forEach(f => {
      const nm = enc.encode(f.name), sz = f.data.length, crc = crc32(f.data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true);
      lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nm, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      cen.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + sz;
    });
    const cenSize = cen.reduce((s, x) => s + x.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cenSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  Q.exp = {
    range, title, filename, clean,
    item(item) { download(filename(item), new Blob([json(clean(item))], { type: 'application/json' })); },
    all(list) {
      if (!list.length) return false;
      const enc = new TextEncoder(), used = {}, files = [], all = [];
      list.forEach(it => {
        let n = filename(it); const base = n.replace(/\.json$/, '');
        used[base] = (used[base] || 0) + 1; if (used[base] > 1) n = base + '-' + used[base] + '.json';
        const c = clean(it); all.push(c); files.push({ name: n, data: enc.encode(json(c)) });
      });
      files.push({ name: 'hammasi.json', data: enc.encode(json(all)) });
      const now = new Date();
      download('ayahchecks_' + stamp(now) + '_' + list.length + '-ta.zip', zip(files, now));
      return true;
    },
    _zip: zip
  };
})(window.QW);
