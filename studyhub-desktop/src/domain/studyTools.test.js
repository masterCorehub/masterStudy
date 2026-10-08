import test from "node:test";
import assert from "node:assert/strict";
import { parseStudyTool, studyToolPrompt } from "./studyTools.js";

test("aceita cartões como objeto Gemini, lista e bloco Markdown", () => {
  const cards = [{ front: "O que é uma pilha?", back: "Estrutura LIFO." }];
  for (const raw of [
    JSON.stringify(cards),
    JSON.stringify({ cards }),
    "```json\n" + JSON.stringify({ cards }) + "\n```",
  ]) {
    assert.deepEqual(parseStudyTool("flashcards", raw), {
      type: "flashcards",
      cards,
    });
  }
});
test("rejeita cartões vazios ou incompletos antes de renderizar", () => {
  for (const raw of [
    "{}",
    "[]",
    '{"cards":[{"front":"Pergunta"}]}',
    "resposta incompleta",
  ]) {
    assert.throws(() => parseStudyTool("flashcards", raw));
  }
});
test("quiz exige índice de resposta válido", () => {
  const question = {
    question: "Qual é LIFO?",
    options: ["Pilha", "Fila"],
    correctIndex: 0,
  };
  assert.equal(
    parseStudyTool("quiz", JSON.stringify({ questions: [question] })).questions
      .length,
    1,
  );
  assert.throws(() =>
    parseStudyTool("quiz", JSON.stringify([{ ...question, correctIndex: 2 }])),
  );
});
test("mapa mental preserva hierarquia e rejeita mapa sem conceitos", () => {
  const root = {
    label: "Estruturas",
    children: [{ label: "Pilha", children: [{ label: "LIFO" }] }],
  };
  const parsed = parseStudyTool("mindmap", JSON.stringify(root));
  assert.equal(parsed.root.children[0].children[0].label, "LIFO");
  assert.throws(() => parseStudyTool("mindmap", '{"label":"Tema"}'));
  assert.throws(() =>
    parseStudyTool("mindmap", '{"label":"Tema","children":"inválido"}'),
  );
});
test("cada ferramenta usa instrução própria e texto vazio falha", () => {
  assert.match(studyToolPrompt("plan"), /plano de revisão/);
  assert.match(studyToolPrompt("mindmap"), /mapa mental/);
  assert.throws(() => parseStudyTool("summary", ""));
});
