(function (Q) {
  const BSM = 'بسماللهالرحمنالرحيم', MARK = /[\u064B-\u065F\u0670]/, ANY = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/, ANNOT = /[\u06D6-\u06ED\u0640]/;
  const EDITIONS = ['quran-simple', 'quran-uthmani'];  // birinchisida harakat bo'lmasa ikkinchisi olinadi
  let DB = null;

  async function getJSON(url) {
    let cache = null;
    try { cache = window.caches ? await caches.open('ayahchecks-v1') : null; } catch (e) { /* kesh ixtiyoriy */ }
    try {
      let r = cache ? await cache.match(url) : null;
      if (!r) { r = await fetch(url); if (!r.ok) return null; if (cache) { try { await cache.put(url, r.clone()); } catch (e) { /* */ } } }
      return await r.json();
    } catch (e) { return null; }
  }
  const tri = s => { const t = new Set(); for (let i = 0; i + 3 <= s.length; i++) t.add(s.slice(i, i + 3)); return t; };

  function build(j) {
    const list = []; let marked = 0;
    if (!j || !j.data || !j.data.surahs) return null;
    j.data.surahs.forEach(s => s.ayahs.forEach(a => {
      let w = String(a.text).split(/\s+/).filter(x => Q.norm(x));
      if (a.numberInSurah === 1 && s.number !== 1 && s.number !== 9 && w.length >= 4 && w.slice(0, 4).map(Q.norm).join('') === BSM) w = w.slice(4);
      const nw = w.map(Q.norm), plain = nw.join('');
      list.push({ s: s.number, sn: s.name, n: a.numberInSurah, words: w, nw, plain, tri: tri(plain) });
      if (marked < 50 && MARK.test(a.text)) marked++;
    }));
    return list.length ? { list, marks: marked >= 20 } : null;
  }
  async function load() {
    if (DB) return DB;
    for (const ed of EDITIONS) {
      const db = build(await getJSON('https://api.alquran.cloud/v1/quran/' + ed));
      if (db && (db.marks || ed === EDITIONS[EDITIONS.length - 1])) return (DB = db);
    }
    return null;
  }

  // So'zlar ketma-ketligini manba so'zlariga moslaydi (manbaning istalgan bo'lagiga)
  function align(m, c) {
    const p = m.length, q = c.length;
    if (!p || !q) return { cost: p, start: 0, end: 0 };
    const D = [], P = [];
    for (let i = 0; i <= p; i++) { D.push(new Array(q + 1).fill(0)); P.push(new Array(q + 1).fill(0)); D[i][0] = i; P[i][0] = 1; }
    for (let i = 1; i <= p; i++) for (let j = 1; j <= q; j++) {
      const d = D[i - 1][j - 1] + 1 - Q.sim(m[i - 1], c[j - 1]), u = D[i - 1][j] + 1, l = D[i][j - 1] + 1;
      if (d <= u && d <= l) { D[i][j] = d; P[i][j] = 0; } else if (u <= l) { D[i][j] = u; P[i][j] = 1; } else { D[i][j] = l; P[i][j] = 2; }
    }
    let jb = 1; for (let j = 1; j <= q; j++) if (D[p][j] < D[p][jb]) jb = j;
    let i = p, j = jb;
    while (i > 0) { if (j === 0) { i--; continue; } const t = P[i][j]; if (t === 0) { i--; j--; } else if (t === 1) i--; else j--; }
    return { cost: D[p][jb], start: j, end: jb };
  }

  // Raqamga ishonmaydi: oyatni matni bo'yicha topadi
  function locate(a, list, hs, hn) {
    const m = a.words.map(w => Q.norm(w.arabic)).filter(Boolean), M = m.join('');
    if (!M) return null;
    let cands = list.filter(x => x.plain.includes(M)).slice(0, 20);
    const exact = cands.length;
    if (!cands.length) {
      const mt = tri(M);
      cands = list.map(x => { let k = 0; mt.forEach(g => { if (x.tri.has(g)) k++; }); return [k, x]; })
        .sort((x, y) => y[0] - x[0]).slice(0, 5).map(x => x[1]);
    }
    let best = null;
    cands.forEach(x => {
      const r = align(m, x.nw), sim = 1 - r.cost / m.length + (x.s === hs ? 0.001 : 0) + (x.n === hn ? 0.0005 : 0);
      if (!best || sim > best.sim) best = { x, r, sim };
    });
    return best && best.sim >= 0.5 ? { x: best.x, r: best.r, alt: exact } : null;
  }

  // Harf+harakat klasterlari bo'yicha diff (LCS)
  function clusters(t) {
    const o = [];
    for (const ch of String(t)) { if (ANY.test(ch) && o.length) o[o.length - 1].m += ch; else o.push({ c: ch, m: '' }); }
    return o;
  }
  const lk = k => k.c === ' ' ? ' ' : (Q.norm(k.c) || k.c);
  const mk = k => [...k.m].filter(x => !ANNOT.test(x)).sort().join('');
  const tx = k => k.c + k.m;
  function diff(mt, st, marks) {
    const A = clusters(mt), B = clusters(st), n = A.length, m = B.length;
    const sc = (i, j) => lk(A[i]) === lk(B[j]) ? (mk(A[i]) === mk(B[j]) ? 3 : 2) : 0;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      const s = sc(i - 1, j - 1);
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], s ? dp[i - 1][j - 1] + s : 0);
    }
    const ops = []; let i = n, j = m;
    while (i > 0 || j > 0) {
      const s = i > 0 && j > 0 ? sc(i - 1, j - 1) : 0;
      if (s && dp[i][j] === dp[i - 1][j - 1] + s) { ops.push([marks && s === 2 ? 'mk' : 'eq', tx(A[i - 1]), tx(B[j - 1])]); i--; j--; }
      else if (i > 0 && (j === 0 || dp[i][j] === dp[i - 1][j])) { ops.push(['del', tx(A[i - 1]), '']); i--; }
      else { ops.push(['ins', '', tx(B[j - 1])]); j--; }
    }
    ops.reverse();
    const seg = []; let l = 0, h = 0;
    ops.forEach(o => {
      if (o[0] === 'del' || o[0] === 'ins') l++; else if (o[0] === 'mk') h++;
      const last = seg[seg.length - 1];
      if (last && last.t === o[0]) { last.m += o[1]; last.s += o[2]; } else seg.push({ t: o[0], m: o[1], s: o[2] });
    });
    return { seg, l, h };
  }

  Q.verify = async function (data) {
    const db = await load();
    if (!db) return null;
    const votes = new Map(); let checked = 0;
    data.ayahs.forEach(a => {
      const hit = locate(a, db.list, Number(data.surah_number), Number(a.number));
      if (!hit) { a.src = null; a.verified = null; return; }
      const slice = hit.x.words.slice(hit.r.start, hit.r.end), st = slice.join(' ');
      const mt = a.words.map(w => w.arabic).join(' '), d = diff(mt, st, db.marks);
      a.verified = Q.sim(Q.norm(mt), Q.norm(st));
      a.lDiff = d.l; a.mkDiff = db.marks ? d.h : null; a.diff = d.seg;
      a.src = { s: hit.x.s, n: hit.x.n, alt: hit.alt, text: st, partial: slice.length < hit.x.words.length };
      if (Number(a.number) !== hit.x.n) a.modelNumber = a.number;
      a.number = hit.x.n;
      votes.set(hit.x.s, (votes.get(hit.x.s) || 0) + 1); checked++;
    });
    if (votes.size) {
      const s = [...votes.entries()].sort((x, y) => y[1] - x[1])[0][0];
      data.surah_number = s; data.surah = (db.list.find(x => x.s === s) || {}).sn || data.surah;
    }
    return { checked, marks: db.marks };
  };
  Q._v = { diff, align };   // test uchun
})(window.QW);
