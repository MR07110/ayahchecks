(function (Q) {
  const C = Q.CFG;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
  };
  const hist = {
    list() { const l = store.get(C.K_HIST, []); return Array.isArray(l) ? l : []; },
    lastDropped: 0,
    add(data, meta) {
      meta = meta || {};
      const l = this.list(), n0 = l.length + 1;
      const item = { id: Date.now() + Math.random(), date: new Date().toISOString(), surah: data.surah || '', surah_number: data.surah_number || null, ayah_count: (data.ayahs || []).length, file: meta.file || null, model: meta.model || null, ms: meta.ms || null, data };
      l.unshift(item);
      l.length = Math.min(l.length, C.HISTORY_MAX);
      while (!store.set(C.K_HIST, l) && l.length > 1) l.pop(); // joy yetmasa eng eskisini tashla
      this.lastDropped = Math.max(0, n0 - l.length);
      return item;
    },
    remove(id) { return store.set(C.K_HIST, this.list().filter(x => x.id !== id)); },
    clear() { return store.set(C.K_HIST, []); }
  };
  Q.store = store; Q.hist = hist;
})(window.QW);
