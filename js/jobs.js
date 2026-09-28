// Jarayon yozuvlari (jobs jadvali). /input yozadi va yangilaydi, server (api/worker.js) bajaradi, / sahifasi o'qiydi.
(function (Q) {
  const t = () => Q.supa.client().from('jobs');
  const st = () => Q.supa.client().storage.from('images');
  const COLS = 'id,created_at,updated_at,filename,status,message,check_id,image_path,position,model';
  Q.jobs = {
    LABEL: { uploading: 'Yuklanmoqda', queued: 'Navbatda', preparing: 'Tayyorlanmoqda', analyzing: 'Groq tahlil qilmoqda', verifying: "Mus'haf bilan solishtirilmoqda", saving: 'Saqlanmoqda', done: 'Tayyor', error: 'Xato', stale: 'Uzilgan' },
    ACTIVE: ['uploading', 'queued', 'preparing', 'analyzing', 'verifying', 'saving'],
    RUNNING: ['preparing', 'analyzing', 'verifying', 'saving'],   // server hozir shuni bajaryapti — o'chirib/ko'chirib bo'lmaydi
    // Bir nechta yozuvni bitta so'rovda yaratadi (ID lar nomlar tartibida qaytadi)
    async createMany(names, model) {
      const { data, error } = await t().insert(names.map(filename => ({ filename, status: 'uploading', model }))).select('id');
      if (error) throw new Error("Jarayonni yozib bo'lmadi: " + error.message);
      return data.map(r => r.id);
    },
    // Rasmni Storage'ga yuklaydi va ishni "navbatda" qiladi (server shundan keyin ola oladi)
    async upload(id, blob) {
      const s = await Q.supa.client().auth.getSession(), uid = s.data.session.user.id;
      const path = uid + '/' + id + '.' + (blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg');
      const { error } = await st().upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
      if (error) throw new Error("Rasmni yuklab bo'lmadi: " + error.message);
      const u = await t().update({ image_path: path, status: 'queued', message: null, updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'uploading');
      if (u.error) throw new Error("Jarayonni yangilab bo'lmadi: " + u.error.message);
      return path;
    },
    async setOrder(ids) {                       // tartibni bazaga yozadi (server shu tartibda oladi)
      if (!ids.length) return;
      const { error } = await Q.supa.client().rpc('set_job_order', { p_ids: ids });
      if (error) console.error('setOrder', error.message);
    },
    async setModel(model) {                     // hali navbatda turganlar tanlangan modelda tahlil qilinadi
      const { error } = await t().update({ model }).in('status', ['uploading', 'queued']);
      if (error) console.error('setModel', error.message);
    },
    async retry(id) {
      const { error } = await t().update({ status: 'queued', message: null, attempts: 0, updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'error').not('image_path', 'is', null);
      if (error) throw new Error(error.message);
    },
    async removeMany(ids, paths) {
      if (ids.length) { const { error } = await t().delete().in('id', ids); if (error) throw new Error("O'chirib bo'lmadi: " + error.message); }
      const p = (paths || []).filter(Boolean);
      if (p.length) st().remove(p).catch(() => {});
    },
    async update(id, patch) {
      const { error } = await t().update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) console.error('jobs.update', error.message);
    },
    remove(id, path) { return this.removeMany([id], [path]); },
    async list(limit = 30) {
      const { data, error } = await t().select(COLS).order('created_at', { ascending: false }).limit(limit);
      if (error) throw new Error("Jarayonni yuklab bo'lmadi: " + error.message);
      return data;
    },
    // Sahifa qayta ochilganda navbatni tiklash uchun (tartib bo'yicha)
    async listQueue(limit = 500) {
      const { data, error } = await t().select(COLS).order('position', { nullsFirst: false }).order('created_at').limit(limit);
      if (error) throw new Error("Navbatni yuklab bo'lmadi: " + error.message);
      return data;
    },
    async thumbs(paths) {                       // { path: signedUrl }
      const p = paths.filter(Boolean), out = {};
      if (!p.length) return out;
      const { data } = await st().createSignedUrls(p, 3600);
      (data || []).forEach(x => { if (x.signedUrl) out[x.path] = x.signedUrl; });
      return out;
    }
  };
})(window.QW);
