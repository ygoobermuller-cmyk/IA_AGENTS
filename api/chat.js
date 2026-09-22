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

    // Apenas os dois pilares oficiais e estáveis da Google. Sem nomes inventados.
    const stableModels = ['gemini-1.5-flash', 'gemini-1.5-pro'];
    let lastErrorMsg = "";
    let finalStatus = 500;

    for (const model of stableModels) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            return res.status(200).json({ text: data.candidates[0].content.parts[0].text });
        }

        const responseText = await response.text();
        finalStatus = response.status;
        try { 
            lastErrorMsg = JSON.parse(responseText).error.message; 
        } catch(e){ 
            lastErrorMsg = responseText; 
        }

        if (finalStatus === 400 || finalStatus === 403) {
            return res.status(finalStatus).json({ error: `Erro Google: ${lastErrorMsg}` });
        }
    }

    return res.status(finalStatus).json({ error: `Servidores da Google ocupados. Detalhe: ${lastErrorMsg}` });

  } catch (error) {
    console.error("Vercel Crash:", error);
    return res.status(500).json({ error: `Falha interna: ${error.message}` });
  }
};
