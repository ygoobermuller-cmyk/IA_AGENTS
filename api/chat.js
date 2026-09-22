// api/chat.js

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const { history, systemInstruction, provider = 'google' } = req.body;
    
    if (!history || !Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'O histórico está vazio.' });
    }

    // ==========================================
    // 🧠 ROTA 1: OPENAI (GPT-4o)
    // ==========================================
    if (provider === 'openai') {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) return res.status(500).json({ error: 'Chave OPENAI não detetada. Fez o Redeploy na Vercel?' });

        const messages = [];
        if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
        
        for (const msg of history) {
            const role = (msg.role === 'model' || msg.role === 'bot') ? 'assistant' : 'user';
            const content = msg.parts?.[0]?.text || '';
            if (content.trim()) messages.push({ role, content });
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${openaiKey}` 
            },
            body: JSON.stringify({ model: 'gpt-4o', messages }) 
        });

        const responseText = await response.text();
        if (!response.ok) {
            let err = responseText;
            try { err = JSON.parse(responseText).error.message; } catch(e){}
            return res.status(response.status).json({ error: `Erro OpenAI: ${err}` });
        }
        
        const data = JSON.parse(responseText);
        return res.status(200).json({ text: data.choices[0].message.content });
    }

    // ==========================================
    // 🧠 ROTA 2: GOOGLE GEMINI (3.6-flash)
    // ==========================================
    if (provider === 'google') {
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

        // Atualizado exatamente para o modelo que a Google exigiu no erro
        const modelName = 'gemini-3.6-flash';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        if (!response.ok) {
            let err = responseText;
            try { err = JSON.parse(responseText).error.message; } catch(e){}
            return res.status(response.status).json({ error: `Erro Google: ${err}` });
        }

        const data = JSON.parse(responseText);
        return res.status(200).json({ text: data.candidates[0].content.parts[0].text });
    }

    return res.status(400).json({ error: 'Motor de IA desconhecido.' });

  } catch (error) {
    console.error("Vercel Crash:", error);
    return res.status(500).json({ error: `Falha interna: ${error.message}` });
  }
};
