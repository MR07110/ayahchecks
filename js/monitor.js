// "/" sahifa: faqat ko'rish. Realtime: o'zgargan qator darrov yangilanadi, ro'yxat qayta chizilmaydi (miltillamaydi).
(function (Q) {
  const ui = Q.ui, $ = ui.$, J = Q.jobs, STALE_MS = 3 * 60 * 1000;
  const eff = j => (J.RUNNING.includes(j.status) && Date.now() - new Date(j.updated_at) > STALE_MS) ? 'stale' : j.status;
  const badge = s => s === 'done' ? 'ok' : s === 'error' || s === 'stale' ? 'err' : s === 'queued' ? 'wait' : 'busy';
  const p = n => String(n).padStart(2, '0');
  const fmt = iso => { const d = new Date(iso); return p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
  let jobs = [], live = false; const rows = new Map();

  function leave(row) { row.style.maxHeight = row.offsetHeight + 'px'; row.style.overflow = 'hidden'; void row.offsetHeight; row.classList.add('leaving'); setTimeout(() => row.remove(), 280); }
  function mk(j) {
    const r = { j }, row = r.row = ui.el('div', 'job', null, null), info = ui.el('div', '', null, row);
    r.name = ui.el('div', 'job-name', null, info); r.meta = ui.el('div', 'job-meta', null, info);
    const side = ui.el('div', 'job-side', null, row);
    r.badge = ui.el('span', 'badge', null, side); r.link = ui.el('a', '', 'Ochish', side);
    r.x = ui.icon(ui.el('button', 'icon-btn danger', null, side), 'x'); r.x.title = "Ro'yxatdan o'chirish (natija saqlanib qoladi)";
    r.x.addEventListener('click', async () => { try { await J.remove(r.j.id, r.j.image_path); jobs = jobs.filter(k => k.id !== r.j.id); render(); } catch (e) { ui.error(e.message); } });
    return r;
  }
  function paint(r, j, s) {
    r.j = j;
    if (r.name.textContent !== (j.filename || "Noma'lum")) r.name.textContent = j.filename || "Noma'lum";
    const m = fmt(j.created_at) + (j.message ? ' · ' + j.message : ''); if (r.meta.textContent !== m) r.meta.textContent = m;
    const t = J.LABEL[s] || s; if (r.badge.textContent !== t) r.badge.textContent = t;
    r.badge.className = 'badge ' + badge(s);
    r.link.hidden = !(j.status === 'done' && j.check_id); if (!r.link.hidden) r.link.href = '/output?id=' + j.check_id;
    r.x.hidden = J.RUNNING.includes(s);
  }
  function render() {
    const st = jobs.map(eff), active = jobs.filter((j, i) => J.ACTIVE.includes(st[i]));
    const run = active.find(j => j.status !== 'queued'), waiting = active.filter(j => j.status === 'queued').length;
    const idle = active.length && !run && !Q.run.running;
    $('liveDot').className = 'live-dot' + (active.length && !idle ? ' on' : '');
    if (idle) {
      $('liveTitle').textContent = "To'xtatilgan · navbatda: " + waiting + ' ta';
      $('liveSub').textContent = "\"Kirish\" sahifasida \"Boshlash\" ni bosing. Boshlangach brauzerni yopsangiz ham server davom etadi.";
    } else if (active.length) {
      const cur = run || active[active.length - 1];
      $('liveTitle').textContent = J.LABEL[cur.status] + ': ' + cur.filename;
      const cnt = k => st.filter(s => s === k).length;
      $('liveSub').textContent = 'Faol: ' + active.length + ' · navbatda: ' + waiting + ' · tayyor: ' + cnt('done') + (cnt('error') ? ' · xato: ' + cnt('error') : '');
    } else {
      $('liveTitle').textContent = "Hozir hech narsa bajarilmayapti";
      const last = jobs[0];
      $('liveSub').textContent = last ? "Oxirgi: " + last.filename + " — " + J.LABEL[st[0]] + " (" + fmt(last.updated_at) + ")" : "Hali rasm kiritilmagan. \"Kirish\" sahifasidan boshlang.";
    }
    const box = $('jobList'), ids = new Set(jobs.map(j => j.id));
    rows.forEach((r, id) => { if (!ids.has(id)) { rows.delete(id); leave(r.row); } });
    jobs.forEach((j, i) => {
      let r = rows.get(j.id); if (!r) { r = mk(j); rows.set(j.id, r); }
      paint(r, j, st[i]);
      const cur = box.children[i]; if (cur !== r.row) box.insertBefore(r.row, cur || null);
    });
  }

  let timer;
  async function load() {
    clearTimeout(timer);
    try { jobs = await J.list(200); render(); ui.hideError(); }
    catch (e) { $('liveDot').className = 'live-dot off'; ui.error(e.message); }
    timer = setTimeout(load, 8000);   // Realtime uzilsa ham yangilanib turadi
  }
  function onChange(pl) {
    if (pl.eventType === 'DELETE') jobs = jobs.filter(j => j.id !== pl.old.id);
    else { const i = jobs.findIndex(j => j.id === pl.new.id); if (i >= 0) jobs[i] = { ...jobs[i], ...pl.new }; else { jobs.unshift(pl.new); jobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); } }
    render();
  }
  Q.run.on(() => { if (live) render(); });
  Q.supa.ready.then(() => {
    Q.supa.client().channel('jobs-live').on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, onChange).subscribe();
    live = true; return load();
  }).catch(e => { $('liveDot').className = 'live-dot off'; $('liveTitle').textContent = 'Ulanib bo\'lmadi'; ui.error(e.message); });
})(window.QW);
