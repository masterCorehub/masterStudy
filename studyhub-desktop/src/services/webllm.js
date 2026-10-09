import { collaborationCloud } from "./collaboration-cloud.js";

// Kept as compatibility names for callers; web inference now stays server-side.
export const WEBLLM_DEFAULT_MODEL = "MasterStudy AI";
export const WEBLLM_QUALITY_MODEL = WEBLLM_DEFAULT_MODEL;

export function isWebLlmAvailable() {
  return typeof window !== "undefined" && /^https?:$/.test(window.location.protocol);
}

export async function initializeWebLLM(onProgress) {
  if (!isWebLlmAvailable()) {
    throw new Error("A IA web só fica disponível na versão publicada do masterStudy.");
  }
  const session = await collaborationCloud.getSession();
  if (!session?.access_token) throw new Error("Entre na sua conta para usar a IA do masterStudy.");
  onProgress?.({ progress: 1, text: "Conectando à IA do masterStudy…" });
  const response = await fetch("/api/study-ai", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "A IA web ainda não está disponível.");
  return { model: result.model || WEBLLM_DEFAULT_MODEL, provider: result.provider || "masterStudy" };
}

export async function askWithWebLLM({ system = "", prompt, history = [], onProgress, format }) {
  if (!isWebLlmAvailable()) throw new Error("A IA web só fica disponível na versão publicada do masterStudy.");
  const session = await collaborationCloud.getSession();
  if (!session?.access_token) throw new Error("Entre na sua conta para usar a IA do masterStudy.");
  onProgress?.({ progress: 0, text: "Enviando para a IA do masterStudy…" });
  const response = await fetch("/api/study-ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ system, prompt, history: history.slice(-10), format }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível gerar a resposta.");
  onProgress?.({ progress: 1, text: "Resposta pronta." });
  return result.content || "A IA não retornou uma resposta.";
}
