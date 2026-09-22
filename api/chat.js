// api/chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const { history, systemInstruction } = req.body;
    if (!history || history.length === 0) return res.status(400).json({ error: 'Histórico vazio ou inválido.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Chave API não configurada.' });

    // Apenas os modelos 100% estáveis e oficiais da Google. 
    // Se o flash estiver ocupado, salta para o pro.
    const models = ["gemini-1.5-flash", "gemini-1.5-pro"];
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
            console.warn(`Tentativa no modelo ${model} falhou:`, lastError);
        }
    }

    // Se ambos os modelos falharem, extrai a mensagem de erro limpa
    let msgErro = lastError;
    try { msgErro = JSON.parse(lastError).error.message; } catch(e) {}
    
    return res.status(503).json({ error: `Servidores da Google ocupados: ${msgErro}` });

  } catch (error) {
    console.error("Erro interno:", error);
    return res.status(500).json({ error: 'Falha interna no servidor.' });
  }
}
