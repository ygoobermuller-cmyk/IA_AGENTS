// api/chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const { history, systemInstruction } = req.body;
    if (!history || history.length === 0) return res.status(400).json({ error: 'Histórico vazio ou inválido.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Chave API não configurada.' });

    // Rede de segurança apenas com a família Gemini 1.5
    const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-8b"];
    let lastError = "";

    for (const model of models) {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: history,
                systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
            })
        });

        if (response.ok) {
            const data = await response.json();
            return res.status(200).json({ text: data.candidates[0].content.parts[0].text });
        } else {
            lastError = await response.text();
            console.warn(`Tentativa no ${model} falhou:`, lastError);
        }
    }

    // Se todos falharem, envia o erro EXATO da Google para a interface
    let msgErro = lastError;
    try { msgErro = JSON.parse(lastError).error.message; } catch(e) {}
    
    return res.status(500).json({ error: `Detalhe da Google: ${msgErro}` });

  } catch (error) {
    console.error("Erro interno:", error);
    return res.status(500).json({ error: 'Falha interna na Vercel.' });
  }
}
