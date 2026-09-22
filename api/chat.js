// api/chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const { history, systemInstruction } = req.body;
    if (!history || history.length === 0) return res.status(400).json({ error: 'Histórico vazio.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Chave API não configurada na Vercel.' });

    // 1. SANITIZAÇÃO ABSOLUTA: Junta mensagens seguidas para nunca dar Erro 400
    const safeHistory = [];
    for (const msg of history) {
        if (safeHistory.length > 0 && safeHistory[safeHistory.length - 1].role === msg.role) {
            safeHistory[safeHistory.length - 1].parts.push(...msg.parts);
        } else {
            safeHistory.push({ role: msg.role, parts: [...msg.parts] });
        }
    }
    
    // A Google exige que termine sempre consigo (user)
    if (safeHistory.length > 0 && safeHistory[safeHistory.length - 1].role !== 'user') {
         safeHistory.pop();
    }

    if (safeHistory.length === 0) return res.status(400).json({ error: 'Erro no histórico. Por favor limpe o chat.' });

    // 2. O TRUQUE INFALÍVEL: Injeta a especialidade do agente de forma invisível na primeira mensagem
    if (systemInstruction) {
        safeHistory[0].parts.unshift({ text: `[DIRETRIZ DE SISTEMA: ${systemInstruction}]\n\n` });
    }

    // Usando APENAS o modelo rápido garantido
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const payload = { contents: safeHistory };

    let lastError = "";
    let finalStatus = 500;

    // 3. Tenta até 3 vezes se o servidor estiver mesmo ocupado
    for (let i = 1; i <= 3; i++) {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            return res.status(200).json({ text: data.candidates[0].content.parts[0].text });
        }

        lastError = await response.text();
        finalStatus = response.status;

        // Se for erro de formato (400) ou chave inválida (403), sai logo para mostrar o problema real
        if (finalStatus === 400 || finalStatus === 403 || finalStatus === 404) break;

        await new Promise(r => setTimeout(r, 1000 * i));
    }

    // 4. MOSTRA O ERRO VERDADEIRO E EXATO DA GOOGLE PARA SABERMOS O QUE SE PASSA
    let msg = lastError;
    try { msg = JSON.parse(lastError).error.message; } catch(e){}
    return res.status(finalStatus).json({ error: `Recusado pela API da Google (Código ${finalStatus}): ${msg}` });

  } catch (error) {
    return res.status(500).json({ error: `Falha crítica na Vercel: ${error.message}` });
  }
}
