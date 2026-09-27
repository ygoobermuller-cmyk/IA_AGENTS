const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const GEMINI_TIMEOUT_MS = 25000;
const MAX_HISTORY_MESSAGES = 50;
const MAX_HISTORY_CHARS = 3_000_000; // ~750k tokens estimados (4 chars/token)

/**
 * Convert hist├│rico interno para formato Gemini.
 * - Agrupa mensagens consecutivas do mesmo papel.
 * - Remove mensagens vazias.
 * - Garante que a ├║ltima mensagem ├ę do usu├Īrio.
 */
function toGeminiContents(history) {
    const googleContents = [];

    for (const msg of history) {
        if (!msg || typeof msg !== 'object') continue;

        const role = (msg.role === 'model' || msg.role === 'bot') ? 'model' : 'user';
        const text = msg.parts?.[0]?.text;
        if (!text || !text.trim()) continue;

        const trimmed = text.trim();

        if (googleContents.length > 0 &&
            googleContents[googleContents.length - 1].role === role) {
            googleContents[googleContents.length - 1].parts[0].text +=
                `\n\n${trimmed}`;
        } else {
            googleContents.push({ role, parts: [{ text: trimmed }] });
        }
    }

    // Gemini exige que a ├║ltima mensagem seja do usu├Īrio
    if (googleContents.length > 0 &&
        googleContents[googleContents.length - 1].role !== 'user') {
        googleContents.pop();
    }

    return googleContents;
}

function buildPayload(contents, systemInstruction) {
    const payload = { contents };

    if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    // Controlo de gera├¦├úo: temperatura moderada para respostas ├║teis e variadas
    payload.generationConfig = {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 4096,
        stopSequences: [],
    };

    return payload;
}

function sanitizeError(status, raw) {
    // Nunca devolver detalhes internos ao cliente
    const safe = {
        400: 'Requisi├ž├úo inv├ílida. Verifica o formato do hist├│rico.',
        401: 'Chave de API inv├ílida ou sem permiss├ões.',
        403: 'Acesso negado pela API do Google.',
        404: 'Modelo n├úo encontrado. Contacta o administrador.',
        429: 'Limite de taxa excedido. Tenta de nuovo mais tarde.',
        500: 'Erro interno do servidor. Tenta de novo.',
        503: 'Servi├žo temporariamente indispon├ível.',
    };

    return safe[status] || `Erro na API (${status}). Tenta de novo.`;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'M├ętodo n├úo permitido.' });
    }

    // ---- Valida├¦├úo de entrada ----
    const { history, systemInstruction } = req.body || {};

    if (!history || !Array.isArray(history) || history.length === 0) {
        return res.status(400).json({ error: 'Hist├│rico vazio ou inv├ílido.' });
    }

    // Limita n├║mero de mensagens e tamanho total para evitar custos excessivos
    if (history.length > MAX_HISTORY_MESSAGES) {
        return res.status(400).json({
            error: `Hist├│rico excede o limite de ${MAX_HISTORY_MESSAGES} mensagens. Envie uma janela mais recente.`
        });
    }

    let totalChars = 0;
    for (const m of history) {
        totalChars += (m.parts?.[0]?.text || '').length;
    }
    if (totalChars > MAX_HISTORY_CHARS) {
        return res.status(400).json({
            error: 'Hist├│rico excede o limite de tamanho. Corte o contexto mais antigo.'
        });
    }

    // ---- Chave de API ----
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        console.error('[GeminiAPI] GEMINI_API_KEY n├úo configurada.');
        return res.status(500).json({ error: 'Servi├žo temporariamente indispon├ível.' });
    }

    // ---- Constr├║i payload ----
    const contents = toGeminiContents(history);
    if (contents.length === 0) {
        return res.status(400).json({ error: 'Nenhuma mensagem v├ília encontrada no hist├│rico.' });
    }

    const payload = buildPayload(contents, systemInstruction);

    // ---- Requisi├§├úo com timeout ----
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
    } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
            console.error('[GeminiAPI] Timeout ap├ís de', GEMINI_TIMEOUT_MS, 'ms.');
            return res.status(504).json({ error: 'Tempo esgotado. Tenta de novo.' });
        }
        console.error('[GeminiAPI] Falha de rede:', fetchErr.message);
        return res.status(502).json({ error: 'Falha de comunica├§├úo. Tenta de novo.' });
    } finally {
        clearTimeout(timeoutId);
    }

    // ---- Tratamento da resposta ----
    if (!response.ok) {
        const raw = await response.text().catch(() => '');
        let details = '';
        try {
            const parsed = JSON.parse(raw);
            details = parsed.error?.message || parsed.error?.statusText || '';
        } catch { details = raw; }

        console.error('[GeminiAPI] Resposta erro',
            response.status, details.substring(0, 500));

        return res.status(response.status).json({
            error: sanitizeError(response.status, details)
        });
    }

    // ---- Extrai texto da resposta ----
    let data;
    try {
        const text = await response.text();
        data = JSON.parse(text);
    } catch (parseErr) {
        console.error('[GeminiAPI] Imposs├ível parsear resposta:', parseErr.message);
        return res.status(502).json({ error: 'Resposta inv├ível do modelo.' });
    }

    const textResponse =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        data.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') ||
        'Sem resposta.';

    return res.status(200).json({ text: textResponse });
};
