import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BOOK_CATEGORIES, allBookCategories, validateBookCategoryName, booksInCategory, removeBookCategory, migrateBookCategories } from "./bookCategories.js";
test("oferece categorias prontas e valida categorias personalizadas", () => {
  assert.ok(DEFAULT_BOOK_CATEGORIES.some(item => item.name === "Romance"));
  assert.ok(DEFAULT_BOOK_CATEGORIES.some(item => item.name === "Ficção"));
  assert.equal(validateBookCategoryName(allBookCategories([]), "  Desenvolvimento   pessoal "), "Desenvolvimento pessoal");
  assert.throws(() => validateBookCategoryName(allBookCategories([]), "ficcao"));
});
test("filtra categorias e mantém registros desconhecidos em Sem categoria", () => {
  const books = [{ id: "1", categoryId: "category-romance" }, { id: "2" }, { id: "3", categoryId: "apagada" }];
  assert.equal(booksInCategory(books, allBookCategories([]), "category-romance").length, 1);
  assert.equal(booksInCategory(books, allBookCategories([]), "uncategorized").length, 2);
});
test("excluir categoria personalizada preserva o livro e seus dados", () => {
  const book = { id: "1", categoryId: "custom", notes: [{ content: "Nota" }], lastPosition: { page: 4 } };
  const result = removeBookCategory([{ id: "custom", name: "Minha" }], [book], "custom");
  assert.equal(result.bookCategories.length, 0); assert.equal(result.books.list[0].categoryId, null);
  assert.equal(result.books.list[0].notes, book.notes); assert.equal(result.books.list[0].lastPosition.page, 4);
});
test("migra pastas antigas para categorias sem duplicar categorias prontas", () => {
  const result = migrateBookCategories({ bookFolders: [{ id: "a", name: "Romance" }, { id: "b", name: "Faculdade" }], books: { list: [{ id: "1", folderId: "a" }, { id: "2", folderId: "b" }] } });
  assert.equal(result.bookCategories.length, 1);
  assert.equal(result.books.list[0].categoryId, "category-romance");
  assert.equal(result.books.list[1].categoryId, `category-custom-b`);
});
