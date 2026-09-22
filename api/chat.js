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
      return res.status(500).json({ error: 'Chave API não configurada.' });
    }

    const modelsToTry = ["gemini-3.6-flash", "gemini-1.5-flash", "gemini-pro"];
    let data = null;
    let success = false;

    for (const modelName of modelsToTry) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: history })
      });

      if (response.ok) {
        data = await response.json();
        success = true;
        break;
      } else {
        const errText = await response.text();
        console.warn(`Modelo ${modelName} falhou:`, errText);
      }
    }

    if (!success || !data) {
      return res.status(503).json({ error: 'Todos os modelos estão temporariamente sobrecarregados. Tente novamente.' });
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta.";
    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Erro interno no servidor:", error);
    return res.status(500).json({ error: 'Falha interna.' });
  }
}
