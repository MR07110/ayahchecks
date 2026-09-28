// "/input" sahifa: rasmlarni kiritish va navbat bilan tahlil qilish.
(function (Q) {
  const C = Q.CFG, ui = Q.ui, $ = ui.$, J = Q.jobs;
  const queue = []; let busy = false;

  const sel = $('modelSelect');
  C.MODELS.forEach(([id, name]) => { const o = document.createElement('option'); o.value = id; o.textContent = name; sel.appendChild(o); });
  const savedModel = Q.store.get(C.K_MODEL, '');
  if (C.MODELS.some(m => m[0] === savedModel)) sel.value = savedModel;
  sel.addEventListener('change', () => Q.store.set(C.K_MODEL, sel.value));
  $('autoRun').checked = Q.store.get(C.K_AUTORUN, true);
  $('autoRun').addEventListener('change', e => Q.store.set(C.K_AUTORUN, e.target.checked));
  Q.supa.ready.catch(e => ui.error(e.message));

  const badge = s => s === 'done' ? 'ok' : s === 'error' ? 'err' : s === 'queued' ? 'wait' : 'busy';
  function render(it) {
    if (!it.row) it.row = ui.el('div', 'job', null, $('queue'));
    it.row.textContent = '';
    const info = ui.el('div', '', null, it.row);
    ui.el('div', 'job-name', it.name, info);
    if (it.msg) ui.el('div', 'job-meta', it.msg, info);
    const side = ui.el('div', '', null, it.row);
    ui.el('span', 'badge ' + badge(it.state), J.LABEL[it.state] || it.state, side);
    if (it.state === 'done' && it.checkId) { side.appendChild(document.createTextNode(' ')); const a = ui.el('a', '', 'Ochish', side); a.href = '/output?id=' + it.checkId; }
    $('runBtn').disabled = busy || !queue.some(i => i.state === 'queued');
  }
  async function setState(it, state, msg) {
    it.state = state; it.msg = msg || ''; render(it);
    if (it.jobId) await J.update(it.jobId, { status: state, message: msg || null });
  }

  async function addFiles(files) {
    ui.hideError();
    for (const f of files) {
      if (!f || !f.type || !f.type.startsWith('image/')) { ui.error('Faqat rasm fayllari qabul qilinadi: ' + (f && f.name || '')); continue; }
      if (f.size > C.MAX_FILE) { ui.error(f.name + ': hajmi 10 MB dan oshmasligi kerak.'); continue; }
      const it = { name: f.name || 'rasm-' + Date.now() + '.png', raw: f, state: 'queued', msg: '' };
      queue.push(it); render(it);
      try { await Q.supa.ready; it.jobId = await J.create(it.name); } catch (e) { ui.toast(e.message, 4000); }
    }
    if ($('autoRun').checked) runQueue();
  }

  async function runOne(it) {
    try {
      await Q.supa.ready;
      await setState(it, 'preparing');
      const blob = await Q.api.prepare(it.raw);
      await setState(it, 'analyzing');
      const { parsed } = await Q.api.analyze({ file: blob, model: sel.value, onStatus: s => { it.msg = s; render(it); } });
      let v = Q.validate(parsed);
      if (v.issues.some(i => i.lvl === 'err' && !i.ayah)) throw new Error("Rasmdan oyat topilmadi. Aniqroq rasm yuklang.");
      await setState(it, 'verifying');
      const ver = await Q.verify(parsed);           // tarmoq xatosi bo'lsa null — natija baribir saqlanadi
      if (ver) v = Q.validate(parsed);
      await setState(it, 'saving');
      it.checkId = await Q.hist.add(parsed, v.score);
      const msg = (parsed.surah || '') + ' · ' + v.ayahs + ' oyat · ' + v.score + '%';
      it.state = 'done'; it.msg = msg; render(it);
      if (it.jobId) await J.update(it.jobId, { status: 'done', message: msg, check_id: it.checkId });
    } catch (e) {
      console.error(e);
      await setState(it, 'error', e.message || 'Xatolik.');
    }
  }

  async function runQueue() {
    if (busy) return;
    busy = true; $('runBtn').disabled = true;
    let it;
    while ((it = queue.find(i => i.state === 'queued'))) await runOne(it);
    busy = false; $('runBtn').disabled = !queue.some(i => i.state === 'queued');
    if (queue.some(i => i.state === 'done')) ui.warn("Diqqat: natija sun'iy intellekt tomonidan o'qilgan. Muhim joylarni asl Mus'haf bilan tekshiring. Natijalar — \"Natijalar\" sahifasida.");
  }
  $('runBtn').addEventListener('click', runQueue);

  $('imageInput').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
  const dz = $('dropZone');
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, () => dz.classList.add('dragover')));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove('dragover')));
  dz.addEventListener('drop', e => addFiles([...((e.dataTransfer && e.dataTransfer.files) || [])]));
  document.addEventListener('paste', e => {
    const fs = [...((e.clipboardData && e.clipboardData.items) || [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile());
    if (fs.length) { e.preventDefault(); addFiles(fs); }
  });
  window.addEventListener('beforeunload', e => { if (busy) { e.preventDefault(); e.returnValue = ''; } });
})(window.QW);
