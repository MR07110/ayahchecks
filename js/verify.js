(function (Q) {
  const BSM = 'بسماللهالرحمنالرحيم', MARK = /[\u064B-\u065F\u0670]/, ANY = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/, ANNOT = /[\u06D6-\u06ED\u0640]/;
  let DB = null;

  async function getJSON(url) {
    let cache = null;
    try { cache = (typeof window !== 'undefined' && window.caches) ? await caches.open('ayahchecks-v1') : null; } catch (e) { /* kesh ixtiyoriy */ }
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
    const lastN = {}; list.forEach(x => { if (x.n > (lastN[x.s] || 0)) lastN[x.s] = x.n; });
    return list.length ? { list, marks: marked >= 20, lastN } : null;
  }
  async function load() {
    if (DB) return DB;
    let j = null;
    // Server: Mus'haf loyiha ichidagi fayldan o'qiladi (tashqi saytga bog'liq emas, sekinlashmaydi, uzilmaydi)
    if (typeof window === 'undefined') { try { j = require('../data/quran.json'); } catch (e) { console.error('quran.json:', e.message); } }
    else j = await getJSON('/data/quran.json');
    return (DB = build(j) || null);
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

  // Bitta oyat uchun mumkin bo'lgan barcha Mus'haf oyatlari (sura bo'yicha cheklamaydi)
  function candidates(a, list, hs) {
    let m = a.words.map(w => Q.norm(w.arabic)).filter(Boolean), bsm = 0;
    if (m.length > 4 && m.slice(0, 4).join('') === BSM) { m = m.slice(4); bsm = 4; }   // sura boshidagi Basmala oyat emas
    const M = m.join('');
    if (!M) return [];
    let cs = list.filter(x => x.plain.includes(M));
    const exact = cs.length;
    if (cs.length > 300) cs = cs.filter(x => x.s === hs).concat(cs.filter(x => x.s !== hs)).slice(0, 300);
    if (!cs.length) {
      const mt = tri(M);
      cs = list.map(x => { let k = 0; mt.forEach(g => { if (x.tri.has(g)) k++; }); return [k, x]; })
        .sort((x, y) => y[0] - x[0]).slice(0, 8).map(x => x[1]);
    }
    const out = [];
    cs.forEach(x => { const r = align(m, x.nw), sim = 1 - r.cost / m.length; if (sim >= 0.5) out.push({ x, r, sim, exact, bsm }); });
    return out;
  }

  // Sura raqamiga ishonmaydi va har oyatni alohida "ovozga" ham qo'ymaydi: butun sahifa uchun eng mos
  // ketma-ket oyatlar yo'lini topadi (Viterbi). Ketma-ket kelgan oyatlar (n, n+1, n+2...) katta ustunlik oladi,
  // shuning uchun "الحمد لله" kabi boshqa suralarda ham uchraydigan iboralar noto'g'ri surani tanlatib qo'ymaydi.
  function pickAll(ays, db, hs) {
    const lastN = db.lastN, res = new Array(ays.length).fill(null);
    const trans = (p, c, gap) => {
      if (c.x.s === p.x.s) { const d = c.x.n - p.x.n; return d === gap ? 0.6 : d > 0 && d <= gap + 2 ? 0.25 : d > 0 ? 0.05 : -0.2; }
      if (c.x.s === p.x.s + 1) { const off = gap - (lastN[p.x.s] - p.x.n); if (off >= 1 && c.x.n === off) return 0.6; }   // sura oxiri -> keyingi sura boshi
      return 0;
    };
    const chain = []; let prev = null, pk = -1;
    ays.forEach((a, k) => {
      const cs = candidates(a, db.list, hs); if (!cs.length) return;
      const layer = cs.map(c => {
        let best = 0, back = -1;
        if (prev) prev.forEach((p, pi) => { const v = p.total + trans(p.c, c, k - pk); if (back < 0 || v > best) { best = v; back = pi; } });
        const em = c.sim + (c.x.s === hs ? 0.08 : 0) + (c.x.n === Number(a.number) ? 0.03 : 0);
        return { c, k, total: em + (prev ? best : 0), back };
      });
      chain.push(layer); prev = layer; pk = k;
    });
    if (!chain.length) return res;
    const last = chain[chain.length - 1]; let bi = 0;
    last.forEach((s, i) => { if (s.total > last[bi].total) bi = i; });
    for (let li = chain.length - 1; li >= 0; li--) { const s = chain[li][bi]; res[s.k] = s.c; bi = s.back; }
    return res;
  }

  // So'zlarni (model xato ajratgan bo'lsa ham) Mus'haf oyatlariga qayta taqsimlaydi: 3-oyat 4-oyatga qo'shilib ketmasin
  function mapWords(m, c) {
    const p = m.length, q = c.length, D = [], P = [];
    for (let i = 0; i <= p; i++) { D.push(new Array(q + 1).fill(0)); P.push(new Array(q + 1).fill(0)); D[i][0] = i; P[i][0] = 1; }
    for (let i = 1; i <= p; i++) for (let j = 1; j <= q; j++) {
      const d = D[i - 1][j - 1] + 1 - Q.sim(m[i - 1], c[j - 1]), u = D[i - 1][j] + 1, l = D[i][j - 1] + 1;
      if (d <= u && d <= l) { D[i][j] = d; P[i][j] = 0; } else if (u <= l) { D[i][j] = u; P[i][j] = 1; } else { D[i][j] = l; P[i][j] = 2; }
    }
    let jb = 1; for (let j = 1; j <= q; j++) if (D[p][j] < D[p][jb]) jb = j;
    const map = new Array(p).fill(-1); let i = p, j = jb;
    while (i > 0) { if (j === 0) { i--; continue; } const t = P[i][j]; if (t === 0) { map[i - 1] = j - 1; i--; j--; } else if (t === 1) i--; else j--; }
    return map;
  }
  function reflow(data, db, hits) {
    const ays = (data && data.ayahs) || []; if (!ays.length) return false;
    if (hits.some(h => !h)) return false;                       // ishonchsiz bo'lsa tegmaymiz
    const s = hits[0].x.s; if (hits.some(h => h.x.s !== s)) return false;
    const ns = hits.map(h => h.x.n), lo = Math.min(...ns) - 2, hi = Math.max(...ns) + 2;
    const S = [], own = [];
    db.list.filter(x => x.s === s && x.n >= lo && x.n <= hi).forEach(x => x.nw.forEach(w => { S.push(w); own.push(x.n); }));
    const ws = []; ays.forEach(a => a.words.forEach(w => ws.push({ w, a })));
    if (!ws.length || !S.length) return false;
    const lab = mapWords(ws.map(o => Q.norm(o.w.arabic)), S).map(j => j >= 0 ? own[j] : null);
    for (let i = 1; i < lab.length; i++) if (lab[i] == null) lab[i] = lab[i - 1];
    for (let i = lab.length - 2; i >= 0; i--) if (lab[i] == null) lab[i] = lab[i + 1];
    if (lab.some(x => x == null)) return false;
    for (let i = 1; i < lab.length; i++) if (lab[i] < lab[i - 1]) lab[i] = lab[i - 1];
    const groups = [];
    ws.forEach((o, i) => { const g = groups[groups.length - 1]; if (g && g.n === lab[i]) g.items.push(o); else groups.push({ n: lab[i], items: [o] }); });
    if (groups.length === ays.length && groups.every((g, k) => g.items.length === ays[k].words.length && g.n === hits[k].x.n)) return false;   // allaqachon to'g'ri
    data.ayahs = groups.map(g => {
      const src = g.items[0].a, whole = g.items.every(o => o.a === src) && g.items.length === src.words.length;
      const words = g.items.map((o, i) => { o.w.index = i + 1; return o.w; });
      return { number: g.n, words, full_arabic: words.map(w => w.arabic).join(' '), full_uzbek: whole ? src.full_uzbek : words.map(w => w.uzbek).join(' '), reflowed: true };
    });
    return true;
  }

  // Modelning arabcha so'zlarini Mus'haf so'zlari bilan almashtiradi (o'zbekcha tarjimaga tegmaydi).
  // Faqat ishonchli mos kelgan so'zlar almashadi; katak soni o'zgarmaydi.
  function fixWords(a, slice, bsm) {
    const ws = a.words.slice(bsm), m = ws.map(w => Q.norm(w.arabic)), c = slice.map(Q.norm);
    a.review = null;
    // Katak soni Mus'haf so'zlari soniga teng bo'lmasa, so'zma-so'z almashtirish tarjimani buzadi
    // (so'z tushib qoladi yoki tarjima boshqa so'zga yopishadi): tegmaymiz va tekshirishga belgilaymiz.
    if (ws.length !== slice.length) { a.review = "Katak soni (" + ws.length + ") Mus'haf so'zlari soniga (" + slice.length + ") teng emas. Rasm yoki oyat chegarasini tekshiring."; return 0; }
    const sims = m.map((x, i) => Q.sim(x, c[i]));
    // Har bir so'z ancha o'xshash bo'lishi kerak; aks holda model boshqa so'zni o'qigan (tarjima ham boshqa so'zniki)
    if (sims.some(x => x < 0.75)) { a.review = "Modelning o'qishi Mus'haf bilan ko'p farq qiladi. Rasmni tekshiring."; return 0; }
    let n = 0;
    ws.forEach((w, i) => { if (w.arabic !== slice[i]) { w.modelArabic = w.arabic; w.arabic = slice[i]; n++; } });
    if (n) a.full_arabic = a.words.map(w => w.arabic).join(' ');
    return n;
  }

  // Harf+harakat klasterlari bo'yicha diff (LCS)
  function clusters(t) {
    const o = [];
    for (const ch of String(t)) { if (ANY.test(ch) && o.length) o[o.length - 1].m += ch; else o.push({ c: ch, m: '' }); }
    return o;
  }
  const lk = k => k.c === ' ' ? ' ' : (Q.norm(k.c) || k.c);
  // Naskh va Uthmani yozuvi orasidagi FARQ EMAS, uslub farqi: sukun (ْ / ۡ), kichik alif (ٰ), maddah, hamza belgisi,
  // Uthmani'ning ochiq tanvin belgilari (ٞ ٗ ٖ) va Qur'on anotatsiyalari. Ular solishtirishda hisobga olinmaydi.
  const SKIP = /[\u0640\u0652-\u0655\u0670\u06D6-\u06ED]/, OPEN = { '\u065E': '\u064B', '\u0657': '\u064C', '\u0656': '\u064D' };
  const mk = k => [...k.m].filter(x => !SKIP.test(x)).map(x => OPEN[x] || x).sort().join('');
  // Belgisiz alif (ا / ٱ): Uthmani'da kichik alif bilan yoziladi, Naskh'da to'liq alif bilan — imlo uslubi, xato emas
  const soft = k => lk(k) === 'ا' && mk(k) === '';
  const skel = t => Q.norm(t).replace(/ا/g, '');
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
      else if (i > 0 && (j === 0 || dp[i][j] === dp[i - 1][j])) { ops.push([soft(A[i - 1]) ? 'eq' : 'del', tx(A[i - 1]), '']); i--; }
      else { ops.push([soft(B[j - 1]) ? 'eq' : 'ins', '', tx(B[j - 1])]); j--; }
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
    const hs = Number(data.surah_number);
    let picks = pickAll(data.ayahs, db, hs);
    try { if (reflow(data, db, picks)) picks = pickAll(data.ayahs, db, hs); } catch (e) { /* ajratish o'zgarmaydi */ }
    const votes = new Map(); let checked = 0;
    data.ayahs.forEach((a, k) => {
      const hit = picks[k];
      if (!hit) { a.src = null; a.verified = null; return; }
      const slice = hit.x.words.slice(hit.r.start, hit.r.end), st = slice.join(' ');
      const mt = a.words.slice(hit.bsm).map(w => w.arabic).join(' '), d = diff(mt, st, db.marks);
      a.verified = Q.sim(skel(mt), skel(st));
      a.fixed = fixWords(a, slice, hit.bsm);   // arabcha matnni Mus'haf bilan 100% tenglashtiradi
      a.lDiff = d.l; a.mkDiff = db.marks ? d.h : null; a.diff = d.seg;
      a.src = { s: hit.x.s, n: hit.x.n, alt: hit.exact, text: st, partial: slice.length < hit.x.words.length };
      if (Number(a.number) !== hit.x.n) a.modelNumber = a.number;
      a.number = hit.x.n;
      votes.set(hit.x.s, (votes.get(hit.x.s) || 0) + 1); checked++;
    });
    if (votes.size) {
      const s = [...votes.entries()].sort((x, y) => y[1] - x[1] || (y[0] === hs) - (x[0] === hs))[0][0];
      if (hs && hs !== s) data.model_surah_number = hs;
      data.surah_number = s; data.surah = (db.list.find(x => x.s === s) || {}).sn || data.surah;
    }
    return { checked, total: data.ayahs.length, marks: db.marks };
  };
  Q.verifyLoad = load;   // server oldindan isitib qo'yishi uchun
  Q._v = { diff, align, reflow, pickAll };   // test uchun
})(typeof window !== "undefined" ? window.QW : globalThis.QW);
