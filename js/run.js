// Start/Stop va Groq holati — hammasi bazadan (user_state, app_state). Barcha sahifa/tab/qurilma bir xil ko'radi.
// Groq to'xtasa: butun sahifa qizil bo'ladi; kalit tuzalgach (env yangilanib redeploy bo'lgach) o'zi davom etadi.
(function (Q) {
  const subs = [];
  const S = Q.run = {
    ready: false, running: false, halt: null, haltMsg: '',
    on(fn) { subs.push(fn); if (S.ready) fn(S); },
    async start() { if (S.busy) return; S.busy = true; try { await save('running'); S.running = true; emit(); kick(true); } finally { S.busy = false; } },
    async stop() { if (S.busy) return; S.busy = true; try { await save('stopped'); S.running = false; emit(); } finally { S.busy = false; } }   // server joriy ishni tugatadi, keyingisini olmaydi
    , kick
  };
  const REASON = { groq_key: 'Groq API kaliti ishlamayapti', groq_quota: 'Groq limiti tugadi', groq_down: 'Groq API javob bermayapti' };

  async function save(run_state) {
    const c = Q.supa.client(), { data: { session } } = await c.auth.getSession();
    const { error } = await c.from('user_state').upsert({ user_id: session.user.id, run_state, updated_at: new Date().toISOString() });
    if (error) throw new Error("Holatni saqlab bo'lmadi: " + error.message);
  }
  let lastKick = 0;
  async function kick(force) {
    if (!force && Date.now() - lastKick < 4000) return; lastKick = Date.now();   // serverdagi worker'ni uyg'otadi (u band bo'lsa darrov qaytadi; Groq to'xtagan bo'lsa kalitni tekshiradi)
    try { const t = await Q.supa.token(); if (t) fetch('/api/worker', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(() => {}); } catch { /* */ }
  }
  let bar;
  function paint() {
    document.body.classList.toggle('halted', !!S.halt);
    if (!S.halt) { if (bar) bar.hidden = true; return; }
    if (!bar) { bar = document.createElement('div'); bar.className = 'halt-bar'; bar.setAttribute('role', 'alert'); document.body.prepend(bar); }
    bar.hidden = false; bar.textContent = '';
    const h = document.createElement('div'); h.className = 'halt-title'; h.textContent = (REASON[S.halt] || 'Groq API ishlamayapti') + ' — ilova to\'xtatildi';
    const m = document.createElement('div'); m.textContent = S.haltMsg || '';
    const f = document.createElement('div'); f.className = 'halt-fix';
    f.textContent = S.halt === 'groq_quota'
      ? "Yangi GROQ_API_KEY qo'ying (Vercel → Settings → Environment Variables → Redeploy) yoki limit tiklanishini kuting."
      : "Vercel → Settings → Environment Variables → GROQ_API_KEY ni yangilang va Redeploy qiling. Sahifani yangilash shart emas: kalit ishlab qolishi bilan ilova o'zi davom etadi.";
    bar.append(h, m, f);
  }
  function emit() { paint(); subs.forEach(f => { try { f(S); } catch (e) { console.error(e); } }); }

  async function read() {
    const c = Q.supa.client();
    const [u, a] = await Promise.all([
      c.from('user_state').select('run_state').maybeSingle(),
      c.from('app_state').select('halt_reason,halt_message').eq('id', 1).maybeSingle()
    ]);
    if (u.error || a.error) return;   // vaqtinchalik xato: oldingi holat qoladi
    const run = !!(u.data && u.data.run_state === 'running'), halt = (a.data && a.data.halt_reason) || null, msg = (a.data && a.data.halt_message) || '';
    if (S.ready && run === S.running && halt === S.halt && msg === S.haltMsg) return;
    S.running = run; S.halt = halt; S.haltMsg = msg; S.ready = true; emit();
  }

  Q.supa.ready.then(async () => {
    await read();
    Q.supa.client().channel('run-state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_state' }, read)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, read)
      .subscribe();
    let n = 0;
    setInterval(() => {                     // Realtime uzilsa ham yangilanib turadi; server o'lib qolsa uyg'otadi
      if (document.hidden && !S.halt) return;
      read(); n++;
      if (S.halt || (S.running && n % 3 === 0)) kick();
    }, 5000);
    Q.live.onWake(() => { read(); if (S.running) kick(); });
    if (S.running) kick();
  }).catch(() => {});                       // xatoni sahifaning o'zi ko'rsatadi
})(window.QW);
