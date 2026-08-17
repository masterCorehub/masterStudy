import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getLocalDateKey } from "../utils/dateUtils.js";

export const dailyProgrammingChallenges = [
  { id: "logic-variables", language: "Lógica", level: "Iniciante", title: "Troque dois valores", concept: "Variáveis e estado", prompt: "Explique e escreva uma solução que troque os valores de A e B. Depois tente uma versão usando uma variável auxiliar.", hint: "Guarde o valor de A antes de sobrescrevê-lo.", example: "Entrada: A=3, B=8 → Saída: A=8, B=3" },
  { id: "csharp-palindrome", language: "C#", level: "Iniciante", title: "Detector de palíndromo", concept: "Strings e comparação", prompt: "Leia uma palavra e informe se ela é igual quando lida de trás para frente. Ignore maiúsculas e minúsculas.", hint: "Normalize com ToLower e compare com a sequência invertida.", example: "Entrada: Arara → Saída: Palíndromo" },
  { id: "js-frequency", language: "JavaScript", level: "Intermediário", title: "Frequência de palavras", concept: "Objetos e coleções", prompt: "Receba uma frase e crie um objeto mostrando quantas vezes cada palavra aparece.", hint: "Use split, reduce e um objeto acumulador.", example: "'código bom código' → { código: 2, bom: 1 }" },
  { id: "debug-off-by-one", language: "Depuração", level: "Iniciante", title: "Encontre o off-by-one", concept: "Laços e limites", prompt: "Um laço deveria visitar todos os itens de uma lista, mas ignora o último. Descreva a causa e escreva a condição correta.", hint: "Compare índice inicial, tamanho e o operador usado na condição.", example: "for (int i = 0; i < itens.Count; i++)" },
  { id: "csharp-fizzbuzz", language: "C#", level: "Iniciante", title: "FizzBuzz com clareza", concept: "Condições e módulo", prompt: "Mostre os números de 1 a 30. Para múltiplos de 3 mostre Fizz, de 5 mostre Buzz e de ambos mostre FizzBuzz.", hint: "Teste a condição mais específica primeiro.", example: "3 → Fizz, 5 → Buzz, 15 → FizzBuzz" },
  { id: "api-design", language: "Design", level: "Intermediário", title: "Modele uma API de tarefas", concept: "Responsabilidade e contratos", prompt: "Desenhe quatro endpoints para listar, criar, concluir e excluir tarefas. Defina método HTTP, rota, entrada e resposta.", hint: "Comece pelos recursos e use verbos HTTP para representar ações.", example: "POST /tasks → 201 Created" },
  { id: "csharp-linq", language: "C#", level: "Intermediário", title: "Ranking com LINQ", concept: "Coleções e LINQ", prompt: "A partir de uma lista de alunos e notas, filtre aprovados, ordene da maior nota para a menor e mostre os três primeiros.", hint: "Combine Where, OrderByDescending e Take.", example: "alunos.Where(...).OrderByDescending(...).Take(3)" },
];

export const getProgrammingDayKey = (date = new Date()) => getLocalDateKey(date);
export const getDailyProgrammingChallenge = (date = new Date()) => {
  const start = Date.UTC(2026, 0, 1);
  const day = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
  return dailyProgrammingChallenges[((day % dailyProgrammingChallenges.length) + dailyProgrammingChallenges.length) % dailyProgrammingChallenges.length];
};

export const useProgrammingStore = create(persist((set) => ({
  completions: {},
  drafts: {},
  saveDraft: (challengeId, value) => set((state) => ({ drafts: { ...state.drafts, [challengeId]: String(value || "").slice(0, 12000) } })),
  completeChallenge: (challengeId, reflection = "") => set((state) => ({
    completions: { ...state.completions, [getProgrammingDayKey()]: { challengeId, reflection: String(reflection).slice(0, 2000), completedAt: Date.now() } },
  })),
}), { name: "studyhub-programming-v1", version: 1 }));
