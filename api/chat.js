// api/chat.js

export default async function handler(req, res) {
  // Apenas aceita pedidos do tipo POST (onde os dados são enviados com segurança)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
  }

  try {
    // Extrai o histórico de mensagens e o modelo a usar a partir do pedido do site
    const { history, modelName = "gemini-1.5-flash" } = req.body;

    if (!history || !Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'O histórico de mensagens está vazio ou é inválido.' });
    }

    // A chave secreta é lida das Variáveis de Ambiente da Vercel
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("ERRO: A variável de ambiente GEMINI_API_KEY não está configurada.");
      return res.status(500).json({ error: 'Erro de configuração do servidor. A chave da API não foi encontrada.' });
    }

    // O URL da API da Google
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // Faz o pedido diretamente aos servidores da Google
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: history })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Erro reportado pela API da Google:", errorData);
      return res.status(response.status).json({ error: 'A API do Google Gemini devolveu um erro.' });
    }

    const data = await response.json();

    // Extrai e formata a resposta
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Lamento, não consegui gerar uma resposta.";

    // Devolve o texto final para o site
    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Erro interno no servidor (/api/chat):", error);
    return res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
  }
}
