(function (Q) {
  const MAX = 3000, buf = [], subs = new Set();
  let seq = 0, t0 = performance.now();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const clock = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3); };
  const safe = d => { try { return JSON.stringify(d); } catch { return String(d); } };

  function add(lv, cat, msg, data) {
    const e = { n: ++seq, t: Date.now(), dt: Math.round(performance.now() - t0), lv, cat, msg: String(msg), data };
    buf.push(e); if (buf.length > MAX) buf.shift();
    subs.forEach(f => f(e));
    return e;
  }
  const scope = cat => ({
    debug: (m, d) => add('debug', cat, m, d), info: (m, d) => add('info', cat, m, d),
    ok: (m, d) => add('ok', cat, m, d), warn: (m, d) => add('warn', cat, m, d), err: (m, d) => add('err', cat, m, d)
  });
  const line = e => clock(e.t) + ' +' + (e.dt / 1000).toFixed(3) + 's ' + e.lv.toUpperCase().padEnd(5) + ' [' + e.cat + '] ' + e.msg + (e.data !== undefined ? ' ' + safe(e.data) : '');
  Q.log = {
    add, scope, on: f => subs.add(f), all: () => buf.slice(), line, clock,
    mark() { t0 = performance.now(); },
    clear() { buf.length = 0; subs.forEach(f => f(null)); },
    text: () => buf.map(line).join('\n')
  };

  // ---- global xatolar ----
  const g = scope('sys');
  window.addEventListener('error', e => g.err(e.message || 'Xatolik', { at: (e.filename || '').split('/').pop() + ':' + e.lineno }));
  window.addEventListener('unhandledrejection', e => g.err('Unhandled promise: ' + ((e.reason && e.reason.message) || e.reason)));
  window.addEventListener('online', () => g.ok('Tarmoq qaytdi'));
  window.addEventListener('offline', () => g.warn('Tarmoq uzildi'));
  g.info('AyahChecks ishga tushdi', { online: navigator.onLine, ua: navigator.userAgent.slice(0, 80) });

  // ---- panel ----
  const sp = (c, t) => { const s = document.createElement('span'); s.className = c; s.textContent = t; return s; };
  Q.logPanel = function (root) {
    root.innerHTML =
      '<div class="lg"><div class="lg-h"><span class="lg-dot"></span><b>Jonli loglar</b>' +
      '<span class="lg-rate">0.0/s</span><span class="lg-cnt">0</span><span class="lg-sp"></span>' +
      '<button type="button" data-a="scroll" class="on">Avto-skroll</button><button type="button" data-a="clear">Tozalash</button>' +
      '<button type="button" data-a="copy">Nusxa</button><button type="button" data-a="dl">Yuklash</button><button type="button" data-a="fold">▾</button></div>' +
      '<div class="lg-f"><button type="button" data-lv="debug">DEBUG</button><button type="button" data-lv="info" class="on">INFO</button>' +
      '<button type="button" data-lv="ok" class="on">OK</button><button type="button" data-lv="warn" class="on">WARN</button><button type="button" data-lv="err" class="on">ERR</button>' +
      '<input class="lg-q" placeholder="Qidirish..." autocomplete="off"></div><div class="lg-b off-debug"></div></div>';
    const $ = s => root.querySelector(s), body = $('.lg-b'), q = $('.lg-q'), dot = $('.lg-dot'), rate = $('.lg-rate'), cnt = $('.lg-cnt');
    const scrollBtn = $('[data-a=scroll]');
    let auto = true, queue = [], raf = 0, stamps = [], total = 0, term = '';

    const setAuto = v => { auto = v; scrollBtn.classList.toggle('on', v); };
    const hide = (el) => { el.classList.toggle('hid', !!term && el.dataset.s.indexOf(term) < 0); };

    function row(e) {
      const d = document.createElement('div'); d.className = 'lg-r lv-' + e.lv; d.dataset.s = (e.cat + ' ' + e.msg + (e.data !== undefined ? ' ' + safe(e.data) : '')).toLowerCase();
      d.append(sp('t', Q.log.clock(e.t)), sp('dt', '+' + (e.dt / 1000).toFixed(3) + 's'), sp('lv', e.lv.toUpperCase()), sp('c', e.cat), sp('m', e.msg));
      if (e.data !== undefined) {
        let compact = safe(e.data), pretty; if (compact.length > 160) compact = compact.slice(0, 160) + '…';
        const ds = sp('d', compact); d.append(ds);
        d.addEventListener('click', () => {
          if (pretty === undefined) { try { pretty = JSON.stringify(e.data, null, 2); } catch { pretty = String(e.data); } }
          ds.textContent = d.classList.toggle('open') ? pretty : compact;
        });
      }
      hide(d); return d;
    }
    function flush() {
      raf = 0; const items = queue; queue = [];
      if (!items.length) return;
      const fr = document.createDocumentFragment(); items.forEach(e => fr.appendChild(row(e))); body.appendChild(fr);
      while (body.childElementCount > MAX) body.firstChild.remove();
      if (auto) body.scrollTop = body.scrollHeight;
    }
    Q.log.on(e => {
      if (!e) { body.textContent = ''; queue = []; total = 0; cnt.textContent = '0'; return; }
      total++; stamps.push(performance.now()); cnt.textContent = total > MAX ? MAX + '+' : String(total);
      queue.push(e); if (!raf) raf = requestAnimationFrame(flush);
    });
    Q.log.all().forEach(e => { total++; queue.push(e); }); cnt.textContent = String(total); flush();

    setInterval(() => {
      const now = performance.now(); stamps = stamps.filter(x => now - x <= 1000);
      rate.textContent = stamps.length.toFixed(1) + '/s'; dot.classList.toggle('live', stamps.length > 0);
    }, 250);

    body.addEventListener('scroll', () => { setAuto(body.scrollHeight - body.scrollTop - body.clientHeight < 24); });
    root.querySelectorAll('.lg-f [data-lv]').forEach(b => b.addEventListener('click', () => {
      b.classList.toggle('on'); body.classList.toggle('off-' + b.dataset.lv, !b.classList.contains('on'));
    }));
    q.addEventListener('input', () => { term = q.value.trim().toLowerCase(); body.querySelectorAll('.lg-r').forEach(hide); });
    root.querySelector('.lg-h').addEventListener('click', async e => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === 'scroll') { setAuto(!auto); if (auto) body.scrollTop = body.scrollHeight; }
      else if (a === 'clear') Q.log.clear();
      else if (a === 'copy') { try { await navigator.clipboard.writeText(Q.log.text()); e.target.textContent = 'Nusxalandi'; } catch { e.target.textContent = 'Xato'; } setTimeout(() => { e.target.textContent = 'Nusxa'; }, 1200); }
      else if (a === 'dl') {
        const d = new Date(), name = 'ayahchecks-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.log';
        const url = URL.createObjectURL(new Blob([Q.log.text()], { type: 'text/plain' })), l = document.createElement('a');
        l.href = url; l.download = name; l.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (a === 'fold') { const f = root.querySelector('.lg').classList.toggle('fold'); e.target.textContent = f ? '▸' : '▾'; }
    });
  };
})(window.QW);
