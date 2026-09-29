window.QW = {
  CFG: {
    PROVIDERS: {
      groq: {
        name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions',
        keyLabel: 'Groq API kaliti', ph: 'gsk_...',
        helpUrl: 'https://console.groq.com/keys', helpText: 'console.groq.com/keys',
        kKey: 'GROQ_API_KEY', kModel: 'GROQ_MODEL',
        models: [['qwen/qwen3.8-27b', 'Qwen 3.8 27B'], ['qwen/qwen3.6-27b', 'Qwen 3.6 27B']]
      },
      ollama: {
        name: 'Ollama Cloud', url: 'https://ollama.com/v1/chat/completions',
        keyLabel: 'Ollama API kaliti', ph: 'Ollama API key',
        helpUrl: 'https://ollama.com/settings/keys', helpText: 'ollama.com/settings/keys',
        kKey: 'OLLAMA_API_KEY', kModel: 'OLLAMA_MODEL',
        models: [['qwen3-vl:235b-instruct', 'Qwen3-VL 235B (instruct)']]
      }
    },
    FALLBACK: true,           // 429 / 5xx / timeout bo'lsa ikkinchi provayderga (kaliti bor bo'lsa) o'tadi
    MAX_IMG: 1600,            // rasm uzun tomoni (px)
    MAX_FILE: 10 * 1024 * 1024,
    MAX_TOKENS: 8000,
    TIMEOUT_MS: 120000,
    RETRIES: 2,
    HISTORY_MAX: 50,
    VERIFY_MIN: 0.92,         // Mus'haf bilan mosligi chegarasi
    K_PROVIDER: 'AI_PROVIDER',
    K_HIST: 'QURAN_WORDS_v6'
  }
};
