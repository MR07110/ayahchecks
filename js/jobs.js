// Jarayon yozuvlari (jobs jadvali): /input yangilaydi, / sahifasi o'qiydi.
(function (Q) {
  const t = () => Q.supa.client().from('jobs');
  Q.jobs = {
    LABEL: { queued: 'Navbatda', preparing: 'Rasm tayyorlanmoqda', analyzing: 'Groq tahlil qilmoqda', verifying: "Mus'haf bilan solishtirilmoqda", saving: 'Saqlanmoqda', done: 'Tayyor', error: 'Xato', stale: 'Uzilgan' },
    ACTIVE: ['queued', 'preparing', 'analyzing', 'verifying', 'saving'],
    async create(filename) {
      const { data, error } = await t().insert({ filename, status: 'queued' }).select('id').single();
      if (error) throw new Error("Jarayonni yozib bo'lmadi: " + error.message);
      return data.id;
    },
    async update(id, patch) {
      const { error } = await t().update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) console.error('jobs.update', error.message);
    },
    async list(limit = 30) {
      const { data, error } = await t().select('id,created_at,updated_at,filename,status,message,check_id')
        .order('created_at', { ascending: false }).limit(limit);
      if (error) throw new Error("Jarayonni yuklab bo'lmadi: " + error.message);
      return data;
    }
  };
})(window.QW);
