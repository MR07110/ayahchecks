window.QW = {
  CFG: {
    MODELS: [['qwen/qwen3.8-27b', 'Qwen 3.8 27B'], ['qwen/qwen3.6-27b', 'Qwen 3.6 27B']],
    MAX_IMG: 1600,            // rasm uzun tomoni (px)
    MAX_FILE: 10 * 1024 * 1024,
    MAX_TOKENS: 8000,
    TIMEOUT_MS: 120000,
    RETRIES: 2,
    HISTORY_MAX: 50,
    VERIFY_MIN: 0.92,         // Mus'haf bilan mosligi chegarasi
    K_KEY: 'GROQ_API_KEY',
    K_MODEL: 'GROQ_MODEL',
    K_AUTORUN: 'AC_AUTO_RUN',
    K_AUTOCOPY: 'AC_AUTO_COPY',
    K_HIST: 'QURAN_WORDS_v6'
  }
};
