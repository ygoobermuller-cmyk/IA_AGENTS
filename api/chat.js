// api/chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const { history, systemInstruction } = req.body;
    if (!history || history.length === 0) return res.status(400).json({ error: 'Histórico vazio.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Chave API não configurada.' });

    // 1. SANITIZAÇÃO BLINDADA (Acaba com o erro 400 por histórico corrompido)
    const safeHistory = [];
    let currentRole = null;
    for (const msg of history) {
        // Ignora mensagens seguidas da mesma pessoa para não irritar a API da Google
        if (msg.role !== currentRole) {
            safeHistory.push({ role: msg.role, parts: msg.parts });
            currentRole = msg.role;
        }
    }
    
    // A Google exige que a última mensagem seja sempre do utilizador
    if (safeHistory.length > 0 && safeHistory[safeHistory.length - 1].role !== 'user') {
         safeHistory.pop();
    }

    if (safeHistory.length === 0) return res.status(400).json({ error: 'Sincronização falhou. Atualize a página.' });

    // Fixo exclusivamente no modelo oficial mais rápido
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const payload = { contents: safeHistory };
    if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };

    // 2. RETRY SILENCIOSO (Acaba com o erro 503 na cara do utilizador)
    let maxAttempts = 3;
    let lastError = "";

    for (let i = 1; i <= maxAttempts; i++) {
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
        const status = response.status;

        // Se for erro de formato (400) ou chave bloqueada (403), não vale a pena insistir
        if (status === 400 || status === 403 || status === 404) break;

        // Se for erro de servidor da Google (503), espera 1.5s e tenta novamente
        await new Promise(r => setTimeout(r, 1500 * i));
    }

    let msg = lastError;
    try { msg = JSON.parse(lastError).error.message; } catch(e){}
    return res.status(500).json({ error: `Servidores da Google ocupados. Tente enviar de novo.` });

  } catch (error) {
    return res.status(500).json({ error: 'Falha interna na Vercel.' });
  }
}
