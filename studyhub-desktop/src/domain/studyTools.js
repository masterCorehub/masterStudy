const prompts = {
  guide:
    "Gere um guia de estudo em Markdown com conceitos, exemplos, glossário e dicas de exame.",
  summary:
    "Gere um resumo em Markdown com os conceitos essenciais e suas relações.",
  plan: "Gere um plano de revisão em Markdown organizado por sessões e exercícios.",
  flashcards:
    'Gere 8 flashcards objetivos. Retorne somente JSON: {"cards":[{"front":"pergunta","back":"resposta"}]}.',
  quiz: 'Gere 5 questões. Retorne somente JSON: {"questions":[{"question":"pergunta","options":["A","B","C","D"],"correctIndex":0,"explanation":"explicação"}]}. correctIndex começa em zero.',
  mindmap:
    'Gere um mapa mental hierárquico. Retorne somente JSON: {"label":"tema central","children":[{"label":"conceito","children":[{"label":"detalhe"}]}]}. Use conceitos específicos das fontes, com rótulos curtos e até 4 níveis.',
};
export const isStructuredStudyTool = (kind) =>
  ["flashcards", "quiz", "mindmap"].includes(kind);
export function studyToolPrompt(kind) {
  if (!prompts[kind]) throw new Error("Ferramenta de estudo inválida.");
  return `${prompts[kind]} Responda em Português do Brasil. Use os materiais fornecidos; não invente conteúdo ou trate nomes de arquivos como se fossem seu conteúdo.`;
}

function readJson(raw) {
  // Aceita JSON puro e blocos Markdown; não usa eval em conteúdo gerado por IA.
  const text = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "A IA retornou um formato inválido. Tente gerar novamente.",
    );
  }
}
const hasText = (value) => typeof value === "string" && value.trim().length > 0;
export function parseStudyTool(kind, raw) {
  if (!isStructuredStudyTool(kind)) {
    if (!hasText(raw)) throw new Error("A IA não retornou conteúdo.");
    return { type: "text", text: raw };
  }
  const data = readJson(raw);
  if (kind === "flashcards") {
    const cards = Array.isArray(data) ? data : data?.cards;
    if (
      !Array.isArray(cards) ||
      !cards.length ||
      !cards.every((c) => hasText(c?.front) && hasText(c?.back))
    ) {
      throw new Error(
        "Os flashcards retornados precisam conter pergunta e resposta. Tente novamente.",
      );
    }
    return {
      type: kind,
      cards: cards.map((c) => ({ front: c.front.trim(), back: c.back.trim() })),
    };
  }
  if (kind === "quiz") {
    const questions = Array.isArray(data) ? data : data?.questions;
    if (
      !Array.isArray(questions) ||
      !questions.length ||
      !questions.every(
        (q) =>
          hasText(q?.question) &&
          Array.isArray(q.options) &&
          q.options.length >= 2 &&
          q.options.every(hasText) &&
          Number.isInteger(q.correctIndex) &&
          q.correctIndex >= 0 &&
          q.correctIndex < q.options.length,
      )
    ) {
      throw new Error(
        "O quiz retornado tem perguntas ou alternativas inválidas. Tente novamente.",
      );
    }
    return { type: kind, questions };
  }
  let count = 0;
  const validateNode = (node, depth = 0) => {
    // Limita a árvore para evitar respostas enormes ou recursão excessiva.
    if (
      ++count > 100 ||
      depth > 4 ||
      !hasText(node?.label) ||
      (node.children !== undefined && !Array.isArray(node.children))
    ) {
      throw new Error(
        "O mapa mental retornado tem uma hierarquia inválida. Tente novamente.",
      );
    }
    return {
      label: node.label.trim(),
      children: (node.children || []).map((child) =>
        validateNode(child, depth + 1),
      ),
    };
  };
  const root = validateNode(data);
  if (!root.children.length)
    throw new Error(
      "O mapa mental retornado não contém ramificações. Tente novamente.",
    );
  return { type: kind, root };
}
