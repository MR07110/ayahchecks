window.QW = {
  CFG: {
    MODELS: [['qwen/qwen3.8-27b', 'Qwen 3.8 27B'], ['qwen/qwen3.6-27b', 'Qwen 3.6 27B']], // api/worker.js dagi MODELS bilan bir xil bo'lsin
    MAX_IMG: 1600,            // rasm uzun tomoni (px)
    MAX_FILE: 10 * 1024 * 1024,
    MAX_SEND: 3 * 1024 * 1024, // Storage'ga yuklanadigan rasm hajmi
    HISTORY_MAX: 500,
    VERIFY_MIN: 0.92,         // Mus'haf bilan mosligi chegarasi
    K_MODEL: 'GROQ_MODEL',
    K_AUTORUN: 'AC_AUTO_RUN'
  }
};
