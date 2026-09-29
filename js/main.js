(function (Q) {
  const C = Q.CFG, ui = Q.ui, $ = ui.$;
  let file = null, last = null, busy = false;

  // ---- boshlang'ich holat ----
  const PV = C.PROVIDERS, tg = $('providerToggle'), sel = $('modelSelect');
  let prov = Q.store.get(C.K_PROVIDER, 'groq'); if (!PV[prov]) prov = 'groq';
  Object.keys(PV).forEach(id => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.id = id; b.textContent = PV[id].name; b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { if (busy || id === prov) return; prov = id; Q.store.set(C.K_PROVIDER, prov); applyProvider(); });
    tg.appendChild(b);
  });

  function readKey(id) {
    let k = Q.store.get(PV[id].kKey, '');
    if (!k) { try { k = localStorage.getItem(PV[id].kKey) || ''; } catch { k = ''; } }
    return k;
  }
  function modelFor(id) {
    const saved = Q.store.get(PV[id].kModel, '');
    return PV[id].models.some(x => x[0] === saved) ? saved : PV[id].models[0][0];
  }
  function applyProvider() {
    const P = PV[prov];
    tg.querySelectorAll('button').forEach(b => { const on = b.dataset.id === prov; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    $('apiKeyLabel').textContent = P.keyLabel; $('apiKeyInput').placeholder = P.ph; $('apiKeyInput').value = readKey(prov);
    const l = $('apiHintLink'); l.href = P.helpUrl; l.textContent = P.helpText;
    sel.innerHTML = '';
    P.models.forEach(([id, name]) => { const o = document.createElement('option'); o.value = id; o.textContent = name; sel.appendChild(o); });
    sel.value = modelFor(prov);
  }
  $('apiKeyInput').addEventListener('input', e => Q.store.set(PV[prov].kKey, e.target.value.trim()));
  sel.addEventListener('change', () => Q.store.set(PV[prov].kModel, sel.value));
  applyProvider();

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
    const k = $('apiKeyInput').value.trim();
    if (!k) return ui.error(PV[prov].name + " API kalitini kiriting.");
    if (!file) return ui.error('Rasm tanlang.');
    busy = true; const btn = $('runBtn'); btn.disabled = true; btn.textContent = 'Ajratilmoqda...';
    ui.hideError(); ui.hideResult(); ui.hideWarn();
    try {
      const onStatus = s => { btn.textContent = s; };
      let used = prov, res;
      try { res = await Q.api.analyze({ file, key: k, model: sel.value, provider: prov, onStatus }); }
      catch (e) {
        const other = Object.keys(PV).find(id => id !== prov && readKey(id));
        if (!(C.FALLBACK && e.retryable && other)) throw e;
        used = other; btn.textContent = PV[other].name + " ga o'tilmoqda...";
        res = await Q.api.analyze({ file, key: readKey(other), model: modelFor(other), provider: other, onStatus });
      }
      const { parsed, usage, ms } = res, usedModel = used === prov ? sel.value : modelFor(used);
      let v = Q.validate(parsed);
      if (v.issues.some(i => i.lvl === 'err' && !i.ayah)) throw new Error("Rasmdan oyat topilmadi. Aniqroq rasm yuklang.");
      const meta = PV[used].name + ' · ' + usedModel + ' · ' + (ms / 1000).toFixed(1) + ' s' + (usage ? ' · ' + usage.total_tokens + ' token' : '');
      last = parsed; ui.result(parsed, v, meta);
      btn.textContent = "Mus'haf bilan solishtirilmoqda...";
      const ver = await Q.verify(parsed);           // tarmoq xatosi bo'lsa null — natija baribir saqlanadi
      if (ver) { v = Q.validate(parsed); ui.result(parsed, v, meta); }
      Q.hist.add(parsed); refreshHistory();
      ui.warn("Diqqat: natija sun'iy intellekt tomonidan o'qilgan" + (ver ? '. Yashil belgi — ochiq Mus\'haf matni bilan mos kelganini bildiradi' : '') + ". Muhim joylarni asl Mus'haf bilan tekshiring.");
    } catch (e) { console.error(e); ui.error(e.message || 'Xatolik.'); }
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
