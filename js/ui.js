(function (Q) {
  const C = Q.CFG, $ = id => document.getElementById(id);
  function el(tag, cls, text, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const P = {x:'<path d="M6 6l12 12M18 6L6 18"/>',up:'<path d="M6 15l6-6 6 6"/>',down:'<path d="M6 9l6 6 6-6"/>',edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',retry:'<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>',dl:'<path d="M12 4v11m-5-5l5 5 5-5M5 20h14"/>',grip:'<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>',image:'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 16l5-5 4 4 3-3 4 4"/>',list:'<path d="M5 7h14M5 12h14M5 17h14"/>',cam:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'};
  const icon = (b, n) => { b.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + '</svg>'; return b; };
  let tt;
  const ui = {
    $, el, icon,
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
      const ns = data.ayahs.map(x => x.number);
      $('surahInfo').textContent = (data.surah_number ? data.surah_number + '-sura · ' : '') + v.ayahs + ' ta oyat topildi' + (ns.length ? ' (' + (ns.length > 3 ? ns[0] + '–' + ns[ns.length - 1] : ns.join(', ')) + '-oyat)' : '');
      ui.report(v, data);
      const list = $('ayahList'); list.textContent = '';
      data.ayahs.forEach(a => {
        const box = el('div', 'ayah', null, list), head = el('div', 'ayah-head', null, box);
        el('div', 'ayah-number', a.number, head);
        if (a.src) {
          const exact = !a.lDiff && !a.mkDiff, near = a.verified >= C.VERIFY_MIN;
          el('span', 'badge ' + (exact ? 'ok' : 'warn'), exact ? "Manba bilan aynan mos" : near ? 'Farq: ' + (a.lDiff ? a.lDiff + ' harf, ' : '') + (a.mkDiff || 0) + ' harakat' : 'Manbadan farq ' + Math.round(a.verified * 100) + '%', head);
          if (a.modelNumber != null) el('span', 'badge warn', 'Model raqami ' + a.modelNumber + ' → tuzatildi', head);
        } else if (a.src === null) el('span', 'badge warn', 'Manbadan topilmadi', head);
        const grid = el('div', 'words-grid', null, box);
        a.words.forEach(w => {
          const c = el('div', 'word-cell' + (w._bad ? ' bad' : ''), null, grid);
          el('div', 'word-index', w.index, c); el('div', 'word-arabic', w.arabic, c); el('div', 'word-uzbek', w.uzbek, c);
          c.tabIndex = 0; c.title = w.fix ? "Rasmda: " + w.fix + " (lug'at bilan tuzatildi)" : 'Tarjimani nusxalash'; if (w.fix) c.classList.add('fixed');
          const go = () => { ui.copy(w.uzbek); c.classList.add('copied'); setTimeout(() => c.classList.remove('copied'), 700); };
          c.addEventListener('click', go);
          c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        });
        const full = el('div', 'ayah-full-block', null, box);
        el('div', 'ayah-full-label', "To'liq oyat", full); el('div', 'ayah-full-arabic', a.full_arabic, full); el('div', 'ayah-full-text', a.full_uzbek, full);
        if (a.src) ui.diff(box, a);
      });
      $('rawJson').textContent = JSON.stringify(data, (k, val) => k === '_bad' ? undefined : val, 2);
      $('metaInfo').textContent = metaText || '';
      $('result').style.display = 'block';
    },
    async copy(text) {
      text = String(text == null ? '' : text).trim();
      if (!text) return ui.toast("Tarjima yo'q");
      try { await navigator.clipboard.writeText(text); }
      catch (e) {   // file:// yoki eski brauzer uchun zaxira yo'l
        const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(t); t.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* */ }
        t.remove(); if (!ok) return ui.toast('Nusxalash imkonsiz');
      }
      ui.toast('Nusxalandi: ' + (text.length > 40 ? text.slice(0, 40) + '…' : text), 1800);
    },
    diff(box, a) {
      const d = el('details', 'diff', null, box);
      d.open = !!(a.lDiff || a.mkDiff);
      el('summary', '', 'Manba va farqlar (' + a.src.s + ':' + a.src.n + ')', d);
      const info = el('div', 'diff-src', null, d);
      info.appendChild(document.createTextNode('Manba: Uthmoniy Mus\'haf · ' + a.src.s + '-sura, ' + a.src.n + '-oyat' + (a.src.partial ? " (bo'lak)" : '') + (a.src.alt > 1 ? ' · bu matn ' + a.src.alt + ' joyda uchraydi' : '') + ' · '));
      const link = el('a', '', 'quran.com', info); link.href = 'https://quran.com/' + a.src.s + '/' + a.src.n; link.target = '_blank'; link.rel = 'noopener';
      [['− Model', 'm', 'd-del'], ['+ Manba', 's', 'd-add']].forEach(([lab, key, bad]) => {
        const row = el('div', 'diff-row', null, d); el('div', 'diff-lab', lab, row);
        const txt = el('div', 'diff-txt', null, row);
        a.diff.forEach(g => { if (g[key]) el('span', g.t === 'mk' ? 'd-mk' : g.t === 'eq' ? '' : bad, g[key], txt); });
      });
      el('div', 'diff-legend', "Qizil — modelda xato/ortiqcha · Yashil — manbada bor · Sariq — harakat farqi · Sukun, kichik alif, maddah va Naskh/Uthmoniy imlo uslubi farqlari hisobga olinmaydi" + (a.mkDiff === null ? " · manbada harakat yo'q, harakatlar tekshirilmadi" : ''), d);
    },
    history(onOpen, onDelete, onDownload) {
      const l = Q.hist.list(), box = $('historyList'); box.textContent = '';
      $('historyCount').textContent = l.length;
      $('historyToolbar').hidden = !l.length;
      if (!l.length) return el('div', 'history-empty', "Tarix bo'sh.", box);
      $('historyInfo').textContent = 'Jami: ' + l.length + ' ta yozuv';
      l.forEach(it => {
        const d = new Date(it.date), p = n => String(n).padStart(2, '0');
        const row = el('div', 'history-item', null, box), info = el('div', 'history-item-info', null, row);
        el('div', 'history-item-title', it.surah || "Noma'lum", info);
        el('div', 'history-item-meta', (it.surah_number ? it.surah_number + '-sura · ' : '') + it.ayah_count + ' oyat · ' + (it.score != null ? it.score + '% · ' : '') + p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()), info);
        if (it.file_name) el('div', 'history-item-file', it.file_name, info);
        const acts = el('div', 'history-acts', null, row);
        if (onDownload) { const dl = icon(el('button', 'icon-btn', null, acts), 'dl'); dl.title = 'JSON yuklab olish'; dl.addEventListener('click', e => { e.stopPropagation(); onDownload(it.id); }); }
        const del = icon(el('button', 'icon-btn danger', null, acts), 'x');
        del.title = "O'chirish";
        row.addEventListener('click', () => onOpen(it.id));
        del.addEventListener('click', e => { e.stopPropagation(); onDelete(it.id); });
      });
    }
  };
  Q.ui = ui;
})(window.QW);
