-- AyahChecks: brauzer butunlay yopiq bo'lsa ham navbat davom etishi uchun "uyg'otkich".
-- Supabase SQL Editor'da BIR MARTA ishga tushiring. Oldin quyidagi 2 ta qiymatni almashtiring:
--   https://SIZNING-SAYT.vercel.app   -> deploy manzilingiz
--   CRON_SECRET_QIYMATI               -> Vercel env'dagi CRON_SECRET bilan AYNAN bir xil
-- (Database > Extensions da pg_cron va pg_net yoqilgan bo'lishi kerak.)
-- Worker o'zi ham zanjir bo'lib davom etadi; bu esa uzilib qolsa qayta tiriltiradi.
-- Bir vaqtda faqat bitta worker ishlaydi (qulf), shuning uchun tez-tez chaqirish xavfsiz.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('ayahchecks-worker') where exists (select 1 from cron.job where jobname = 'ayahchecks-worker');

select cron.schedule('ayahchecks-worker', '30 seconds', $$
  select net.http_post(
    url := 'https://SIZNING-SAYT.vercel.app/api/worker',
    headers := jsonb_build_object('Authorization', 'Bearer CRON_SECRET_QIYMATI'),
    timeout_milliseconds := 10000
  );
$$);

-- O'chirish uchun: select cron.unschedule('ayahchecks-worker');
