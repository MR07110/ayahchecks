// Sayt ichida rasmga olish. Telefon/planshet: orqa kamera oynasi sahifada. Kompyuter: oyna yo'q, bir marta ruxsat so'raladi, keyin har bosishda rasm olinadi.
(function (Q) {
  const ui = Q.ui, $ = ui.$, C = Q.CFG;
  const touch = matchMedia('(pointer:coarse)').matches && navigator.maxTouchPoints > 0;
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.autoplay = true;
  let stream = null, starting = null, n = 0;
  // Zoom: standart 1x (ba'zi telefonlarda kamera 0.5x keng burchakli linza bilan ochiladi). Pinch bilan yaqinlashtirish/uzoqlashtirish.
  let track = null, hw = false, zoom = 1, zmin = 1, zmax = 4, zlab = null;
  function setZoom(z) {
    z = Math.min(zmax, Math.max(zmin, z)); zoom = z;
    if (hw && track) track.applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {});
    else video.style.transform = z > 1 ? 'scale(' + z + ')' : '';   // raqamli zoom (brauzer kamera zoom'ini bermasa)
    if (zlab) zlab.textContent = (Math.round(z * 10) / 10) + '×';
  }
  let imgCap = null;
  function initZoom() {
    track = stream && stream.getVideoTracks()[0];
    let caps = {}; try { caps = (track && track.getCapabilities && track.getCapabilities()) || {}; } catch (e) { /* */ }
    // Doimiy avtofokus (xira kadr = model o'qiy olmaydi) va to'liq sifatli suratga olish (video kadr emas)
    try { if (track && caps.focusMode && caps.focusMode.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}); } catch (e) { /* */ }
    try { imgCap = (track && window.ImageCapture) ? new ImageCapture(track) : null; } catch (e) { imgCap = null; }
    hw = !!(caps.zoom && caps.zoom.max > caps.zoom.min);
    if (hw) { zmin = caps.zoom.min; zmax = Math.min(caps.zoom.max, 8); } else { zmin = 1; zmax = 4; }
    video.style.transform = '';
    setZoom(Math.min(Math.max(1, zmin), zmax));   // default 1x (0.5x emas)
  }

  async function open() {
    if (stream && stream.active) return stream;
    if (starting) return starting;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Bu brauzerda kamera ishlamaydi (HTTPS kerak)");
    starting = (async () => {
      const tries = touch
        ? [{ video: { facingMode: { ideal: 'environment' }, width: { ideal: 4032 }, height: { ideal: 3024 } } }, { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } }, { video: true }]
        : [{ video: { width: { ideal: 1920 }, height: { ideal: 1080 } } }, { video: true }];
      let err;
      for (const c of tries) { try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) { err = e; if (e.name === 'NotAllowedError') break; } }
      starting = null;
      if (!stream) throw new Error(err && err.name === 'NotAllowedError' ? "Kameraga ruxsat berilmagan. Brauzer sozlamasidan ruxsat bering" : "Kamera topilmadi yoki band");
      video.srcObject = stream; await video.play().catch(() => {});
      initZoom();
      return stream;
    })();
    return starting;
  }
  function close() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; track = null; video.srcObject = null; }

  // Android Chrome: takePhoto() to'liq sensor sifatida (avtofokus bilan) oladi; video kadr esa siqilgan va ko'pincha xira.
  // Raqamli zoom (brauzer zoom bermasa) da takePhoto ishlatilmaydi: u zoom'ni hisobga olmaydi.
  async function still() {
    if (!imgCap || (!hw && zoom > 1)) return null;
    try {
      const b = await Promise.race([imgCap.takePhoto(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
      const bmp = await createImageBitmap(b, { imageOrientation: 'from-image' });
      const k = Math.min(1, C.MAX_IMG / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    } catch (e) { return null; }
  }
  async function shot() {
    await open();
    if (!video.videoWidth) await new Promise(r => video.addEventListener('loadeddata', r, { once: true }));
    let blob = await still();
    if (!blob) {
      const dz = !hw && zoom > 1 ? zoom : 1, vw = video.videoWidth, vh = video.videoHeight, sw = vw / dz, sh = vh / dz;
      const k = Math.min(1, C.MAX_IMG / Math.max(sw, sh));
      const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      c.getContext('2d').drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    }
    const d = new Date(), p = x => String(x).padStart(2, '0');
    const name = 'kamera-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + (++n) + '.jpg';
    Q.addFiles([new File([blob], name, { type: 'image/jpeg' })]);
  }

  if (touch) {
    const box = $('cam'); box.hidden = false;
    const view = ui.el('div', 'cam-view', null, box); view.appendChild(video);
    const msg = ui.el('div', 'cam-msg', null, view), flash = ui.el('div', 'cam-flash', null, view);
    zlab = ui.el('div', 'cam-zoom', '1×', view);
    const pts = new Map(); let d0 = 0, z0 = 1;
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    view.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { d0 = dist(); z0 = zoom; } });
    view.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && d0 > 0) setZoom(z0 * dist() / d0);
    });
    const up = e => { pts.delete(e.pointerId); d0 = 0; };
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up); view.addEventListener('pointerleave', up);
    const bar = ui.el('div', 'cam-bar', null, box);
    const inp = ui.el('button', 'cam-side', null, bar); inp.type = 'button'; inp.append('Input');
    const sh = ui.el('button', 'cam-shutter', null, bar); sh.type = 'button'; sh.setAttribute('aria-label', 'Rasmga olish'); ui.el('span', '', null, sh);
    const out = ui.el('a', 'cam-side', 'Output', bar); out.href = '/output';
    const mdl = ui.el('div', 'cam-model', null, box), ms = $('modelSelect').parentNode;
    ui.el('span', '', 'Rasm modeli', mdl); mdl.appendChild($('modelSelect')); ms.hidden = true;
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
