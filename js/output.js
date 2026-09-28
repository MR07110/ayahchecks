// "/output" sahifa: tayyor natijalarni ko'rish, nusxalash, JSON yuklab olish.
(function (Q) {
  const ui = Q.ui, $ = ui.$;
  let last = null;

  const refresh = () => ui.history(openItem, delItem);
  refresh();

  async function openItem(id) {
    try {
      last = await Q.hist.get(id);
      ui.result(last, Q.validate(last), 'Saqlangan natija');
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { ui.error(e.message); }
  }
  async function delItem(id) {
    try { await Q.hist.remove(id); refresh(); ui.toast("O'chirildi"); } catch (e) { ui.error(e.message); }
  }
  $('clearAllBtn').addEventListener('click', async () => {
    if (!confirm("Barcha natijalarni o'chirasizmi?")) return;
    try { await Q.hist.clear(); refresh(); ui.hideResult(); ui.toast("Hammasi o'chirildi"); } catch (e) { ui.error(e.message); }
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
    const blob = new Blob([JSON.stringify(last, (k, v) => k === '_bad' ? undefined : v, 2)], { type: 'application/json' });
    const a = document.createElement('a'), name = (last.surah_number ? last.surah_number + '-' : '') + 'ayahchecks-' + Date.now() + '.json';
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  Q.supa.ready.then(() => Q.hist.load()).then(() => {
    refresh();
    const id = new URLSearchParams(location.search).get('id');
    if (id) openItem(id);
  }).catch(e => ui.error(e.message));
})(window.QW);
