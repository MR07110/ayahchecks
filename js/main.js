(function (Q) {
  const C = Q.CFG, ui = Q.ui, $ = ui.$;
  let file = null, last = null, busy = false;

  // ---- boshlang'ich holat ----
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

  const refreshHistory = () => ui.history(openItem, delItem);
  refreshHistory();

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
  $('runBtn').addEventListener('click', async () => {
    if (busy) return;
    const P = C.PROVIDERS[provSel.value];
    if (!file) return ui.error('Rasm tanlang.');
    busy = true; const btn = $('runBtn'); btn.disabled = true; btn.textContent = 'Ajratilmoqda...';
    ui.hideError(); ui.hideResult(); ui.hideWarn();
    $('logPanel').hidden = false; Q.log.clear(); Q.log.info('Boshlandi: ' + P.name + ' / ' + sel.value);
    try {
      const { parsed, usage, ms } = await Q.api.analyze({ file, model: sel.value, provider: provSel.value, onStatus: s => { btn.textContent = s; } });
      let v = Q.validate(parsed);
      if (v.issues.some(i => i.lvl === 'err' && !i.ayah)) throw new Error("Rasmdan oyat topilmadi. Aniqroq rasm yuklang.");
      const meta = 'Model: ' + sel.value + ' · ' + (ms / 1000).toFixed(1) + ' s' + (usage ? ' · ' + usage.total_tokens + ' token' : '');
      last = parsed; ui.result(parsed, v, meta);
      btn.textContent = "Mus'haf bilan solishtirilmoqda..."; Q.log.info("Mus'haf (alquran.cloud) bilan solishtirilmoqda...");
      const ver = await Q.verify(parsed);           // tarmoq xatosi bo'lsa null — natija baribir saqlanadi
      if (ver) { v = Q.validate(parsed); ui.result(parsed, v, meta); Q.log.ok("Solishtirish tugadi"); } else Q.log.warn("Mus'haf bilan solishtirib bo'lmadi (tarmoq)");
      Q.hist.add(parsed); refreshHistory();
      ui.warn("Diqqat: natija sun'iy intellekt tomonidan o'qilgan" + (ver ? '. Yashil belgi — ochiq Mus\'haf matni bilan mos kelganini bildiradi' : '') + ". Muhim joylarni asl Mus'haf bilan tekshiring.");
    } catch (e) { console.error(e); Q.log.err(e.message || 'Xatolik.'); ui.error(e.message || 'Xatolik.'); }
    finally { busy = false; btn.disabled = false; btn.textContent = 'Ajratish'; }
  });

  // ---- tarix ----
  function openItem(id) {
    const it = Q.hist.list().find(x => x.id === id); if (!it) return;
    last = it.data; ui.result(last, Q.validate(last), 'Tarixdan ochildi');
    showTab('scan'); $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function delItem(id) { if (Q.hist.remove(id)) { refreshHistory(); ui.toast("O'chirildi"); } }
  $('clearAllBtn').addEventListener('click', () => {
    if (confirm("Barcha tarixni o'chirasizmi?") && Q.hist.clear()) { refreshHistory(); ui.toast("Barcha tarix o'chirildi"); }
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
