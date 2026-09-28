# AyahChecks (Vercel + Supabase)

Frontend statik (`index.html`, `css/`, `js/`), backend esa Vercel funksiyalari (`api/`). Groq kaliti brauzerga chiqmaydi.

## Sahifalar
- `/` — faqat ko'rish: hozir nima bo'layotgani jonli (Supabase Realtime + 5 s da yangilanish)
- `/input` — rasmlarni kiritish, navbat bilan tahlil
- `/output` — tayyor natijalar, nusxalash, JSON yuklab olish

## Fayllar
- `api/analyze.js` — Supabase tokenini tekshiradi, kunlik limit qo'yadi, Groq'ni chaqiradi
- `api/config.js` — brauzerga Supabase URL va anon kalitni beradi
- `api/_prompt.js` — Groq uchun ko'rsatma
- `js/jobs.js`, `js/monitor.js`, `js/input.js`, `js/output.js` — uch sahifaning mantig'i
- `js/supa.js` — anonim kirish; `js/storage.js` — tarix (Supabase `checks` jadvali)
- `supabase/schema.sql` — jadvallar va RLS

## Env (Vercel > Settings > Environment Variables)
`GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (ixtiyoriy: `DAILY_LIMIT`, standart 40)

## Ishga tushirish
1. Supabase: Authentication > Sign In / Providers > Anonymous sign-ins ni yoqing
2. SQL Editor'da `supabase/schema.sql` ni ishga tushiring
3. Vercel'ga deploy qiling (Framework: Other), env'lardan keyin Redeploy
