(function (Q) {
  const C = Q.CFG;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
  };
  const hist = {
    list() { const l = store.get(C.K_HIST, []); return Array.isArray(l) ? l : []; },
    add(data) {
      const l = this.list();
      l.unshift({ id: Date.now(), date: new Date().toISOString(), surah: data.surah || '', surah_number: data.surah_number || null, ayah_count: (data.ayahs || []).length, data });
      l.length = Math.min(l.length, C.HISTORY_MAX);
      while (!store.set(C.K_HIST, l) && l.length > 1) l.pop(); // joy yetmasa eng eskisini tashla
    },
    remove(id) { return store.set(C.K_HIST, this.list().filter(x => x.id !== id)); },
    clear() { return store.set(C.K_HIST, []); }
  };
  Q.store = store; Q.hist = hist;
})(window.QW);
