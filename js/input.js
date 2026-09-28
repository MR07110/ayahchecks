// "/input" sahifa: rasm kiritish, tartiblash, nomini o'zgartirish, o'chirish. Tahlilni SERVER qiladi (api/worker.js):
// rasmlar Storage'ga yuklanadi, Start/Stop holati bazada — brauzer yopilsa ham navbat davom etadi.
(function (Q) {
  const C = Q.CFG, ui = Q.ui, $ = ui.$, J = Q.jobs, R = Q.run;
  const queue = []; let dragIt = null, orderTimer = null;
  const EDITABLE = ['queued', 'done', 'error'];          // faqat shu holatdagi rasmni ko'chirish/o'chirish mumkin
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const queued = () => queue.filter(i => i.state === 'queued');
  const working = () => queue.some(i => J.RUNNING.includes(i.state));

  // ---- sozlamalar ----
  const sel = $('modelSelect');
  C.MODELS.forEach(([id, name]) => { const o = document.createElement('option'); o.value = id; o.textContent = name; sel.appendChild(o); });
  const savedModel = Q.store.get(C.K_MODEL, '');
  if (C.MODELS.some(m => m[0] === savedModel)) sel.value = savedModel;
  sel.addEventListener('change', () => { Q.store.set(C.K_MODEL, sel.value); Q.supa.ready.then(() => J.setModel(sel.value)); });
  $('autoRun').checked = Q.store.get(C.K_AUTORUN, false);
  $('autoRun').addEventListener('change', e => Q.store.set(C.K_AUTORUN, e.target.checked));
  Q.supa.ready.catch(e => ui.error(e.message));

  // ---- Start/Stop tugmasi: holat bazadan (barcha tab va qurilmada bir xil) ----
  function syncBtn() {
    const b = $('runBtn'), n = k => queue.filter(i => i.state === k).length;
    let txt, dis = false, cls = 'primary';
    if (!R.ready) { txt = 'Yuklanmoqda...'; dis = true; }
    else if (R.halt) { txt = "Groq ishlamayapti — kalit yangilanishini kutmoqda..."; dis = true; }
    else if (R.running) { txt = "To'xtatish"; cls += ' stop'; }
    else if (working()) { txt = "To'xtatilmoqda: oxirgi ish tugayapti..."; dis = true; cls += ' stop'; }
    else { txt = 'Boshlash'; dis = !queued().length; }
    b.textContent = txt; b.disabled = dis; b.className = cls;
    $('queueBar').hidden = !queue.length;
    $('queueInfo').textContent = queue.length + ' ta rasm · navbatda: ' + n('queued') + (working() ? ' · ishlanmoqda: 1' : '') + ' · tayyor: ' + n('done') + (n('error') ? ' · xato: ' + n('error') : '');
  }
  R.on(syncBtn);
  $('runBtn').addEventListener('click', async () => {
    try {
      if (R.running) { await R.stop(); ui.toast("To'xtatildi: joriy ish tugagach to'xtaydi", 3500); }
      else { await J.setModel(sel.value); await pushOrder(); await R.start(); ui.hideWarn(); }
    } catch (e) { ui.error(e.message); }
  });

  // ---- ro'yxat ko'rinishi ----
  const badge = s => s === 'done' ? 'ok' : s === 'error' ? 'err' : s === 'queued' ? 'wait' : 'busy';
  function leave(row) {                                     // qator silliq yo'qoladi
    row.style.maxHeight = row.offsetHeight + 'px'; row.style.overflow = 'hidden'; void row.offsetHeight; row.classList.add('leaving');
    setTimeout(() => row.remove(), 280);
  }
  function relayout() {                                     // DOM ni massiv tartibiga moslaydi (FLIP animatsiya bilan)
    const box = $('queue'), flip = queue.length < 150, before = new Map();
    if (flip) queue.forEach(it => { if (it.row.isConnected) before.set(it, it.row.getBoundingClientRect().top); });
    queue.forEach((it, i) => { if (box.children[i] !== it.row) box.insertBefore(it.row, box.children[i] || null); const t = String(i + 1); if (it.numEl.textContent !== t) it.numEl.textContent = t; });
    if (flip) before.forEach((top, it) => { const dy = top - it.row.getBoundingClientRect().top; if (Math.abs(dy) > 1 && it.row.animate) it.row.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
    syncBtn();
  }
  function btn(text, title, parent, fn) {
    const b = ui.icon(ui.el('button', 'icon-btn sm', null, parent), text); b.title = title; b.type = 'button';
    b.addEventListener('click', e => { e.stopPropagation(); fn(); });
    return b;
  }
  function build(it) {
    const row = it.row = ui.el('div', 'job q-row', null, $('queue'));
    it.numEl = ui.el('span', 'q-num', '', row);
    const h = ui.icon(ui.el('span', 'q-handle', null, row), 'grip'); h.title = "Sudrab joyini o'zgartiring";
    const th = ui.el('img', 'q-thumb', null, row); th.loading = 'lazy'; th.decoding = 'async'; th.alt = ''; th.draggable = false; if (it.url) th.src = it.url;
    it.thumbEl = th;
    const info = ui.el('div', 'q-info', null, row);
    it.nameEl = ui.el('div', 'job-name', null, info); it.msgEl = ui.el('div', 'job-meta', null, info);
    const side = ui.el('div', 'job-side', null, row);
    it.badgeEl = ui.el('span', 'badge', null, side); it.linkEl = ui.el('a', '', 'Ochish', side);
    it.retryEl = btn('retry', 'Qayta urinish', side, () => J.retry(it.jobId).catch(e => ui.toast(e.message, 4000)));
    it.upEl = btn('up', 'Yuqoriga', side, () => move(it, -1));
    it.downEl = btn('down', 'Pastga', side, () => move(it, 1));
    it.editEl = btn('edit', "Nomini o'zgartirish", side, () => rename(it));
    it.delEl = btn('x', 'Olib tashlash', side, () => dropItems([it]));
    it.delEl.classList.add('danger');

    h.addEventListener('mousedown', () => { if (EDITABLE.includes(it.state)) row.draggable = true; });
    h.addEventListener('mouseup', () => { row.draggable = false; });
    row.addEventListener('dragstart', e => {
      if (!row.draggable) return e.preventDefault();
      dragIt = it; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.name); row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => { row.draggable = false; row.classList.remove('dragging'); clearMarks(); dragIt = null; });
    const after = e => { const r = row.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
    row.addEventListener('dragover', e => {
      if (!dragIt || dragIt === it) return;
      e.preventDefault(); clearMarks(); row.classList.add(after(e) ? 'drop-after' : 'drop-before');
    });
    row.addEventListener('drop', e => {
      if (!dragIt || dragIt === it) return;
      e.preventDefault(); e.stopPropagation();
      const src = dragIt, a = after(e); clearMarks();
      queue.splice(queue.indexOf(src), 1); queue.splice(queue.indexOf(it) + (a ? 1 : 0), 0, src); relayout(); scheduleOrder();
    });
  }
  const clearMarks = () => document.querySelectorAll('.q-row.drop-before,.q-row.drop-after').forEach(r => r.classList.remove('drop-before', 'drop-after'));
  function render(it) {
    if (!it.editing) it.nameEl.textContent = it.name;
    it.msgEl.textContent = it.msg || ''; it.msgEl.hidden = !it.msg;
    it.badgeEl.textContent = J.LABEL[it.state] || it.state; it.badgeEl.className = 'badge ' + badge(it.state);
    it.linkEl.hidden = !(it.state === 'done' && it.checkId);
    if (!it.linkEl.hidden) it.linkEl.href = '/output?id=' + it.checkId;
    const ed = EDITABLE.includes(it.state);
    it.upEl.hidden = it.downEl.hidden = it.delEl.hidden = !ed;
    it.retryEl.hidden = !(it.state === 'error' && it.path);
    syncBtn();
  }

  // ---- tartib (bazaga yoziladi: server shu tartibda oladi) ----
  const orderIds = () => queue.filter(i => i.jobId && ['uploading', 'queued'].includes(i.state)).map(i => i.jobId);
  async function pushOrder() { clearTimeout(orderTimer); await J.setOrder(orderIds()); }
  function scheduleOrder() { clearTimeout(orderTimer); orderTimer = setTimeout(() => { pushOrder(); }, 500); }
  function move(it, dir) {
    const i = queue.indexOf(it), j = i + dir;
    if (j < 0 || j >= queue.length) return;
    queue.splice(i, 1); queue.splice(j, 0, it); relayout(); scheduleOrder(); it.row.scrollIntoView({ block: 'nearest' });
  }
  function rename(it) {
    if (it.editing) return;
    it.editing = true;
    const inp = document.createElement('input'); inp.className = 'q-edit'; inp.value = it.name; inp.maxLength = 120;
    it.nameEl.textContent = ''; it.nameEl.appendChild(inp); inp.focus(); inp.select();
    let done = false;
    const finish = save => {
      if (done) return; done = true; it.editing = false;
      const v = inp.value.trim().replace(/\s+/g, ' ');
      if (save && v && v !== it.name) { it.name = v; if (it.jobId) J.update(it.jobId, { filename: v }); }
      render(it);
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  }
  function dropItems(items) {
    items = items.filter(it => EDITABLE.includes(it.state));
    const ids = [], paths = [];
    items.forEach(it => {
      queue.splice(queue.indexOf(it), 1); it.state = 'removed';
      leave(it.row); if (it.blobUrl) URL.revokeObjectURL(it.blobUrl);
      if (it.jobId) { ids.push(it.jobId); paths.push(it.path); }
    });
    relayout();
    J.removeMany(ids, paths).catch(e => ui.toast(e.message, 4000));
  }
  $('sortBtn').addEventListener('click', () => {
    queue.sort((a, b) => collator.compare(a.name, b.name)); relayout(); scheduleOrder(); ui.toast('Nom bo\'yicha tartiblandi');
  });
  $('clearQueueBtn').addEventListener('click', () => {
    const its = queue.filter(i => EDITABLE.includes(i.state));
    if (its.length && confirm(its.length + " ta rasmni ro'yxatdan olib tashlaysizmi? (Saqlangan natijalar o'chmaydi)")) dropItems(its);
  });

  // ---- rasm qo'shish: tayyorlash → Storage'ga yuklash → "navbatda" ----
  let seq = 0;
  async function addFiles(files) {
    if (!files.length) return;
    ui.hideError();
    const ok = [], bad = [];
    files.forEach(f => {
      if (!f || !f.type || !f.type.startsWith('image/')) bad.push((f && f.name || '?') + ': rasm emas');
      else if (f.size > C.MAX_FILE) bad.push(f.name + ': 10 MB dan katta');
      else ok.push(f);
    });
    if (bad.length) ui.error('Qabul qilinmadi (' + bad.length + '): ' + bad.slice(0, 3).join(' · ') + (bad.length > 3 ? ' ...' : ''));
    if (!ok.length) return;
    ok.sort((a, b) => collator.compare(a.name || '', b.name || ''));
    const items = ok.map(f => { const u = URL.createObjectURL(f); return { name: f.name || 'rasm-' + Date.now() + '-' + (++seq) + '.png', raw: f, url: u, blobUrl: u, state: 'uploading', msg: '' }; });
    items.forEach(it => { queue.push(it); build(it); render(it); });
    relayout(); ui.toast(items.length + " ta rasm qo'shildi");
    const names = items.map(i => i.name);
    try {
      await Q.supa.ready;
      const ids = await J.createMany(names, sel.value);
      items.forEach((it, k) => {
        if (it.state === 'removed') return J.remove(ids[k]).catch(() => {});
        it.jobId = ids[k];
        if (it.name !== names[k]) J.update(it.jobId, { filename: it.name });
      });
    } catch (e) { items.forEach(it => { it.state = 'error'; it.msg = e.message; render(it); }); return; }
    await pushOrder();
    let next = 0;                                        // 3 ta parallel yuklash
    await Promise.all([0, 1, 2].map(async () => {
      while (next < items.length) {
        const it = items[next++];
        if (it.state === 'removed') continue;
        try {
          const blob = await Q.api.prepare(it.raw);
          if (it.state === 'removed') continue;
          await Q.outbox.put(it.jobId, blob); it.raw = null;          // qurilmada saqlandi: sahifa yopilsa ham yuklanadi
          it.path = await J.upload(it.jobId, blob); await Q.outbox.del(it.jobId);
        } catch (e) { Q.outbox.live.delete(it.jobId); it.msg = "Yuklash kutilmoqda, qayta uriniladi"; render(it); }   // outbox o'zi qayta uradi
      }
    }));
    if ($('autoRun').checked && !R.halt && !R.running) { try { await J.setModel(sel.value); await pushOrder(); await R.start(); } catch (e) { ui.error(e.message); } }
    else if (R.running) R.kick();                        // ishlab turgan bo'lsa yangi rasmlar uchun worker'ni uyg'otadi
  }

  // ---- bazadan sinxronlash: server o'zgartirgan holatlar shu yerga keladi; sahifa qayta ochilsa navbat tiklanadi ----
  async function fromDB() {
    let rows; try { rows = await J.listQueue(); } catch (e) { return ui.error(e.message); }
    const byId = new Map(queue.filter(i => i.jobId).map(i => [i.jobId, i])), seen = new Set(); let fresh = [];
    rows.forEach(r => {
      seen.add(r.id);
      const it = byId.get(r.id);
      if (!it) { fresh.push(r); return; }
      if (it.state === 'uploading' && r.status === 'uploading') return;           // brauzer o'zi yuklayapti
      if (!it.editing && r.filename !== it.name) it.name = r.filename;
      it.state = r.status; it.msg = r.message || ''; it.checkId = r.check_id; it.path = r.image_path || it.path;
      render(it);
    });
    queue.filter(i => i.jobId && !seen.has(i.jobId) && i.state !== 'uploading').forEach(it => { queue.splice(queue.indexOf(it), 1); leave(it.row); });
    const DAY = 24 * 3600 * 1000;
    fresh = fresh.filter(r => r.status !== 'done' || Date.now() - new Date(r.updated_at) < DAY);   // eski tayyor ishlar ro'yxatni to'ldirmasin
    if (fresh.length) {                                                            // boshqa tab/oldingi sessiyadagi ishlar
      const th = await J.thumbs(fresh.map(r => r.image_path));
      fresh.forEach(r => {
        const it = { jobId: r.id, name: r.filename || "Noma'lum", state: r.status, msg: r.message || '', checkId: r.check_id, path: r.image_path, url: th[r.image_path] || '' };
        queue.push(it); build(it); render(it);
      });
    }
    relayout();
  }
  function applyRow(r) {
    const it = queue.find(i => i.jobId === r.id); if (!it) return false;
    if (it.state === 'uploading' && r.status === 'uploading') return true;
    if (!it.editing && r.filename !== it.name) it.name = r.filename;
    it.state = r.status; it.msg = r.message || ''; it.checkId = r.check_id; it.path = r.image_path || it.path; render(it); return true;
  }
  function onChange(p) {
    if (p.eventType === 'DELETE') { const it = queue.find(i => i.jobId === p.old.id); if (it && it.state !== 'uploading') { queue.splice(queue.indexOf(it), 1); leave(it.row); relayout(); } return; }
    if (!applyRow(p.new)) scheduleDB();
  }
  let dbTimer;
  const scheduleDB = () => { clearTimeout(dbTimer); dbTimer = setTimeout(fromDB, 300); };
  Q.supa.ready.then(() => {
    fromDB();
    Q.supa.client().channel('input-jobs').on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, onChange).subscribe();
    setInterval(() => { if (!document.hidden) fromDB(); }, 12000);                   // Realtime uzilsa ham yangilanib turadi
  }).catch(() => {});

  // ---- fayl qabul qilish ----
  $('imageInput').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
  const dz = $('dropZone');
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, () => { if (!dragIt) dz.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove('dragover')));
  dz.addEventListener('drop', e => { if (!dragIt) addFiles([...((e.dataTransfer && e.dataTransfer.files) || [])]); });
  document.addEventListener('paste', e => {
    const fs = [...((e.clipboardData && e.clipboardData.items) || [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile());
    if (fs.length) { e.preventDefault(); addFiles(fs); }
  });
  // Faqat rasmlar yuklanayotgan paytda ogohlantiradi; yuklab bo'lingach brauzerni yopish mumkin — server davom etadi
  window.addEventListener('beforeunload', e => { if (queue.some(i => i.state === 'uploading' && i.raw)) { e.preventDefault(); e.returnValue = ''; } });
  Q.addFiles = addFiles;
})(window.QW);
