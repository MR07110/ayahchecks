// Supabase ulanishi: /api/config dan sozlama oladi va anonim sessiya ochadi.
(function (Q) {
  let client = null;
  const ready = (async () => {
    const r = await fetch('/api/config');
    const c = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(c.error || "Sozlamalarni olib bo'lmadi.");
    if (!window.supabase) throw new Error("supabase-js yuklanmadi (internetni tekshiring).");
    client = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data: { session } } = await client.auth.getSession();
    if (session) return session;
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw new Error("Anonim kirish ishlamadi: " + error.message + " (Supabase'da Anonymous sign-ins yoqilganmi?)");
    return data.session;
  })();
  ready.catch(() => {});   // xatoni main.js ko'rsatadi
  Q.supa = {
    ready,
    client: () => client,
    async token() { const { data: { session } } = await client.auth.getSession(); return session ? session.access_token : null; }
  };
})(window.QW);
