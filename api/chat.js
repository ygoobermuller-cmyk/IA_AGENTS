// api/chat.js
import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { history } = req.body;

    if (!history || !Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'Histórico vazio ou inválido.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Chave API não configurada.' });
    }

    // Inicializa o cliente oficial da Google AI
    const ai = new GoogleGenAI({ apiKey });

    // Converte o histórico para o formato esperado pelo SDK
    const contents = history.map(item => ({
      role: item.role === 'model' ? 'model' : 'user',
      parts: [{ text: item.parts?.[0]?.text || '' }]
    }));

    // Utiliza o modelo standard recomendado pela Google
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: contents,
    });

    const responseText = response.text || "Sem resposta.";

    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Erro na API do Google:", error);
    return res.status(500).json({ error: 'Erro ao comunicar com o assistente.' });
  }
}
