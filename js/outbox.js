// Orqa fonda yuklash: olingan rasmlar IndexedDB'da saqlanadi va sahifa almashsa/yangilansa/internet uzilsa ham keyin yuklanadi.
(function (Q) {
  const S = 'q', live = new Set();
  const db = new Promise((res, rej) => { const r = indexedDB.open('ac-outbox', 1); r.onupgradeneeded = () => r.result.createObjectStore(S, { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = (mode, fn) => db.then(d => new Promise((res, rej) => { const t = d.transaction(S, mode), q = fn(t.objectStore(S)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
  const O = Q.outbox = {
    live,
    put(id, blob) { live.add(id); return tx('readwrite', s => s.put({ id, blob, tries: 0 })).catch(() => {}); },
    del(id) { live.delete(id); return tx('readwrite', s => s.delete(id)).catch(() => {}); },
    async drain() {
      if (O.busy) return; O.busy = true;
      try {
        await Q.supa.ready;
        const list = (await tx('readonly', s => s.getAll()).catch(() => [])) || [];
        for (const e of list.filter(x => !live.has(x.id))) {
          live.add(e.id);
          try {
            const { data } = await Q.supa.client().from('jobs').select('status').eq('id', e.id).maybeSingle();
            if (!data || data.status !== 'uploading') { await O.del(e.id); continue; }   // o'chirilgan yoki allaqachon yuklangan
            await Q.jobs.upload(e.id, e.blob); await O.del(e.id);
          } catch (err) {
            e.tries = (e.tries || 0) + 1;
            if (e.tries >= 6) { await Q.jobs.update(e.id, { status: 'error', message: err.message }); await O.del(e.id); }
            else { await tx('readwrite', s => s.put(e)).catch(() => {}); live.delete(e.id); }
          }
        }
      } catch { /* */ }
      O.busy = false;
    }
  };
  Q.supa.ready.then(() => { O.drain(); setInterval(() => { if (!document.hidden) O.drain(); }, 15000); addEventListener('online', () => O.drain()); }).catch(() => {});
})(window.QW);
