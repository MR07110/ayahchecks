window.QW = {
  CFG: {
    PROVIDERS: {
      groq: { name: 'Groq', url: '/api/groq',            // kalit serverda (GROQ_API_KEY)
        models: [['qwen/qwen3.8-27b', 'Qwen 3.8 27B'], ['qwen/qwen3.6-27b', 'Qwen 3.6 27B']] },
      ollama: { name: 'Ollama Cloud', url: '/api/ollama',   // kalit serverda (OLLAMA_KEY)
        models: [['gemma4:31b', 'Gemma 4 31B'], ['kimi-k3', 'Kimi K3']] }
    },
    MAX_IMG: 1600,            // rasm uzun tomoni (px)
    MAX_FILE: 10 * 1024 * 1024,
    MAX_TOKENS: 8000,
    TIMEOUT_MS: 120000,
    RETRIES: 2,
    HISTORY_MAX: 300,
    VERIFY_MIN: 0.92,         // Mus'haf bilan mosligi chegarasi
    K_MODEL: 'GROQ_MODEL',
    K_PROV: 'AI_PROVIDER',
    K_HIST: 'QURAN_WORDS_v6'
  }
};
