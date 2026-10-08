import { allBookCategories } from "./bookCategories.js";

const unwrapJson = value => String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

export function parseBookCategorization(raw, books, categories) {
  let data;
  try {
    data = JSON.parse(unwrapJson(raw));
  } catch {
    throw new Error("A IA retornou uma resposta inválida. Tente categorizar novamente.");
  }
  const suggestions = Array.isArray(data) ? data : data?.suggestions;
  if (!Array.isArray(suggestions)) throw new Error("A IA não retornou sugestões de categoria.");
  const bookIds = new Set(books.map(book => book.id));
  const categoryIds = new Set(allBookCategories(categories).map(category => category.id));
  const seen = new Set();
  return suggestions.filter(item => {
    const bookId = String(item?.bookId || "");
    const categoryId = item?.categoryId == null ? null : String(item.categoryId);
    if (!bookIds.has(bookId) || seen.has(bookId) || (categoryId && !categoryIds.has(categoryId))) return false;
    seen.add(bookId);
    return true;
  }).map(item => ({
    bookId: String(item.bookId),
    categoryId: item.categoryId == null ? null : String(item.categoryId),
    confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
    reason: String(item.reason || "Sugestão baseada no título e autor.").trim().slice(0, 240),
  }));
}

export function bookCategorizationPrompt(books, categories) {
  const categoryLines = allBookCategories(categories).map(category => `${category.id}: ${category.name}`).join("\n");
  const bookLines = books.map(book => JSON.stringify({ id: book.id, title: book.title, author: book.author, description: book.summary, tags: book.tags })).join("\n");
  return `Categorize os livros abaixo usando SOMENTE uma das categorias listadas. Responda apenas JSON válido no formato {"suggestions":[{"bookId":"id","categoryId":"category-id ou null","confidence":0.0,"reason":"motivo curto"}]}. Inclua uma sugestão para cada livro. Não crie categorias novas e use null quando não houver evidência suficiente.\n\nCATEGORIAS:\n${categoryLines}\n\nLIVROS:\n${bookLines}`;
}
