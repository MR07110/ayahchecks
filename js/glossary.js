// Tasdiqlangan so'zma-so'z lug'at: kalit = arabcha so'zning harakatsiz shakli (Q.norm). Model boshqacha yozsa, shu qiymat qo'yiladi
// (rasmdagi asl yozuv so'zning "fix" maydonida saqlanadi). Yangi so'z qo'shish: 'kalit': 'tarjima'. Ulamo ko'rib chiqishi tavsiya etiladi.
(function (Q) {
  const G = {
    'بسم': 'nomi bilan', 'الله': 'Alloh', 'لله': 'Allohgadir', 'الرحمن': 'Rahmon', 'الرحيم': 'Rahim',
    'رب': 'Rabb', 'العالمين': 'olamlar', 'مالك': 'Molik', 'يوم': 'kun', 'الدين': 'jazo',
    'اياك': 'faqat Senga', 'واياك': 'va faqat Sendan', 'نعبد': 'ibodat qilamiz', 'نستعين': "yordam so'raymiz",
    'اهدنا': 'bizni hidoyat qil', 'الصراط': "yo'l", 'صراط': "yo'l", 'المستقيم': "to'g'ri",
    'الذين': 'kimlarki', 'انعمت': "ne'mat bergansan", 'عليهم': 'ularga', 'غير': 'emas',
    'المغضوب': "g'azabga uchraganlar", 'ولا': 'va emas', 'الضالين': 'adashganlar'
  };
  Q.glossary = {
    G,
    apply(data) {
      let n = 0;
      ((data && data.ayahs) || []).forEach(a => (a.words || []).forEach(w => {
        const v = G[Q.norm(w.arabic)];
        if (v && String(w.uzbek || '').trim() !== v) { w.fix = w.uzbek || ''; w.uzbek = v; n++; }
      }));
      return n;
    }
  };
})(typeof window !== "undefined" ? window.QW : globalThis.QW);
