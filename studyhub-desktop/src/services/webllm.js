// Modelo leve para a web: aproximadamente 0,5B parâmetros e menor download.
// O modelo de 1B continua disponível como alternativa de maior qualidade.
export const WEBLLM_DEFAULT_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
export const WEBLLM_QUALITY_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const enginePromises = new Map();

export function isWebLlmAvailable() {
  return typeof window !== "undefined" && "gpu" in navigator;
}

export async function initializeWebLLM(onProgress, model = WEBLLM_DEFAULT_MODEL) {
  if (!isWebLlmAvailable()) {
    throw new Error("Seu navegador não oferece WebGPU para executar a IA local.");
  }
  if (!enginePromises.has(model)) {
    const enginePromise = import("@mlc-ai/web-llm")
      .then(({ CreateMLCEngine }) =>
        CreateMLCEngine(model, {
          initProgressCallback: onProgress,
        }),
      )
      .catch((error) => {
        enginePromises.delete(model);
        throw error;
      });
    enginePromises.set(model, enginePromise);
  }
  return enginePromises.get(model);
}

export async function askWithWebLLM({ system = "", prompt, history = [], onProgress, model = WEBLLM_DEFAULT_MODEL }) {
  const engine = await initializeWebLLM(onProgress, model);
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    ...history,
    { role: "user", content: prompt },
  ];
  const result = await engine.chat.completions.create({ messages, temperature: 0.35, max_tokens: 1400 });
  return result.choices?.[0]?.message?.content?.trim() || "A IA não retornou uma resposta.";
}
