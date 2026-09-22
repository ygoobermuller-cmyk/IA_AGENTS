// api/chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const { history, systemInstruction } = req.body;
    if (!history || history.length === 0) return res.status(400).json({ error: 'Histórico vazio ou inválido.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Chave API não configurada.' });

    // Foco total no modelo mais rápido e estável da Google
    const modelName = "gemini-1.5-flash";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const payload = { contents: history };
    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erro da API do Google:", errText);
      return res.status(response.status).json({ error: 'Falha ao comunicar com o Google Gemini.' });
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta gerada.";
    
    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Erro interno crítico:", error);
    return res.status(500).json({ error: 'Falha interna no servidor.' });
  }
}
