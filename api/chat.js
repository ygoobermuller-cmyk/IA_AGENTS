// api/chat.js

module.exports = async function handler(req, res) {
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

    // 1. COMPILADOR ESTRITO DE HISTÓRICO (Blinda contra erros 400)
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

    // 2. BUSCA DINÂMICA DO MODELO (Acaba com o erro 404 definitivamente)
    // O sistema pergunta à Google: "Quais modelos esta chave API pode usar agora?"
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl);
    
    if (!listRes.ok) {
        return res.status(500).json({ error: 'A sua chave API foi rejeitada ou está inválida.' });
    }
    
    const listData = await listRes.json();
    
    // Filtra apenas modelos reais de texto autorizados para esta chave
    const validModels = listData.models.filter(m => 
        m.supportedGenerationMethods?.includes('generateContent') && 
        m.name.includes('gemini')
    );

    if (validModels.length === 0) {
        return res.status(500).json({ error: 'A sua chave não tem permissão para usar nenhum modelo Gemini.' });
    }

    // Procura o 1.5 Flash, ou o 1.5 Pro, ou agarra o primeiro que a Google disser que funciona
    let bestModelName = validModels[0].name; // Formato recebido: "models/nome-do-modelo"
    const preferred = validModels.find(m => m.name.includes('gemini-1.5-flash')) || 
                      validModels.find(m => m.name.includes('gemini-1.5-pro')) ||
                      validModels.find(m => m.name.includes('gemini-pro'));
    
    if (preferred) {
        bestModelName = preferred.name;
    }

    // 3. PEDIDO COM O MODELO 100% GARANTIDO
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${bestModelName}:generateContent?key=${apiKey}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorMsg = responseText;
      try { errorMsg = JSON.parse(responseText).error.message; } catch (e) {}
      return res.status(response.status).json({ error: `Erro na geração: ${errorMsg}` });
    }

    const data = JSON.parse(responseText);
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta.";

    return res.status(200).json({ text: textResponse });

  } catch (error) {
    console.error("Vercel Crash:", error);
    return res.status(500).json({ error: `Falha interna: ${error.message}` });
  }
};
