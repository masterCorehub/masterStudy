const fs = require("node:fs");
const path = require("node:path");
const { safeStorage } = require("electron");
const {
  cancelOllamaRequest,
  chatWithOllama,
  getOllamaStatus,
  startOllama,
} = require("./ollama-service.cjs");

const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
const geminiRequests = new Map();

function normalizeGeminiModel(value) {
  const model = String(value || DEFAULT_GEMINI_MODEL).trim().replace(/^models\//, "");
  return model === "gemini-2.5-flash" ? DEFAULT_GEMINI_MODEL : model;
}

function configPath(app) {
  return path.join(app.getPath("userData"), "ai-provider.json");
}

function readStoredConfig(app) {
  try {
    return JSON.parse(fs.readFileSync(configPath(app), "utf8"));
  } catch {
    return { provider: "ollama", geminiModel: DEFAULT_GEMINI_MODEL };
  }
}

function decryptKey(value) {
  if (!value) return "";
  try {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  } catch {
    return "";
  }
}

function getAiConfig(app, { includeSecret = false } = {}) {
  const stored = readStoredConfig(app);
  const apiKey = decryptKey(stored.geminiApiKeyEncrypted);
  return {
    provider: stored.provider === "gemini" ? "gemini" : "ollama",
    geminiModel: normalizeGeminiModel(stored.geminiModel),
    geminiConfigured: Boolean(apiKey),
    ...(includeSecret ? { geminiApiKey: apiKey } : {}),
  };
}

function saveAiConfig(app, updates = {}) {
  const current = readStoredConfig(app);
  const next = {
    provider: updates.provider === "gemini" ? "gemini" : "ollama",
    geminiModel: normalizeGeminiModel(updates.geminiModel || current.geminiModel)
      .slice(0, 120),
    geminiApiKeyEncrypted: current.geminiApiKeyEncrypted || "",
  };
  if (typeof updates.geminiApiKey === "string" && updates.geminiApiKey.trim()) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("O armazenamento seguro do sistema não está disponível para proteger a chave.");
    }
    next.geminiApiKeyEncrypted = safeStorage
      .encryptString(updates.geminiApiKey.trim())
      .toString("base64");
  }
  if (updates.clearGeminiApiKey === true) next.geminiApiKeyEncrypted = "";
  fs.mkdirSync(path.dirname(configPath(app)), { recursive: true });
  fs.writeFileSync(configPath(app), JSON.stringify(next, null, 2), { mode: 0o600 });
  return getAiConfig(app);
}

async function chatWithGemini(app, { model, messages = [], format, requestId, timeout = 120_000, options } = {}) {
  const config = getAiConfig(app, { includeSecret: true });
  if (!config.geminiApiKey) throw new Error("Configure sua chave da API Gemini nas Configurações de IA.");
  const selectedModel = normalizeGeminiModel(model || config.geminiModel);
  const controller = new AbortController();
  if (requestId) geminiRequests.set(requestId, controller);
  const timer = setTimeout(() => controller.abort(new Error("Tempo limite excedido.")), timeout);
  const systemText = messages.filter((item) => item?.role === "system").map((item) => String(item.content || "")).join("\n\n");
  const contents = messages
    .filter((item) => item?.role !== "system" && item?.content)
    .slice(-20)
    .map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: String(item.content).slice(0, 200_000) }],
    }));
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": config.geminiApiKey },
      body: JSON.stringify({
        contents,
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        generationConfig: {
          temperature: Number(options?.temperature ?? 0.6),
          ...(format ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Gemini respondeu com status ${response.status}.`);
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((part) => part.text || "").join("");
    if (!text) throw new Error(candidate?.finishReason ? `O Gemini não gerou conteúdo (${candidate.finishReason}).` : "O Gemini não retornou conteúdo.");
    return { model: selectedModel, message: text, doneReason: candidate?.finishReason === "MAX_TOKENS" ? "length" : candidate?.finishReason || null };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(controller.signal.reason?.message || "Operação da IA cancelada.");
    throw error;
  } finally {
    clearTimeout(timer);
    if (requestId) geminiRequests.delete(requestId);
  }
}

async function getAiStatus(app) {
  const config = getAiConfig(app);
  if (config.provider === "gemini") {
    return {
      available: config.geminiConfigured,
      provider: "gemini",
      configured: config.geminiConfigured,
      models: [{ name: config.geminiModel, size: 0, cloud: true }],
      message: config.geminiConfigured ? "Gemini configurado" : "Adicione uma chave da API Gemini nas configurações.",
    };
  }
  return { ...(await getOllamaStatus()), provider: "ollama" };
}

async function chatWithAi(app, options = {}) {
  const config = getAiConfig(app);
  return config.provider === "gemini"
    ? chatWithGemini(app, {
        ...options,
        model: String(options.model || "").startsWith("gemini-")
          ? options.model
          : config.geminiModel,
      })
    : chatWithOllama(options);
}

function cancelAiRequest(requestId) {
  const controller = geminiRequests.get(requestId);
  if (controller) {
    controller.abort();
    geminiRequests.delete(requestId);
    return true;
  }
  return cancelOllamaRequest(requestId);
}

async function testAiProvider(app, draft = {}) {
  const previous = readStoredConfig(app);
  saveAiConfig(app, draft);
  try {
    const response = await chatWithAi(app, { messages: [{ role: "user", content: "Responda somente: OK" }], timeout: 20_000 });
    return { ok: true, provider: getAiConfig(app).provider, model: response.model };
  } catch (error) {
    fs.writeFileSync(configPath(app), JSON.stringify(previous, null, 2), { mode: 0o600 });
    throw error;
  }
}

module.exports = { cancelAiRequest, chatWithAi, getAiConfig, getAiStatus, saveAiConfig, startOllama, testAiProvider };
