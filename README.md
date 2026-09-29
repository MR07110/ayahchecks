# AyahChecks
`index.html` ni brauzerda oching (server shart emas). Provayderni tanlang (Groq yoki Ollama Cloud), kalitni kiriting, rasmni tashlang.
Kalit brauzerning localStorage'ida saqlanadi (har provayder uchun alohida). Ikkala kalit ham kiritilsa, 429/5xx/timeout bo'lganda ikkinchisiga avtomatik o'tadi (`CFG.FALLBACK`).

- `js/validate.js` — ichki tekshiruv (indeks, bo'sh katak, ???, takror, so'z↔oyat mosligi)
- `js/verify.js` — natijani ochiq Mus'haf matni (alquran.cloud) bilan solishtiradi
- `js/api.js` — OpenAI-mos so'rov (Groq / Ollama Cloud): retry, timeout, JSON-fallback
- `js/config.js` — barcha sozlamalar (provayderlar, modellar, limit, chegara)
