import test from "node:test";
import assert from "node:assert/strict";
import { bookCategorizationPrompt, parseBookCategorization } from "./bookCategorization.js";

const books = [{ id: "b1", title: "O tempo", author: "A" }, { id: "b2", title: "Código", author: "B" }];
const categories = [{ id: "custom", name: "Estudo", custom: true }];

test("valida sugestões de categorização e ignora IDs desconhecidos", () => {
  const result = parseBookCategorization(JSON.stringify({ suggestions: [
    { bookId: "b1", categoryId: "category-fiction", confidence: 0.9, reason: "tema narrativo" },
    { bookId: "unknown", categoryId: "custom" },
    { bookId: "b2", categoryId: "inventada" },
  ] }), books, categories);
  assert.deepEqual(result, [{ bookId: "b1", categoryId: "category-fiction", confidence: 0.9, reason: "tema narrativo" }]);
});

test("prompt inclui somente livros e categorias disponíveis", () => {
  const prompt = bookCategorizationPrompt(books, categories);
  assert.match(prompt, /category-fiction: Ficção/);
  assert.match(prompt, /\"id\":\"b1\"/);
  assert.match(prompt, /Não crie categorias novas/);
});
