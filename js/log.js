// Jonli log paneli: yozuvlar navbatga tushadi va sekundiga ~3-4 ta qator chiqadi.
(function (Q) {
  const queue = []; let timer = null, box = null;
  const p = n => String(n).padStart(2, '0');
  function flush() {
    if (!queue.length) { clearInterval(timer); timer = null; return; }
    box = box || document.getElementById('logBox'); if (!box) { queue.length = 0; return; }
    const { lvl, msg, t } = queue.shift();
    const line = document.createElement('div'); line.className = 'log-line ' + lvl;
    line.textContent = p(t.getHours()) + ':' + p(t.getMinutes()) + ':' + p(t.getSeconds()) + '  ' + msg;
    box.appendChild(line);
    while (box.childNodes.length > 200) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }
  function add(lvl, msg) {
    queue.push({ lvl, msg, t: new Date() });
    if (!timer) { flush(); timer = setInterval(flush, 280); }
  }
  Q.log = {
    info: m => add('info', m), ok: m => add('ok', m), warn: m => add('warn', m), err: m => add('err', m),
    clear() { queue.length = 0; const b = document.getElementById('logBox'); if (b) b.textContent = ''; }
  };
})(window.QW);
