// Fayl nomi: 002-Baqara_oyat-255_soz-001-050  (sura raqami-nomi, oyat, so'z)
(function (Q) {
  const SURAH = ['Fotiha','Baqara','Ali-Imron','Niso','Moida','Anom','Aroaf','Anfol','Tavba','Yunus','Hud','Yusuf','Rad','Ibrohim','Hijr','Nahl','Isro','Kahf','Maryam','Toha','Anbiyo','Haj','Muminun','Nur','Furqon','Shuaro','Naml','Qasas','Ankabut','Rum','Luqmon','Sajda','Ahzob','Saba','Fotir','Yosin','Soffot','Sod','Zumar','Gofir','Fussilat','Shuro','Zuxruf','Duxon','Josiya','Ahqof','Muhammad','Fath','Hujurot','Qof','Zoriyot','Tur','Najm','Qamar','Rahmon','Voqea','Hadid','Mujodala','Hashr','Mumtahana','Saff','Juma','Munofiqun','Tagobun','Taloq','Tahrim','Mulk','Qalam','Haqqa','Maorij','Nuh','Jin','Muzzammil','Muddassir','Qiyoma','Inson','Mursalot','Naba','Noziot','Abasa','Takvir','Infitor','Mutoffifin','Inshiqoq','Buruj','Toriq','Aala','Goshiya','Fajr','Balad','Shams','Layl','Zuho','Sharh','Tin','Alaq','Qadr','Bayyina','Zilzol','Odiyot','Qoria','Takosur','Asr','Humaza','Fil','Quraysh','Maun','Kavsar','Kofirun','Nasr','Masad','Ixlos','Falaq','Nos'];
  const p3 = n => String(n).padStart(3, '0');

  // Ma'lumotdan sura/oyat/so'z ma'lumotini oladi (Mus'haf bilan tasdiqlangan sura raqami birinchi o'rinda)
  function info(d) {
    const ay = (d && d.ayahs) || [];
    const src = ay.find(a => a.src && a.src.s);
    let s = src ? Number(src.src.s) : Number(d && d.surah_number);
    if (!(s >= 1 && s <= 114)) s = 0;
    const nums = ay.map(a => Number(a.number)).filter(Number.isFinite);
    const from = nums.length ? Math.min(...nums) : 0, to = nums.length ? Math.max(...nums) : 0;
    const idx = [].concat(...ay.map(a => (a.words || []).map(w => Number(w.index)).filter(Number.isFinite)));
    const total = ay.reduce((n, a) => n + (a.words || []).length, 0);
    return { s, name: s ? SURAH[s - 1] : 'Nomalum', from, to, total, single: ay.length === 1, wmin: idx.length ? Math.min(...idx) : 0, wmax: idx.length ? Math.max(...idx) : 0 };
  }
  // .json siz nom
  function file(d) {
    const i = info(d);
    const oyat = i.from === i.to ? p3(i.from) : p3(i.from) + '-' + p3(i.to);
    const soz = i.single ? p3(i.wmin) + '-' + p3(i.wmax) : p3(i.total) + 'ta';
    return p3(i.s) + '-' + i.name + '_oyat-' + oyat + '_soz-' + soz;
  }
  Q.name = { SURAH, info, file };
})(typeof window !== "undefined" ? window.QW : globalThis.QW);
