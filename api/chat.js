// api/chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido (Use POST).' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Chave API não configurada na Vercel.' });
    }

    const { history, systemInstruction } = req.body;
    if (!history || !Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'O histórico está vazio.' });
    }

    // 1. COMPILADOR ESTRITO DE HISTÓRICO (Previne 100% dos Erros 400 da Google)
    const googleContents = [];
    
    for (const msg of history) {
      // Garante que os "roles" são apenas os oficiais aceites
      const role = (msg.role === 'model' || msg.role === 'bot') ? 'model' : 'user';
      const text = msg.parts?.[0]?.text || '';
      
      if (!text.trim()) continue; // Ignora anomalias vazias

      // Se a mensagem for do mesmo autor que a anterior, agrupa os textos automaticamente.
      // (Isto impede o erro fatal da Google quando há dois 'user' seguidos após uma falha de conexão)
      if (googleContents.length > 0 && googleContents[googleContents.length - 1].role === role) {
        googleContents[googleContents.length - 1].parts[0].text += `\n\n${text}`;
      } else {
        googleContents.push({ role, parts: [{ text }] });
      }
    }

    // A regra de ouro da Google: o array tem de acabar SEMPRE com o utilizador
    if (googleContents.length > 0 && googleContents[googleContents.length - 1].role !== 'user') {
      googleContents.pop();
    }

    if (googleContents.length === 0) {
      return res.status(400).json({ error: 'Nenhuma instrução válida enviada.' });
    }

    // 2. MONTAGEM DA PERSONA E PAYLOAD (Padrão Oficial v1beta)
    const payload = { contents: googleContents };
    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    // 3. CONEXÃO DIRETA E RÁPIDA (Sem loops que causam Timeout na Vercel)
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorMsg = responseText;
      try { errorMsg = JSON.parse(responseText).error.message; } catch (e) {}
      return res.status(response.status).json({ error: `Recusado pela Google: ${errorMsg}` });
    }

    const data = JSON.parse(responseText);
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Processado sem retorno de texto.";

    return res.status(200).json({ text: textResponse });

  } catch (error) {
    console.error("Vercel Crash:", error);
    return res.status(500).json({ error: `Falha interna de servidor: ${error.message}` });
  }
}
