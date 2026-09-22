// api/chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const { history, systemInstruction } = req.body;
    if (!history || !Array.isArray(history) || history.length === 0) {
        return res.status(400).json({ error: 'Histórico vazio ou inválido.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Chave API não configurada.' });

    // 1. BUSCA DINÂMICA DE MODELOS (FIM DOS ERROS 404)
    // Pergunta à Google quais modelos a SUA chave suporta e tem acesso garantido.
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl);
    
    let modelsToTry = ["gemini-1.5-flash", "gemini-1.0-pro"]; // Backup absoluto
    
    if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.models) {
            // Filtra apenas modelos reais de texto que a sua chave consegue usar
            const validModels = listData.models
                .filter(m => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('gemini'))
                .map(m => m.name.replace('models/', ''));
            
            // Ordena para o 1.5-flash ser sempre o primeiro a ser testado
            modelsToTry = validModels.sort((a, b) => {
                if (a.includes('1.5-flash') && !b.includes('1.5-flash')) return -1;
                if (b.includes('1.5-flash') && !a.includes('1.5-flash')) return 1;
                return 0;
            });
        }
    }

    const payload = { contents: history };
    if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    let mainError = "";

    // 2. TENTA OS MODELOS REAIS UM POR UM
    for (const model of modelsToTry) {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            const texto = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta.";
            return res.status(200).json({ text: texto });
        }

        const errText = await response.text();
        
        // Se for erro 400, o problema é no histórico do utilizador, logo não vale a pena testar outros modelos
        if (response.status === 400) {
            return res.status(400).json({ error: "Erro no formato da mensagem. Por favor, inicie um Novo Workspace (limpe o histórico)." });
        }
        
        // Guarda o erro, mas continua a testar o próximo modelo válido
        try { 
            mainError = JSON.parse(errText).error.message; 
        } catch(e) { 
            mainError = errText; 
        }
    }
    
    // Se todos falharem (muito raro agora)
    return res.status(503).json({ error: `Servidores da Google ocupados neste momento. Detalhe: ${mainError}` });

  } catch (error) {
    console.error("Erro interno:", error);
    return res.status(500).json({ error: 'Falha interna na Vercel.' });
  }
}
