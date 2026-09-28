// Rasmni serverga yuborishdan oldin tayyorlaydi (endi tahlilni server o'zi qiladi: api/worker.js)
(function (Q) {
  const C = Q.CFG;
  // Uzun tomonini MAX_IMG ga keltiradi; hajm MAX_SEND dan oshsa JPEG sifatini tushiradi
  function prepare(file, max = C.MAX_IMG) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = async () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, max / Math.max(img.width, img.height));
        if (k === 1 && file.size <= C.MAX_SEND) return resolve(file);
        const c = document.createElement('canvas'), x = c.getContext('2d');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);   // shaffof PNG qora bo'lib qolmasin
        x.drawImage(img, 0, 0, c.width, c.height);
        const enc = q => new Promise(r => c.toBlob(r, 'image/jpeg', q));
        let q = 0.9, b = await enc(q);
        while (b && b.size > C.MAX_SEND && q > 0.5) { q -= 0.1; b = await enc(q); }
        resolve(b || file);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  Q.api = { prepare };
})(window.QW);
