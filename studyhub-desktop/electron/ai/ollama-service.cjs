const { spawn } = require("node:child_process");

const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const runningRequests = new Map();

async function ollamaFetch(pathname, options = {}) {
  const controller = new AbortController();
  const requestId = options.requestId || null;
  if (requestId) runningRequests.set(requestId, controller);
  const timeout = setTimeout(
    () => controller.abort(new Error("Tempo limite excedido.")),
    options.timeout || 90_000,
  );
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}${pathname}`, {
      method: options.method || "GET",
      body: options.body,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Ollama respondeu com status ${response.status}.`);
    }
    return response.json();
  } catch (error) {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      throw new Error(
        reason?.message === "Tempo limite excedido."
          ? reason.message
          : "Operação da IA cancelada.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (requestId) runningRequests.delete(requestId);
  }
}

async function getOllamaStatus() {
  try {
    const data = await ollamaFetch("/api/tags", { timeout: 3_000 });
    return {
      available: true,
      models: (data.models || []).map((model) => ({
        name: model.name || model.model,
        size: model.size || 0,
        modifiedAt: model.modified_at || null,
      })),
    };
  } catch (error) {
    return {
      available: false,
      models: [],
      message: error.message,
    };
  }
}

async function startOllama() {
  try {
    spawn("ollama", ["serve"], {
      detached: true,
      windowsHide: true,
      stdio: "ignore",
    }).unref();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const status = await getOllamaStatus();
      if (status.available) return status;
    }
    return getOllamaStatus();
  } catch (error) {
    return { available: false, models: [], message: error.message };
  }
}

async function chatWithOllama({
  model,
  messages = [],
  format,
  requestId,
  timeout = 120_000,
  options,
} = {}) {
  const status = await getOllamaStatus();
  if (!status.available) {
    throw new Error(
      "O Ollama não está em execução. Inicie o Ollama para usar a IA local.",
    );
  }
  let selectedModel = null;
  if (model) {
    const found = status.models.find(
      (item) =>
        item.name === model ||
        item.name === `${model}:latest` ||
        item.name.startsWith(`${model}:`) ||
        model.startsWith(`${item.name.split(":")[0]}:`),
    );
    if (found) selectedModel = found.name;
  }
  if (!selectedModel) {
    selectedModel = status.models[0]?.name;
  }

  if (!selectedModel) {
    throw new Error(
      "Nenhum modelo está instalado no Ollama. Instale um modelo (ex: 'ollama run deepseek-r1') antes de continuar.",
    );
  }
  let formattedMessages = messages.slice(-16);
  if (selectedModel.toLowerCase().includes("gemma")) {
    if (formattedMessages[0]?.role === "system") {
      const systemContent = formattedMessages[0].content;
      formattedMessages = formattedMessages.slice(1);
      if (formattedMessages.length > 0 && formattedMessages[0].role === "user") {
        formattedMessages[0] = {
          ...formattedMessages[0],
          content: `[INSTRUÇÕES DA IA]\n${systemContent}\n\n[DADOS DO DIÁRIO]\n${formattedMessages[0].content}`,
        };
      } else {
        formattedMessages.unshift({
          role: "user",
          content: `[INSTRUÇÕES DA IA]\n${systemContent}`,
        });
      }
    }
  }

  const data = await ollamaFetch("/api/chat", {
    method: "POST",
    requestId,
    timeout,
    body: JSON.stringify({
      model: selectedModel,
      messages: formattedMessages,
      stream: false,
      keep_alive: "15m",
      ...(format ? { format } : {}),
      options: {
        repeat_penalty: 1.15,
        temperature: 0.6,
        ...(options || {}),
      },
    }),
  });
  return {
    model: selectedModel,
    message: data.message?.content || "",
    doneReason: data.done_reason || null,
  };
}

function cancelOllamaRequest(requestId) {
  const controller = runningRequests.get(requestId);
  if (!controller) return false;
  controller.abort();
  runningRequests.delete(requestId);
  return true;
}

module.exports = {
  cancelOllamaRequest,
  chatWithOllama,
  getOllamaStatus,
  ollamaFetch,
  startOllama,
};
