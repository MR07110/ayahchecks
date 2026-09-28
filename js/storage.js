(function (Q) {
  const C = Q.CFG;
  // Sozlamalar (model, checkbox) — faqat shu brauzerda
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
  };

  // Tarix — Supabase `checks` jadvalida (RLS: har kim faqat o'zinikini ko'radi).
  // Ro'yxat xotirada (items) turadi, shuning uchun list() sinxron.
  const db = () => Q.supa.client().from('checks');
  const row = r => ({ id: r.id, date: r.created_at, surah: r.surah, surah_number: r.surah_number, ayah_count: r.ayah_count, score: r.score, file_name: r.file_name || null });
  const COLS = 'id,created_at,surah,surah_number,ayah_count,score,file_name', OLD_COLS = 'id,created_at,surah,surah_number,ayah_count,score';
  const hist = {
    items: [],
    list() { return this.items; },
    async load() {
      const q = cols => db().select(cols).order('created_at', { ascending: false }).limit(C.HISTORY_MAX);
      let { data, error } = await q(COLS);
      if (error && /file_name/.test(error.message)) ({ data, error } = await q(OLD_COLS));   // schema.sql hali yangilanmagan bo'lsa
      if (error) throw new Error("Tarixni yuklab bo'lmadi: " + error.message);
      this.items = data.map(row); return this.items;
    },
    // Hamma natija ma'lumoti bilan (ZIP uchun)
    async all() {
      const { data, error } = await db().select('id,created_at,data').order('created_at', { ascending: true }).limit(1000);
      if (error) throw new Error("Natijalarni yuklab bo'lmadi: " + error.message);
      return data;
    },
    async get(id) {
      const { data, error } = await db().select('data').eq('id', id).single();
      if (error) throw new Error("Yozuvni ochib bo'lmadi: " + error.message);
      return data.data;
    },
    async add(d, score) {
      const rec = { surah: d.surah || '', surah_number: d.surah_number || null, ayah_count: (d.ayahs || []).length, score: score == null ? null : Math.round(score), file_name: Q.name.file(d), data: d };
      const ins = (r, cols) => db().insert(r).select(cols).single();
      let { data, error } = await ins(rec, COLS);
      if (error && /file_name/.test(error.message)) { delete rec.file_name; ({ data, error } = await ins(rec, OLD_COLS)); }   // schema.sql hali yangilanmagan bo'lsa
      if (error) throw new Error("Tarixga saqlab bo'lmadi: " + error.message);
      this.items.unshift(row(data)); this.items.length = Math.min(this.items.length, C.HISTORY_MAX);
      return data.id;
    },
    async remove(id) {
      const { error } = await db().delete().eq('id', id);
      if (error) throw new Error("O'chirib bo'lmadi: " + error.message);
      this.items = this.items.filter(x => x.id !== id);
    },
    async clear() {
      const { error } = await db().delete().neq('id', '00000000-0000-0000-0000-000000000000'); // RLS faqat o'zingiznikini o'chiradi
      if (error) throw new Error("O'chirib bo'lmadi: " + error.message);
      this.items = [];
    }
  };
  Q.store = store; Q.hist = hist;
})(window.QW);
