// "/output" sahifa: tayyor natijalarni ko'rish, nusxalash, JSON yuklab olish.
(function (Q) {
  const ui = Q.ui, $ = ui.$;
  let last = null;

  const refresh = () => ui.history(openItem, delItem, dlItem);
  refresh();

  async function openItem(id) {
    try {
      last = await Q.hist.get(id);
      ui.result(last, Q.validate(last), 'Saqlangan natija');
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { ui.error(e.message); }
  }
  const clean = d => JSON.stringify(Q.simple(d), null, 2);   // faqat so'zlar + sura/oyat
  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function dlItem(id) {
    try { const d = await Q.hist.get(id); save(new Blob([clean(d)], { type: 'application/json' }), Q.name.file(d) + '.json'); }
    catch (e) { ui.error(e.message); }
  }
  async function delItem(id) {
    try { await Q.hist.remove(id); sig = signature(); refresh(); ui.toast("O'chirildi"); } catch (e) { ui.error(e.message); }
  }
  $('clearAllBtn').addEventListener('click', async () => {
    if (!confirm("Barcha natijalarni o'chirasizmi?")) return;
    try { await Q.hist.clear(); sig = signature(); refresh(); ui.hideResult(); ui.toast("Hammasi o'chirildi"); } catch (e) { ui.error(e.message); }
  });

  $('copyBtn').addEventListener('click', async () => {
    if (!last) return;
    let t = (last.surah || '') + '\n\n';
    last.ayahs.forEach(a => { t += a.number + '. ' + a.words.map(w => w.arabic + ' (' + w.uzbek + ')').join(' ') + '\n' + (a.full_uzbek || '') + '\n\n'; });
    ui.copy(t.trim());
  });
  $('jsonBtn').addEventListener('click', () => {
    const r = $('rawJson'), show = r.style.display !== 'block';
    r.style.display = show ? 'block' : 'none'; $('jsonBtn').textContent = show ? 'JSON yashirish' : "JSON ko'rish";
  });
  $('downloadBtn').addEventListener('click', () => {
    if (!last) return;
    save(new Blob([clean(last)], { type: 'application/json' }), Q.name.file(last) + '.json');
  });

  // Hammasini bitta ZIP qilib yuklash: har natija o'z nomi bilan + fihrist.csv
  $('zipBtn').addEventListener('click', async () => {
    const btn = $('zipBtn'); btn.disabled = true; const t0 = btn.textContent; btn.textContent = 'Tayyorlanmoqda...';
    try {
      const rows = await Q.hist.all();
      if (!rows.length) return ui.toast("Yuklash uchun natija yo'q");
      const used = {}, files = [], csv = ['fayl,sura,oyat,soz,sana'];
      rows.forEach(r => {
        const base = Q.name.file(r.data), n = used[base] = (used[base] || 0) + 1, name = base + (n > 1 ? '_' + n : '') + '.json', i = Q.name.info(r.data);
        files.push({ name, data: clean(r.data) });
        csv.push([name, i.s + ' ' + i.name, i.from === i.to ? i.from : i.from + '-' + i.to, i.single ? i.wmin + '-' + i.wmax : i.total, r.created_at.slice(0, 16).replace('T', ' ')].join(','));
      });
      files.push({ name: 'fihrist.csv', data: '\uFEFF' + csv.join('\n') + '\n' });
      const d = new Date(), p = n => String(n).padStart(2, '0');
      save(Q.zip(files, d), 'ayahchecks_' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.zip');
      ui.toast(files.length - 1 + ' ta fayl ZIP ga yig\'ildi');
    } catch (e) { ui.error(e.message); }
    finally { btn.disabled = false; btn.textContent = t0; }
  });

  // Ro'yxat boshqa qurilmada o'zgarsa (yangi natija / o'chirilgan) shu yerda ham jonli yangilanadi
  let sig = null;
  const signature = () => Q.hist.list().map(x => x.id + ':' + x.score).join(',');
  async function reload() { await Q.hist.load(); const s = signature(); if (s !== sig) { sig = s; refresh(); } }
  Q.supa.ready.then(async () => {
    await Q.hist.load(); sig = signature(); refresh();
    const id = new URLSearchParams(location.search).get('id');
    if (id) openItem(id);
    Q.live.watch({ name: 'checks-live', table: 'checks', onEvent: () => reload().catch(() => {}), refetch: reload, poll: 8000 });
  }).catch(e => ui.error(e.message));
})(window.QW);
