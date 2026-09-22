// api/chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { history } = req.body;

    if (!history || !Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'Histórico vazio ou inválido.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("ERRO: GEMINI_API_KEY em falta na Vercel.");
      return res.status(500).json({ error: 'Chave API não configurada.' });
    }

    // Forçamos o nome do modelo para evitar erros 404
    const modelName = "gemini-1.5-flash";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // Log de diagnóstico na Vercel (esconde a chave)
    console.log("Tentando comunicar com:", apiUrl.split("?key=")[0]);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: history })
    });

    if (!response.ok) {
      // Captura a mensagem de erro exata da Google
      const errorData = await response.text();
      console.error(`ERRO DO GOOGLE (Status ${response.status}):`, errorData);
      return res.status(response.status).json({ error: 'A API do Google falhou.' });
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta.";

    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Erro interno no servidor:", error);
    return res.status(500).json({ error: 'Falha interna.' });
  }
}
