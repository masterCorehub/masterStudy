import test from "node:test";
import assert from "node:assert/strict";
import { syncBookLibrary } from "./book-library.js";

test("sincronização remota não baixa livros inalterados e isola erro de download", async () => {
  const books = [{ id: "existing", librarySource: { folderId: "drive-root", relativePath: "stable", size: 4, lastModified: 0 } }];
  const files = [
    { name: "same.pdf", relativePath: "stable", size: 4, lastModified: 0, loadSource: () => { throw new Error("não deve baixar"); } },
    { name: "bad.pdf", relativePath: "bad", loadSource: () => { throw new Error("download bloqueado"); } },
    { name: "good.epub", relativePath: "good", loadSource: async () => new File(["ok"], "good.epub") },
  ];
  const result = await syncBookLibrary({ id: "drive-root" }, files, {
    getBooks: () => books, addBook: book => books.push(book), updateBook: () => {},
    extractMetadata: async () => ({ title: "Livro" }), retainFile: async () => "book-file://saved",
  });
  assert.equal(result.unchanged, 1); assert.equal(result.added, 1); assert.equal(result.errors.length, 1);
});
