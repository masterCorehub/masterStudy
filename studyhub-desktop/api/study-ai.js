const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_INPUT_CHARS = 220_000;

const json = (response, status, payload) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
};

async function requireUser(request) {
  const authorization = String(request.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) return false;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !publicKey) throw new Error("A autenticação da API de IA ainda não foi configurada no servidor.");
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: publicKey, Authorization: authorization },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? user : null;
}

async function consumeQuota(userId) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("O limite de uso da IA ainda não foi configurado no servidor.");
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/consume_study_ai_quota`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: userId }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("O limite de uso da IA não respondeu.");
  return response.json();
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST");
    return json(response, 405, { error: "Método não permitido." });
  }
  try {
    const user = await requireUser(request);
    if (!user) return json(response, 401, { error: "Entre na sua conta para usar a IA." });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return json(response, 503, { error: "A IA web ainda não foi configurada neste servidor." });
    const model = String(process.env.GEMINI_MODEL || DEFAULT_MODEL).replace(/^models\//, "").slice(0, 100);
    if (request.method === "GET") return json(response, 200, { available: true, provider: "masterStudy", model });

    const { system = "", prompt = "", history = [], format } = request.body || {};
    if (typeof prompt !== "string" || !prompt.trim() || typeof system !== "string") return json(response, 400, { error: "O pedido da IA está vazio ou inválido." });
    const validHistory = Array.isArray(history)
      ? history.filter((item) => ["user", "assistant"].includes(item?.role) && typeof item.content === "string").slice(-10)
      : [];
    const inputSize = system.length + prompt.length + validHistory.reduce((sum, item) => sum + item.content.length, 0);
    if (inputSize > MAX_INPUT_CHARS) {
      return json(response, 413, { error: "O texto é longo demais para uma única solicitação." });
    }
    if (!(await consumeQuota(user.id))) return json(response, 429, { error: "Você atingiu o limite temporário da IA. Tente novamente em alguns minutos." });
    const messages = validHistory;
    const contents = [...messages, { role: "user", content: prompt }].map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content.slice(0, MAX_INPUT_CHARS) }],
    }));
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents,
        ...(system.trim() ? { systemInstruction: { parts: [{ text: system.slice(0, MAX_INPUT_CHARS) }] } } : {}),
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 4096,
          ...(format === "json" ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      return json(response, status, { error: upstream.status === 429 ? "A IA está ocupada. Aguarde um pouco e tente novamente." : "O servidor de IA não conseguiu concluir a solicitação." });
    }
    const content = (result.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("").trim();
    if (!content) return json(response, 502, { error: "A IA não retornou conteúdo." });
    return json(response, 200, { content, model });
  } catch (error) {
    console.error("Study AI request failed:", error?.message || error);
    const status = error?.name === "TimeoutError" ? 504 : 500;
    return json(response, status, { error: status === 504 ? "O servidor demorou demais para responder. Tente novamente." : "Não foi possível falar com o serviço de IA." });
  }
}
