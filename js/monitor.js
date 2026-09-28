// "/" sahifa: faqat ko'rish. Hech narsani o'zgartirmaydi.
(function (Q) {
  const ui = Q.ui, $ = ui.$, J = Q.jobs, STALE_MS = 3 * 60 * 1000;
  const eff = j => (J.ACTIVE.includes(j.status) && Date.now() - new Date(j.updated_at) > STALE_MS) ? 'stale' : j.status;
  const badge = s => s === 'done' ? 'ok' : s === 'error' || s === 'stale' ? 'err' : s === 'queued' ? 'wait' : 'busy';
  const p = n => String(n).padStart(2, '0');
  const fmt = iso => { const d = new Date(iso); return p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };

  function render(jobs) {
    const st = jobs.map(eff), active = jobs.filter((j, i) => J.ACTIVE.includes(st[i]));
    const run = active.find(j => j.status !== 'queued'), waiting = active.filter(j => j.status === 'queued').length;
    $('liveDot').className = 'live-dot' + (active.length ? ' on' : '');
    if (active.length) {
      const cur = run || active[active.length - 1];
      $('liveTitle').textContent = J.LABEL[cur.status] + ': ' + cur.filename;
      $('liveSub').textContent = 'Faol: ' + active.length + ' ta · navbatda: ' + waiting + ' ta';
    } else {
      $('liveTitle').textContent = "Hozir hech narsa bajarilmayapti";
      const last = jobs[0];
      $('liveSub').textContent = last ? "Oxirgi: " + last.filename + " — " + J.LABEL[st[0]] + " (" + fmt(last.updated_at) + ")" : "Hali rasm kiritilmagan. \"Kirish\" sahifasidan boshlang.";
    }
    const box = $('jobList'); box.textContent = '';
    jobs.forEach((j, i) => {
      const row = ui.el('div', 'job', null, box), info = ui.el('div', '', null, row);
      ui.el('div', 'job-name', j.filename || "Noma'lum", info);
      ui.el('div', 'job-meta', fmt(j.created_at) + (j.message ? ' · ' + j.message : ''), info);
      const side = ui.el('div', '', null, row);
      ui.el('span', 'badge ' + badge(st[i]), J.LABEL[st[i]] || st[i], side);
      if (j.status === 'done' && j.check_id) {
        side.appendChild(document.createTextNode(' '));
        const a = ui.el('a', '', 'Ochish', side); a.href = '/output?id=' + j.check_id;
      }
    });
  }

  let timer;
  async function load() {
    clearTimeout(timer);
    try { render(await J.list(30)); ui.hideError(); }
    catch (e) { $('liveDot').className = 'live-dot off'; ui.error(e.message); }
    timer = setTimeout(load, 5000);   // Realtime uzilsa ham yangilanib turadi
  }

  Q.supa.ready.then(() => {
    Q.supa.client().channel('jobs-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, load)
      .subscribe();
    return load();
  }).catch(e => { $('liveDot').className = 'live-dot off'; $('liveTitle').textContent = 'Ulanib bo\'lmadi'; ui.error(e.message); });
})(window.QW);
