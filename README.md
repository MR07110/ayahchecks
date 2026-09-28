# AyahChecks (Vercel + Supabase)

Rasmlar Supabase Storage'ga yuklanadi, tahlilni **server** (`api/worker.js`) qiladi. Boshlash bosilgach brauzerni yopsangiz ham navbat davom etadi.

## Sahifalar
- `/` — faqat ko'rish: jonli jarayon (Realtime + 5 s da yangilanish)
- `/input` — rasm kiritish, tartiblash, nomini o'zgartirish, **Boshlash / To'xtatish**
- `/output` — tayyor natijalar, JSON, ZIP

## Qanday ishlaydi
- **Boshlash / To'xtatish** holati bazada (`user_state`) — barcha tab va qurilmada bir xil. To'xtatishda joriy ish oxirigacha bajariladi, keyingisi olinmaydi.
- **Sur'at**: bitta so'rov → tugagach **20 s pauza** → keyingisi (`PAUSE_SECONDS`, standart 20). Jami ~1.5–2 ta rasm/daqiqa (Groq javob tezligiga bog'liq).
- **Doimiy ishlash**: worker o'zi zanjir bo'lib davom etadi (har chaqiruv ~52 s); uzilsa `supabase/cron.sql` (pg_cron, har 30 s) va brauzer qayta uyg'otadi. Bir vaqtda bitta worker (`app_state.lease_until`).
- **Groq ishlamasa** (401/403 kalit, kunlik limit, 5 marta ketma-ket xato): navbat to'xtaydi, butun ilova **qip-qizil** bo'ladi, ish yo'qolmaydi (navbatga qaytadi). GROQ_API_KEY ni yangilab Redeploy qilsangiz — server kalitni o'zi tekshirib (`/models`, token sarflamaydi) **sahifani yangilamasdan** davom etadi.
- Uzilib qolgan (3 daqiqa yangilanmagan) ish avtomatik navbatga qaytadi; 3 marta uzilsa "Xato" bo'ladi (↻ tugmasi bilan qayta urinish).

## Env (Vercel > Settings > Environment Variables)
`GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (endi **majburiy**), `CRON_SECRET` (pg_cron uchun; o'zingiz o'ylab toping)
Ixtiyoriy: `DAILY_LIMIT` (1000), `PAUSE_SECONDS` (20)

## Ishga tushirish
1. Supabase: Authentication > Sign In / Providers > Anonymous sign-ins ni yoqing
2. SQL Editor: `supabase/schema.sql` ni ishga tushiring (qayta ishga tushirish xavfsiz; yangi qismlar 4-bo'limda)
3. Vercel'ga deploy (Framework: Other), env'lardan keyin Redeploy
4. `supabase/cron.sql` da 2 ta qiymatni (sayt manzili, CRON_SECRET) almashtirib ishga tushiring (pg_cron + pg_net yoqilgan bo'lsin)

## Eslatma
- Sessiya anonim: brauzer ma'lumotlarini (cookie/localStorage) tozalasangiz, oldingi navbat va natijalarni ko'ra olmaysiz.
- Vercel Hobby'da `maxDuration` 60 s yetadi; `api/analyze.js` olib tashlangan (Groq faqat serverdan, worker orqali chaqiriladi).
