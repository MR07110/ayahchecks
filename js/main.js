(function (Q) {
  const C = Q.CFG, ui = Q.ui, $ = ui.$;
  let last = null, lastItem = null, running = false, seq = 0;
  const queue = [];   // { id, file, name, status: wait|work|ok|err, msg, histId }

  // ---- provayder / model ----
  const sel = $('modelSelect'), provSel = $('providerSelect');
  Object.entries(C.PROVIDERS).forEach(([id, p]) => { const o = document.createElement('option'); o.value = id; o.textContent = p.name; provSel.appendChild(o); });
  const savedProv = Q.store.get(C.K_PROV, 'groq');
  provSel.value = C.PROVIDERS[savedProv] ? savedProv : 'groq';
  const modelKey = () => C.K_MODEL + (provSel.value === 'groq' ? '' : '_' + provSel.value);
  function applyProvider() {
    const P = C.PROVIDERS[provSel.value];
    sel.textContent = '';
    P.models.forEach(([id, name]) => { const o = document.createElement('option'); o.value = id; o.textContent = name; sel.appendChild(o); });
    const saved = Q.store.get(modelKey(), '');
    if (P.models.some(m => m[0] === saved)) sel.value = saved;
  }
  applyProvider();
  provSel.addEventListener('change', () => { Q.store.set(C.K_PROV, provSel.value); applyProvider(); });
  sel.addEventListener('change', () => Q.store.set(modelKey(), sel.value));
  $('logClear').addEventListener('click', () => Q.log.clear());

  // ---- tarix ----
  const histItem = id => Q.hist.list().find(x => x.id === id);
  const refreshHistory = () => ui.history({ open: openItem, del: delItem, dl: dlItem });
  refreshHistory();

  function show(item) {
    last = item.data; lastItem = item;
    ui.result(item.data, Q.validate(item.data), (item.file ? 'Rasm: ' + item.file + ' · ' : '') + (item.model ? 'Model: ' + item.model + (item.ms ? ' · ' + (item.ms / 1000).toFixed(1) + ' s' : '') : 'Tarixdan ochildi'));
    ui.warn("Diqqat: natija sun'iy intellekt tomonidan o'qilgan. Yashil belgi — ochiq Mus'haf matni bilan mos kelganini bildiradi. Muhim joylarni asl Mus'haf bilan tekshiring.");
  }
  function openItem(id) {
    const it = histItem(id); if (!it) return;
    show(it); showTab('scan'); $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function delItem(id) { if (Q.hist.remove(id)) { refreshHistory(); ui.toast("O'chirildi"); } }
  function dlItem(id) { const it = histItem(id); if (it) Q.exp.item(it); }
  $('clearAllBtn').addEventListener('click', () => {
    if (confirm("Barcha tarixni o'chirasizmi? (Avval «Hammasini yuklash» bilan saqlab oling)") && Q.hist.clear()) { refreshHistory(); ui.toast("Barcha tarix o'chirildi"); }
  });
  $('dlAllBtn').addEventListener('click', () => { if (Q.exp.all(Q.hist.list())) ui.toast('ZIP yuklanmoqda'); });

  // ---- tablar ----
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
    if (name === 'history') refreshHistory();
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---- navbat ----
  const renderQ = () => ui.queue(queue, {
    view: q => { const it = histItem(q.histId); if (it) { show(it); $('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); } else ui.toast("Tarixdan o'chirilgan"); },
    dl: q => { const it = histItem(q.histId); if (it) Q.exp.item(it); else ui.toast("Tarixdan o'chirilgan"); },
    retry: q => { q.status = 'wait'; q.msg = ''; renderQ(); pump(); },
    remove: q => { queue.splice(queue.indexOf(q), 1); renderQ(); }
  });
  $('queueClear').addEventListener('click', () => { for (let i = queue.length - 1; i >= 0; i--) if (queue[i].status === 'ok') queue.splice(i, 1); renderQ(); });

  function addFiles(list) {
    const files = [...(list || [])].filter(Boolean); let bad = 0, big = 0;
    files.forEach(f => {
      if (!f.type || !f.type.startsWith('image/')) return void bad++;
      if (f.size > C.MAX_FILE) return void big++;
      const id = ++seq, t = new Date(), p = n => String(n).padStart(2, '0');
      const generic = !f.name || /^image\.\w+$/i.test(f.name);
      const name = generic ? 'rasm-' + p(t.getHours()) + p(t.getMinutes()) + p(t.getSeconds()) + '-' + id + '.' + ((f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')) : f.name;
      queue.push({ id, file: f, name, status: 'wait', msg: '' });
    });
    if (bad || big) ui.error((bad ? bad + " ta fayl rasm emas. " : '') + (big ? big + " ta fayl 10 MB dan katta. " : '') + 'Ular qo\'shilmadi.'); else ui.hideError();
    if (!files.length || files.length === bad + big) return;
    $('logPanel').hidden = false; if (!running) Q.log.clear();
    Q.log.info(files.length - bad - big + " ta rasm navbatga qo'shildi");
    renderQ(); pump();
  }

  async function pump() {
    if (running) return; running = true;
    try {
      let q;
      while ((q = queue.find(x => x.status === 'wait'))) {
        const P = C.PROVIDERS[provSel.value], model = sel.value;
        q.status = 'work'; q.msg = ''; renderQ();
        Q.log.info('▶ ' + q.name + ' (' + P.name + ' / ' + model + ')');
        try {
          const f = await Q.api.prepare(q.file);
          const { parsed, ms } = await Q.api.analyze({ file: f, model, provider: provSel.value, onStatus: s => { q.msg = s; renderQ(); } });
          let v = Q.validate(parsed);
          if (v.issues.some(i => i.lvl === 'err' && !i.ayah)) throw new Error("Rasmdan oyat topilmadi. Aniqroq rasm yuklang.");
          q.msg = "Mus'haf bilan solishtirilmoqda..."; renderQ(); Q.log.info("Mus'haf (alquran.cloud) bilan solishtirilmoqda...");
          const ver = await Q.verify(parsed);      // tarmoq xatosi bo'lsa null — natija baribir saqlanadi
          v = Q.validate(parsed);
          if (!ver) Q.log.warn("Mus'haf bilan solishtirib bo'lmadi (tarmoq)");
          const item = Q.hist.add(parsed, { file: q.name, model, ms });
          q.histId = item.id; q.file = null; q.status = 'ok';
          q.msg = Q.exp.title(item) + ' · ' + Q.exp.filename(item);
          Q.log.ok('✓ ' + q.name + ' → ' + Q.exp.filename(item));
          if (Q.hist.lastDropped) ui.toast('Xotira to\'ldi: eng eski ' + Q.hist.lastDropped + ' ta yozuv o\'chdi. ZIP qilib yuklab oling!', 6000);
          refreshHistory();
          if (!last) show(item);                     // birinchi tayyor natija avtomatik ko'rinadi
        } catch (e) {
          console.error(e); q.status = 'err'; q.msg = e.message || 'Xatolik.';
          Q.log.err(q.name + ': ' + q.msg);
        }
        renderQ();
      }
    } finally { running = false; }
  }

  // ---- fayl qabul qilish ----
  $('imageInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  const dz = $('dropZone');
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, () => dz.classList.add('dragover')));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove('dragover')));
  dz.addEventListener('drop', e => addFiles(e.dataTransfer && e.dataTransfer.files));
  document.addEventListener('paste', e => {
    const fs = [...((e.clipboardData && e.clipboardData.items) || [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile());
    if (fs.length) { e.preventDefault(); addFiles(fs); }
  });

  // ---- nusxalash / JSON ----
  $('copyBtn').addEventListener('click', async () => {
    if (!last) return;
    let t = (last.surah || '') + '\n\n';
    last.ayahs.forEach(a => { t += a.number + '. ' + a.words.map(w => w.arabic + ' (' + w.uzbek + ')').join(' ') + '\n' + (a.full_uzbek || '') + '\n\n'; });
    try { await navigator.clipboard.writeText(t.trim()); ui.toast('Nusxalandi'); } catch { ui.error('Nusxalash imkonsiz.'); }
  });
  $('dlBtn').addEventListener('click', () => { if (lastItem) Q.exp.item(lastItem); });
  $('jsonBtn').addEventListener('click', () => {
    const r = $('rawJson'), show = r.style.display !== 'block';
    r.style.display = show ? 'block' : 'none'; $('jsonBtn').textContent = show ? 'JSON yashirish' : "JSON ko'rish";
  });
})(window.QW);
