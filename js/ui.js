(function (Q) {
  const C = Q.CFG, $ = id => document.getElementById(id);
  function el(tag, cls, text, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  let tt;
  const ui = {
    $, el,
    toast(msg, ms = 2500) { const t = $('toast'); clearTimeout(tt); t.textContent = msg; t.classList.add('show'); tt = setTimeout(() => t.classList.remove('show'), ms); },
    error(m) { const e = $('errorBox'); e.textContent = m; e.style.display = 'block'; },
    hideError() { $('errorBox').style.display = 'none'; },
    warn(m) { const e = $('warningBox'); e.textContent = m; e.style.display = 'block'; },
    hideWarn() { $('warningBox').style.display = 'none'; },
    hideResult() { $('result').style.display = 'none'; },
    report(v, data) {
      const box = $('report'); box.textContent = '';
      const cls = v.score >= 90 ? 's-good' : v.score >= 70 ? 's-mid' : 's-bad';
      el('div', 'score ' + cls, "Ichki tekshiruv: " + v.score + '%', box);
      const chk = data.ayahs.filter(a => a.src);
      const good = chk.filter(a => a.verified >= C.VERIFY_MIN && !a.lDiff && !a.mkDiff).length;
      el('div', '', v.ayahs + " oyat · " + v.words + " so'z" + (chk.length ? " · Manba bilan aynan mos: " + good + '/' + chk.length + ' oyat' : " · Mus'haf bilan solishtirilmadi"), box);
      if (v.issues.length) {
        const ul = el('ul', '', null, box);
        v.issues.slice(0, 12).forEach(i => el('li', i.lvl, (i.ayah ? i.ayah + '-oyat: ' : '') + i.msg, ul));
        if (v.issues.length > 12) el('li', '', "... va yana " + (v.issues.length - 12) + " ta", ul);
      }
    },
    result(data, v, metaText) {
      $('surahName').textContent = data.surah || '';
      $('surahInfo').textContent = (data.surah_number ? data.surah_number + '-sura · ' : '') + v.ayahs + ' oyat';
      ui.report(v, data);
      const list = $('ayahList'); list.textContent = '';
      data.ayahs.forEach(a => {
        const box = el('div', 'ayah', null, list), head = el('div', 'ayah-head', null, box);
        el('div', 'ayah-number', a.number, head);
        if (a.src) {
          const exact = !a.lDiff && !a.mkDiff, near = a.verified >= C.VERIFY_MIN;
          el('span', 'badge ' + (exact ? 'ok' : 'warn'), exact ? "✓ Manba bilan aynan mos" : near ? '⚠ Farq: ' + (a.lDiff ? a.lDiff + ' harf, ' : '') + (a.mkDiff || 0) + ' harakat' : '⚠ Manbadan farq ' + Math.round(a.verified * 100) + '%', head);
          if (a.modelNumber != null) el('span', 'badge warn', 'Model raqami ' + a.modelNumber + ' → tuzatildi', head);
        } else if (a.src === null) el('span', 'badge warn', 'Manbadan topilmadi', head);
        const grid = el('div', 'words-grid', null, box);
        a.words.forEach(w => {
          const c = el('div', 'word-cell' + (w._bad ? ' bad' : ''), null, grid);
          el('div', 'word-index', w.index, c); el('div', 'word-arabic', w.arabic, c); el('div', 'word-uzbek', w.uzbek, c);
        });
        const full = el('div', 'ayah-full-block', null, box);
        el('div', 'ayah-full-label', "To'liq oyat", full); el('div', 'ayah-full-arabic', a.full_arabic, full); el('div', 'ayah-full-text', a.full_uzbek, full);
        if (a.src) ui.diff(box, a);
      });
      $('rawJson').textContent = JSON.stringify(data, (k, val) => k === '_bad' ? undefined : val, 2);
      $('metaInfo').textContent = metaText || '';
      $('result').style.display = 'block';
    },
    diff(box, a) {
      const d = el('details', 'diff', null, box);
      d.open = !!(a.lDiff || a.mkDiff);
      el('summary', '', 'Manba va farqlar (' + a.src.s + ':' + a.src.n + ')', d);
      const info = el('div', 'diff-src', null, d);
      info.appendChild(document.createTextNode('Manba: alquran.cloud · ' + a.src.s + '-sura, ' + a.src.n + '-oyat' + (a.src.partial ? " (bo'lak)" : '') + (a.src.alt > 1 ? ' · bu matn ' + a.src.alt + ' joyda uchraydi' : '') + ' · '));
      const link = el('a', '', 'quran.com', info); link.href = 'https://quran.com/' + a.src.s + '/' + a.src.n; link.target = '_blank'; link.rel = 'noopener';
      [['− Model', 'm', 'd-del'], ['+ Manba', 's', 'd-add']].forEach(([lab, key, bad]) => {
        const row = el('div', 'diff-row', null, d); el('div', 'diff-lab', lab, row);
        const txt = el('div', 'diff-txt', null, row);
        a.diff.forEach(g => { if (g[key]) el('span', g.t === 'mk' ? 'd-mk' : g.t === 'eq' ? '' : bad, g[key], txt); });
      });
      el('div', 'diff-legend', "Qizil — modelda xato/ortiqcha · Yashil — manbada bor · Sariq — harakat farqi" + (a.mkDiff === null ? " · manbada harakat yo'q, harakatlar tekshirilmadi" : ''), d);
    },
    history(h) {
      const l = Q.hist.list(), box = $('historyList'); box.textContent = '';
      $('historyCount').textContent = l.length;
      $('historyToolbar').hidden = !l.length;
      if (!l.length) return el('div', 'history-empty', "Tarix bo'sh.", box);
      $('historyInfo').textContent = 'Jami: ' + l.length + ' ta yozuv';
      l.forEach(it => {
        const d = new Date(it.date), p = n => String(n).padStart(2, '0'), ays = (it.data && it.data.ayahs) || [];
        const words = ays.reduce((s, a) => s + (a.words ? a.words.length : 0), 0), chk = ays.filter(a => a.src);
        const good = chk.filter(a => a.verified >= C.VERIFY_MIN && !a.lDiff && !a.mkDiff).length;
        const meta = [];
        if (it.file) meta.push('Rasm: ' + it.file);
        meta.push(p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()));
        meta.push(words + " so'z");
        meta.push(chk.length ? '✓ ' + good + '/' + chk.length + ' oyat manbaga mos' : "Mus'haf bilan solishtirilmagan");
        const row = el('div', 'history-item', null, box), info = el('div', 'history-item-info', null, row);
        el('div', 'history-item-title', Q.exp.title(it), info);
        el('div', 'history-item-meta', meta.join(' · '), info);
        el('div', 'history-item-file', 'Fayl: ' + Q.exp.filename(it), info);
        const acts = el('div', 'history-acts', null, row);
        const dl = el('button', 'icon-btn', '⬇', acts), del = el('button', 'icon-btn danger', '✕', acts);
        dl.title = 'JSON yuklab olish'; del.title = "O'chirish";
        row.addEventListener('click', () => h.open(it.id));
        dl.addEventListener('click', e => { e.stopPropagation(); h.dl(it.id); });
        del.addEventListener('click', e => { e.stopPropagation(); h.del(it.id); });
      });
    },
    queue(list, h) {
      const box = $('queue'), l = $('queueList'); l.textContent = '';
      box.hidden = !list.length; if (!list.length) return;
      const cnt = s => list.filter(x => x.status === s).length;
      $('queueInfo').textContent = 'Navbat: ' + cnt('ok') + '/' + list.length + ' tayyor' + (cnt('err') ? ' · ' + cnt('err') + ' xato' : '');
      const ICON = { wait: '⏳', work: '⚙', ok: '✓', err: '⚠' }, LAB = { wait: 'Kutilmoqda', work: 'Tahlil qilinmoqda...', ok: 'Tayyor', err: 'Xato' };
      list.forEach(q => {
        const row = el('div', 'q-item q-' + q.status, null, l);
        el('span', 'q-icon', ICON[q.status], row);
        const info = el('div', 'q-info', null, row);
        el('div', 'q-name', q.name, info); el('div', 'q-msg', q.msg || LAB[q.status], info);
        const acts = el('div', 'q-acts', null, row);
        const b = (t, fn) => { const x = el('button', 'mini', t, acts); x.type = 'button'; x.addEventListener('click', fn); return x; };
        if (q.status === 'ok') { b("Ko'rish", () => h.view(q)); b('⬇ JSON', () => h.dl(q)); }
        if (q.status === 'err') b('Qayta', () => h.retry(q));
        if (q.status === 'wait' || q.status === 'err') b('✕', () => h.remove(q));
      });
    }
  };
  Q.ui = ui;
})(window.QW);
