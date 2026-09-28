// Sayt ichida rasmga olish. Telefon/planshet: orqa kamera oynasi sahifada. Kompyuter: oyna yo'q, bir marta ruxsat so'raladi, keyin har bosishda rasm olinadi.
(function (Q) {
  const ui = Q.ui, $ = ui.$, C = Q.CFG;
  const touch = matchMedia('(pointer:coarse)').matches && navigator.maxTouchPoints > 0;
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.autoplay = true;
  let stream = null, starting = null, n = 0;

  async function open() {
    if (stream && stream.active) return stream;
    if (starting) return starting;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Bu brauzerda kamera ishlamaydi (HTTPS kerak)");
    starting = (async () => {
      const tries = touch
        ? [{ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } }, { video: true }]
        : [{ video: { width: { ideal: 1920 }, height: { ideal: 1080 } } }, { video: true }];
      let err;
      for (const c of tries) { try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) { err = e; if (e.name === 'NotAllowedError') break; } }
      starting = null;
      if (!stream) throw new Error(err && err.name === 'NotAllowedError' ? "Kameraga ruxsat berilmagan. Brauzer sozlamasidan ruxsat bering" : "Kamera topilmadi yoki band");
      video.srcObject = stream; await video.play().catch(() => {});
      return stream;
    })();
    return starting;
  }
  function close() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; }

  async function shot() {
    await open();
    if (!video.videoWidth) await new Promise(r => video.addEventListener('loadeddata', r, { once: true }));
    const k = Math.min(1, C.MAX_IMG / Math.max(video.videoWidth, video.videoHeight));
    const c = document.createElement('canvas'); c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const d = new Date(), p = x => String(x).padStart(2, '0');
    const name = 'kamera-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + (++n) + '.jpg';
    Q.addFiles([new File([blob], name, { type: 'image/jpeg' })]);
  }

  if (touch) {
    const box = $('cam'); box.hidden = false;
    const view = ui.el('div', 'cam-view', null, box); view.appendChild(video);
    const msg = ui.el('div', 'cam-msg', null, view), flash = ui.el('div', 'cam-flash', null, view);
    const bar = ui.el('div', 'cam-bar', null, box);
    const inp = ui.el('button', 'cam-side', null, bar); inp.type = 'button'; inp.append('Input');
    const sh = ui.el('button', 'cam-shutter', null, bar); sh.type = 'button'; sh.setAttribute('aria-label', 'Rasmga olish'); ui.el('span', '', null, sh);
    const out = ui.el('a', 'cam-side', 'Output', bar); out.href = '/output';
    const mdl = ui.el('div', 'cam-model', null, box), ms = $('modelSelect').parentNode;
    ui.el('span', '', 'Model', mdl); mdl.appendChild($('modelSelect')); ms.hidden = true;
    inp.addEventListener('click', () => $('imageInput').click());
    const start = () => open().then(() => { msg.hidden = true; }).catch(e => { msg.hidden = false; msg.textContent = ''; ui.el('div', '', e.message, msg); const b = ui.el('button', 'zip-btn', 'Qayta urinish', msg); b.type = 'button'; b.addEventListener('click', start); });
    sh.addEventListener('click', async () => {
      sh.classList.remove('tap'); void sh.offsetWidth; sh.classList.add('tap'); flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
      if (navigator.vibrate) navigator.vibrate(12);
      try { await shot(); } catch (e) { ui.toast(e.message, 3500); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) close(); else start(); });
    window.addEventListener('pagehide', close);
    start();
  } else {
    const b = $('camDeskBtn'); b.hidden = false;
    b.addEventListener('click', async () => {
      try { b.disabled = true; await shot(); ui.toast('Rasm olindi', 1200); } catch (e) { ui.toast(e.message, 3500); } finally { b.disabled = false; }
    });
    window.addEventListener('pagehide', close);
  }
  video.className = 'cam-video'; video.addEventListener('playing', () => video.classList.add('on')); if (!touch) { video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none'; document.body.appendChild(video); }
})(window.QW);
