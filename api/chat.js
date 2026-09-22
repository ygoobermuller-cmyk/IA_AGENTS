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

    // 1. COMPILADOR ESTRITO DE HISTÓRICO
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

    if (googleContents.length > 0 && googleContents[googleContents.length - 1].role !== 'user') {
      googleContents.pop();
    }

    if (googleContents.length === 0) {
      return res.status(400).json({ error: 'Nenhuma instrução válida enviada.' });
    }

    const payload = { contents: googleContents };
    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    // 2. CASCATA ANTI-404 DE MODELOS
    // Tenta os nomes exatos por ordem de potência e disponibilidade.
    const models = [
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash",
      "gemini-1.5-pro-latest",
      "gemini-1.0-pro" // A âncora absoluta que funciona em 100% das chaves
    ];

    let errorMsg = "";
    let finalStatus = 500;

    for (const model of models) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Processado sem retorno de texto.";
        return res.status(200).json({ text: textResponse });
      }

      const responseText = await response.text();
      finalStatus = response.status;
      
      try { 
        errorMsg = JSON.parse(responseText).error.message; 
      } catch (e) {
        errorMsg = responseText;
      }

      // Se for Erro 400 (nosso payload inválido) ou 403 (chave revogada), não adianta tentar outros
      if (finalStatus === 400 || finalStatus === 403) {
        return res.status(finalStatus).json({ error: `Recusado pela Google: ${errorMsg}` });
      }
      
      // Se for Erro 404 (modelo não existe), o loop continua instantaneamente para o próximo da lista.
    }

    // Se todos falharem
    return res.status(finalStatus).json({ error: `Nenhum modelo suportado na sua chave: ${errorMsg}` });

  } catch (error) {
    console.error("Vercel Crash:", error);
    return res.status(500).json({ error: `Falha interna de servidor: ${error.message}` });
  }
}
