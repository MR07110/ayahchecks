// Brauzerga faqat ochiq (public) sozlamalarni beradi.
// Bu yerga hech qachon SERVICE_ROLE yoki GROQ kalitini qo'shmang.
module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: "SUPABASE_URL yoki SUPABASE_ANON_KEY Vercel env'da yo'q." });
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ supabaseUrl: url, supabaseAnonKey: key });
};
