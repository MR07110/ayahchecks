// Qurilmalarni bog'lash: anonim hisobni email+parolga aylantiradi (ma'lumot saqlanadi) yoki boshqa qurilmada shu hisobga kiradi.
(function (Q) {
  const el = (t, c, x, p) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; if (p) p.appendChild(e); return e; };
  const btn = el('button', 'acc-btn', 'Hisob', document.body); btn.type = 'button';
  const bg = el('div', 'acc-bg', null, document.body), box = el('div', 'acc-box', null, bg);
  bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('show'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') bg.classList.remove('show'); });
  let user = null;

  function draw() {
    box.textContent = '';
    const anon = !user || user.is_anonymous, c = Q.supa.client();
    el('h2', '', anon ? "Qurilmalarni bog'lash" : 'Hisob', box);
    const msg = el('div', 'acc-msg', '', box), say = (t, bad) => { msg.textContent = t; msg.className = 'acc-msg' + (bad ? ' bad' : ''); };
    if (!anon) {
      el('p', '', user.email || '', box);
      el('p', 'acc-hint', "Shu email va parol bilan istalgan qurilmada kirsangiz, bir xil navbat va natijalarni ko'rasiz.", box);
      const out = el('button', 'zip-btn', 'Chiqish', box); out.type = 'button';
      out.addEventListener('click', async () => {
        out.disabled = true;
        try { await c.auth.signOut({ scope: 'local' }); } catch (e) { /* xato bo'lsa ham qo'lda tozalaymiz */ }
        // signOut tarmoq xatosi bilan yiqilsa ham sessiya brauzerda qolib ketmasin
        try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k) || k.indexOf('supabase.auth') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) { /* */ }
        try { Object.keys(sessionStorage).filter(k => /^sb-/.test(k)).forEach(k => sessionStorage.removeItem(k)); } catch (e) { /* */ }
        location.reload();
      });
      return;
    }
    el('p', 'acc-hint', "Hozir bu brauzer alohida anonim hisobda, shuning uchun boshqa brauzer yoki qurilma natijalarni ko'rmaydi. Email va parol bilan bog'lang.", box);
    const em = el('input', 'acc-in', null, box); em.type = 'email'; em.placeholder = 'Email'; em.autocomplete = 'email';
    const pw = el('input', 'acc-in', null, box); pw.type = 'password'; pw.placeholder = "Parol (kamida 6 belgi)"; pw.autocomplete = 'current-password';
    const link = el('button', 'zip-btn wide', "Shu ma'lumotni hisobga bog'lash (yangi hisob)", box); link.type = 'button';
    const sign = el('button', 'acc-alt wide', "Mavjud hisobga kirish (bu brauzerdagi anonim ma'lumot o'chadi)", box); sign.type = 'button';
    const run = async (fn, ok) => {
      if (!em.value.trim() || pw.value.length < 6) return say("Email va kamida 6 belgili parol kiriting.", true);
      link.disabled = sign.disabled = true; say('Kutilmoqda...');
      try { const { error } = await fn(); if (error) throw error; say(ok); setTimeout(() => location.reload(), 1500); }
      catch (e) { say(e.message || 'Xato', true); link.disabled = sign.disabled = false; }
    };
    link.addEventListener('click', () => run(() => c.auth.updateUser({ email: em.value.trim(), password: pw.value }), "Bog'landi. Supabase'da email tasdiqlash yoqilgan bo'lsa, pochtangizni tekshiring."));
    sign.addEventListener('click', () => { if (confirm("Bu brauzerdagi anonim navbat va natijalar ko'rinmay qoladi. Davom etamizmi?")) run(() => c.auth.signInWithPassword({ email: em.value.trim(), password: pw.value }), 'Kirildi.'); });
  }
  btn.addEventListener('click', () => { draw(); bg.classList.add('show'); });
  Q.supa.ready.then(s => { user = s.user; btn.textContent = user.is_anonymous ? 'Hisob' : (user.email || 'Hisob'); }).catch(() => {});
})(window.QW);
