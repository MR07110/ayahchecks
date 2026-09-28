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
  const row = r => ({ id: r.id, date: r.created_at, surah: r.surah, surah_number: r.surah_number, ayah_count: r.ayah_count, score: r.score });
  const hist = {
    items: [],
    list() { return this.items; },
    async load() {
      const { data, error } = await db().select('id,created_at,surah,surah_number,ayah_count,score')
        .order('created_at', { ascending: false }).limit(C.HISTORY_MAX);
      if (error) throw new Error("Tarixni yuklab bo'lmadi: " + error.message);
      this.items = data.map(row); return this.items;
    },
    async get(id) {
      const { data, error } = await db().select('data').eq('id', id).single();
      if (error) throw new Error("Yozuvni ochib bo'lmadi: " + error.message);
      return data.data;
    },
    async add(d, score) {
      const { data, error } = await db().insert({
        surah: d.surah || '', surah_number: d.surah_number || null, ayah_count: (d.ayahs || []).length, score: score == null ? null : Math.round(score), data: d
      }).select('id,created_at,surah,surah_number,ayah_count,score').single();
      if (error) throw new Error("Tarixga saqlab bo'lmadi: " + error.message);
      this.items.unshift(row(data)); this.items.length = Math.min(this.items.length, C.HISTORY_MAX);
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
