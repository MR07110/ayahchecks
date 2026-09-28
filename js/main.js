(function (Q) {
  const C = Q.CFG, ui = Q.ui, $ = ui.$;
  let file = null, last = null, busy = false;

  // ---- boshlang'ich holat ----
  const sel = $('modelSelect');
  C.MODELS.forEach(([id, name]) => { const o = document.createElement('option'); o.value = id; o.textContent = name; sel.appendChild(o); });
  const savedModel = Q.store.get(C.K_MODEL, '');
  if (C.MODELS.some(m => m[0] === savedModel)) sel.value = savedModel;
  sel.addEventListener('change', () => Q.store.set(C.K_MODEL, sel.value));

  [['autoRun', C.K_AUTORUN, true], ['autoCopy', C.K_AUTOCOPY, false]].forEach(([id, k, d]) => {
    $(id).checked = Q.store.get(k, d);
    $(id).addEventListener('change', e => Q.store.set(k, e.target.checked));
  });

  const refreshHistory = () => ui.history(openItem, delItem);
  refreshHistory();
  // Supabase: anonim sessiya + tarixni yuklash
  Q.supa.ready.then(() => Q.hist.load()).then(refreshHistory)
    .catch(e => { console.error(e); ui.error(e.message || "Serverga ulanib bo'lmadi."); });

  // ---- tablar ----
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
    if (name === 'history') refreshHistory();
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---- fayl qabul qilish ----
  async function handleFile(f) {
    if (!f) return;
    if (!f.type || !f.type.startsWith('image/')) return ui.error('Faqat rasm fayllari qabul qilinadi.');
    if (f.size > C.MAX_FILE) return ui.error('Fayl hajmi 10 MB dan oshmasligi kerak.');
    ui.hideError(); ui.hideResult(); ui.hideWarn();
    file = await Q.api.prepare(f);
    const p = $('preview'); if (p.dataset.url) URL.revokeObjectURL(p.dataset.url);
    p.dataset.url = URL.createObjectURL(file); p.src = p.dataset.url; p.style.display = 'block';
    $('runBtn').disabled = false; ui.toast('Rasm yuklandi');
    if ($('autoRun').checked) run();
  }
  $('imageInput').addEventListener('change', e => handleFile(e.target.files && e.target.files[0]));
  const dz = $('dropZone');
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, () => dz.classList.add('dragover')));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove('dragover')));
  dz.addEventListener('drop', e => handleFile(e.dataTransfer && e.dataTransfer.files[0]));
  document.addEventListener('paste', e => {
    const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'));
    if (it) { e.preventDefault(); handleFile(it.getAsFile()); }
  });

  // ---- tahlil ----
  async function run() {
    if (busy) return;
    if (!file) return ui.error('Rasm tanlang.');
    busy = true; const btn = $('runBtn'); btn.disabled = true; btn.textContent = 'Ajratilmoqda...';
    ui.hideError(); ui.hideResult(); ui.hideWarn();
    try {
      await Q.supa.ready;
      const { parsed, usage, ms } = await Q.api.analyze({ file, model: sel.value, onStatus: s => { btn.textContent = s; } });
      let v = Q.validate(parsed);
      if (v.issues.some(i => i.lvl === 'err' && !i.ayah)) throw new Error("Rasmdan oyat topilmadi. Aniqroq rasm yuklang.");
      const meta = 'Model: ' + sel.value + ' · ' + (ms / 1000).toFixed(1) + ' s' + (usage ? ' · ' + usage.total_tokens + ' token' : '');
      last = parsed; ui.result(parsed, v, meta);
      btn.textContent = "Mus'haf bilan solishtirilmoqda...";
      const ver = await Q.verify(parsed);           // tarmoq xatosi bo'lsa null — natija baribir saqlanadi
      if (ver) { v = Q.validate(parsed); ui.result(parsed, v, meta); }
      try { await Q.hist.add(parsed, v.score); refreshHistory(); } catch (e) { console.error(e); ui.toast(e.message, 4000); }
      if ($('autoCopy').checked) ui.copy(parsed.ayahs.map(a => a.full_uzbek).filter(Boolean).join('\n'));
      ui.warn("Diqqat: natija sun'iy intellekt tomonidan o'qilgan" + (ver ? '. Yashil belgi — ochiq Mus\'haf matni bilan mos kelganini bildiradi' : '') + ". Muhim joylarni asl Mus'haf bilan tekshiring.");
    } catch (e) { console.error(e); ui.error(e.message || 'Xatolik.'); }
    finally { busy = false; btn.disabled = false; btn.textContent = 'Ajratish'; }
  }
  $('runBtn').addEventListener('click', run);

  // ---- tarix ----
  async function openItem(id) {
    try {
      const data = await Q.hist.get(id);
      last = data; ui.result(last, Q.validate(last), 'Tarixdan ochildi');
      showTab('scan'); $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { ui.error(e.message); }
  }
  async function delItem(id) {
    try { await Q.hist.remove(id); refreshHistory(); ui.toast("O'chirildi"); } catch (e) { ui.error(e.message); }
  }
  $('clearAllBtn').addEventListener('click', async () => {
    if (!confirm("Barcha tarixni o'chirasizmi?")) return;
    try { await Q.hist.clear(); refreshHistory(); ui.toast("Barcha tarix o'chirildi"); } catch (e) { ui.error(e.message); }
  });

  // ---- nusxalash / JSON ----
  $('copyBtn').addEventListener('click', async () => {
    if (!last) return;
    let t = (last.surah || '') + '\n\n';
    last.ayahs.forEach(a => { t += a.number + '. ' + a.words.map(w => w.arabic + ' (' + w.uzbek + ')').join(' ') + '\n' + (a.full_uzbek || '') + '\n\n'; });
    try { await navigator.clipboard.writeText(t.trim()); ui.toast('Nusxalandi'); } catch { ui.error('Nusxalash imkonsiz.'); }
  });
  $('jsonBtn').addEventListener('click', () => {
    const r = $('rawJson'), show = r.style.display !== 'block';
    r.style.display = show ? 'block' : 'none'; $('jsonBtn').textContent = show ? 'JSON yashirish' : "JSON ko'rish";
  });
})(window.QW);
