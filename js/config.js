window.QW = {
  CFG: {
    MODELS: [['qwen/qwen3.8-27b', 'Qwen 3.8 27B'], ['qwen/qwen3.6-27b', 'Qwen 3.6 27B']], // api/worker.js dagi MODELS bilan bir xil bo'lsin
    MAX_IMG: 2200,            // rasm uzun tomoni (px). 1600 da mayda harakatlar (fatha/kasra/shadda) yo'qolardi
    MAX_FILE: 10 * 1024 * 1024,
    MAX_SEND: 2.6 * 1024 * 1024, // Storage'ga yuklanadigan rasm hajmi (Groq base64 chegarasi 4 MB: 2.6 MB ~ 3.5 MB base64)
    HISTORY_MAX: 500,
    VERIFY_MIN: 0.92,         // Mus'haf bilan mosligi chegarasi
    K_MODEL: 'GROQ_MODEL',
    K_AUTORUN: 'AC_AUTO_RUN'
  }
};
