// Realtime + ishonchli sinxron: WebSocket uzilsa o'zi qayta ulanadi, fon/uyqu holatidan qaytganda darrov yangilaydi,
// Realtime butunlay ishlamasa ham (yoqilmagan jadval, tarmoq to'siqlari) so'rov (polling) bilan yangilanib turadi.
(function (Q) {
  const wakeFns = [];
  const wake = () => wakeFns.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  ['focus', 'online', 'pageshow'].forEach(ev => addEventListener(ev, wake));

  Q.live = {
    onWake(f) { wakeFns.push(f); },
    // watch({ name, table, onEvent(payload), refetch(), poll })
    //  - refetch: bazadan to'liq qayta o'qish (obuna bo'lganda, uyg'onganda va har poll ms da chaqiriladi)
    watch({ name, table, onEvent, refetch, poll = 6000 }) {
      let ch = null, tries = 0, rt = null, busy = false, again = false;
      const client = () => Q.supa.client();
      const run = async () => {
        if (busy) { again = true; return; }
        busy = true;
        try { await refetch(); } catch (e) { console.error('live refetch:', e.message || e); }
        busy = false;
        if (again) { again = false; run(); }
      };
      function retry() {
        if (rt) return;
        const d = Math.min(30000, 1000 * Math.pow(2, tries++));
        rt = setTimeout(() => { rt = null; sub(); }, d);
      }
      function sub() {
        if (ch) { try { client().removeChannel(ch); } catch (e) { /* */ } ch = null; }
        const mine = client().channel(name + '-' + Date.now().toString(36));
        ch = mine;
        mine.on('postgres_changes', { event: '*', schema: 'public', table }, p => { try { onEvent && onEvent(p); } catch (e) { console.error(e); } })
          .subscribe(status => {
            if (mine !== ch) return;   // eski kanal (biz o'zimiz yopgan) — e'tiborsiz
            if (status === 'SUBSCRIBED') { tries = 0; run(); }             // ulanguncha o'tkazib yuborilgan o'zgarishlarni oladi
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') retry();
          });
      }
      const tick = () => { run(); setTimeout(tick, document.hidden ? 30000 : poll); };
      sub(); setTimeout(tick, poll);
      Q.live.onWake(() => { run(); if (!ch) retry(); });
      return { refresh: run };
    }
  };
})(window.QW);
