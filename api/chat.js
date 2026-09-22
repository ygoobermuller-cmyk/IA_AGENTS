module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const { history, systemInstruction } = req.body;
    
    if (!history || !Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'O histórico está vazio.' });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'Chave GEMINI não configurada.' });

    const googleContents = [];
    for (const msg of history) {
        const role = (msg.role === 'model' || msg.role === 'bot') ? 'model' : 'user';
        const text = msg.parts?.[0]?.text || '';
        if (!text.trim()) continue;

        if (googleContents.length > 0 && googleContents[googleContents.length - 1].role === role) {
            googleContents[googleContents.length - 1].parts[0].text += `\n\n${text}`;
        } else {
            googleContents.push({ role, parts: [{ text }] });
        }
    }

    if (googleContents.length > 0 && googleContents[googleContents.length - 1].role !== 'user') googleContents.pop();
    if (googleContents.length === 0) return res.status(400).json({ error: 'Histórico inválido.' });

    const payload = { contents: googleContents };
    if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };

    // Utilizando o modelo oficial atualizado gemini-3.5-flash
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorMsg = responseText;
      try { errorMsg = JSON.parse(responseText).error.message; } catch (e) {}
      return res.status(response.status).json({ error: `Erro Google: ${errorMsg}` });
    }

    const data = JSON.parse(responseText);
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta.";

    return res.status(200).json({ text: textResponse });

  } catch (error) {
    console.error("Vercel Crash:", error);
    return res.status(500).json({ error: `Falha interna: ${error.message}` });
  }
};
