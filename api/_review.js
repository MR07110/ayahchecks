// Ikkinchi o'tish: model rasmni va birinchi o'tishda ko'chirilgan natijani qayta solishtiradi.
// U faqat KO'CHIRISH xatolarini (noto'g'ri o'qilgan harf, tushib qolgan/ortiqcha belgi) tuzatadi; kitob yozuvini o'zgartirmaydi.
// Javob qisqa: faqat tuzatishlar ro'yxati (tez va kam token).
exports.PROMPT = `Sen tekshiruvchisan. Senga rasm va undan ko'chirilgan natija (JSON) beriladi. Rasmdagi har bir katak uchun arabcha so'zni va uning tagidagi o'zbekcha tarjimani natijadagi bilan harfma-harf solishtir.

Faqat KO'CHIRISH xatolarini tuzat: noto'g'ri o'qilgan harf yoki harakat, tushib qolgan yoki ortiqcha harf, adashgan apostrof, "???" bo'lib qolgan, aslida rasmda o'qish mumkin bo'lgan joy.

QOIDALAR:
- Rasmda qanday yozilgan bo'lsa, faqat shunday bo'lsin. "Yaxshiroq", to'g'riroq yoki chiroyliroq variant yozma; kitobdagi imlo va uslubni o'zgartirma; kitobdagi xatoni ham tuzatma.
- "ai":true belgili kataklarning o'zbekchasiga tegma (u kitobdan emas), faqat arabchasini tekshir.
- Katak sonini, tartibini va raqamlarini o'zgartirma. Yangi katak qo'shma.
- Ishonching komil bo'lmasa, tegma.

FAQAT shu JSON formatda javob ber. Tuzatish kerak bo'lmasa {"fixes":[]}:
{"fixes":[{"ayah":1,"index":2,"arabic":"faqat o'zgargan bo'lsa","uzbek":"faqat o'zgargan bo'lsa"}]}
"ayah" - natijadagi oyat raqami, "index" - so'z raqami.

Ko'chirilgan natija:
`;

// Tuzatishlarni ehtiyotkorlik bilan qo'llaydi: katta o'zgarish (o'xshashlik < 0.6) rad etiladi.
exports.apply = function (parsed, fixes, Q) {
  let n = 0;
  const lc = s => String(s == null ? '' : s).toLowerCase();
  (Array.isArray(fixes) ? fixes : []).forEach(f => {
    const a = (parsed.ayahs || []).find(x => Number(x.number) === Number(f.ayah));
    const w = a && (a.words || []).find(x => Number(x.index) === Number(f.index));
    if (!w) return;
    if (typeof f.arabic === 'string' && f.arabic.trim() && f.arabic !== w.arabic) {
      const ok = /\?\?\?/.test(w.arabic) || Q.sim(Q.norm(w.arabic), Q.norm(f.arabic)) >= 0.6;
      if (ok) { w.arabicBefore = w.arabic; w.arabic = f.arabic.trim(); n++; }
    }
    if (typeof f.uzbek === 'string' && f.uzbek.trim() && f.uzbek !== w.uzbek && !w.ai) {
      const old = String(w.uzbek || '').trim();
      const ok = !old || /\?\?\?/.test(old) || Q.sim(lc(old), lc(f.uzbek)) >= 0.6;
      if (ok) { w.uzbekBefore = w.uzbek; w.uzbek = f.uzbek.trim(); n++; }
    }
  });
  return n;
};
