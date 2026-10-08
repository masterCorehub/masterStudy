import test from "node:test";
import assert from "node:assert/strict";
import { syncBookLibrary, nativeFolderFiles, uploadedFolderFiles, readFolderFiles } from "./book-library.js";

const file = (relativePath, modified = 1) => ({ name: relativePath.split("/").pop(), relativePath, source: `/books/${relativePath}`, size: 100, lastModified: modified });
function fixture(initial = []) {
  const books = structuredClone(initial);
  let reads = 0;
  const options = {
    getBooks: () => books,
    addBook: book => books.push(book),
    updateBook: (id, updates) => Object.assign(books.find(book => book.id === id), updates),
    extractMetadata: async (_source, name) => {
      reads++;
      if (name === "broken.epub") throw new Error("Arquivo inválido");
      return { title: name, author: "Autor", fileType: name.endsWith("epub") ? "epub" : "pdf", totalPages: 10, coverUrl: "data:image/jpeg;base64,AAA", pageCountSource: "pdf" };
    },
    retainFile: async source => source,
  };
  return { books, options, reads: () => reads };
}
const folder = { id: "folder-one" };

test("seleção parcial não marca como ausente um livro desmarcado", async () => {
  const state = fixture();
  const scan = [file("a.pdf"), file("b.epub")];
  await syncBookLibrary(folder, scan, state.options);
  const report = await syncBookLibrary(folder, [scan[0]], { ...state.options, scanFiles: scan });
  assert.equal(report.missing, 0);
  assert.equal(state.books.find(book => book.title === "b.epub").libraryMissing, false);
});

test("importa formatos suportados e subpastas; sincronizar novamente não duplica nem relê", async () => {
  const state = fixture();
  const files = [file("a.epub"), file("sub/b.pdf"), file("image.png"), file("a.epub")];
  assert.equal((await syncBookLibrary(folder, files, state.options)).added, 2);
  assert.equal(state.books.length, 2);
  const report = await syncBookLibrary(folder, [...files, file("new.epub")], state.options);
  assert.equal(report.added, 1);
  assert.equal(report.unchanged, 2);
  assert.equal(state.reads(), 3);
});

test("atualiza arquivo alterado preservando nome editado, capa manual, progresso e notas", async () => {
  const state = fixture();
  await syncBookLibrary(folder, [file("a.epub")], state.options);
  const book = state.books[0];
  Object.assign(book, { title: "Meu título", author: "Meu autor", coverSource: "manual", coverUrl: "manual.jpg", lastPosition: { percent: 37 }, notes: [{ id: "note" }], status: "READING" });
  const report = await syncBookLibrary(folder, [file("a.epub", 2)], state.options);
  assert.equal(report.updated, 1);
  assert.equal(book.title, "Meu título");
  assert.equal(book.author, "Meu autor");
  assert.equal(book.coverUrl, "manual.jpg");
  assert.equal(book.lastPosition.percent, 37);
  assert.equal(book.notes[0].id, "note");
  assert.equal(book.status, "READING");
});

test("arquivos ausentes e inválidos não removem livros; reaparecimento limpa o aviso", async () => {
  const state = fixture();
  await syncBookLibrary(folder, [file("a.pdf")], state.options);
  const report = await syncBookLibrary(folder, [file("broken.epub"), file("good.pdf")], state.options);
  assert.equal(report.errors.length, 1);
  assert.equal(report.added, 1);
  assert.equal(report.missing, 1);
  assert.equal(state.books.length, 2);
  assert.equal(state.books[0].libraryMissing, true);
  await syncBookLibrary(folder, [file("a.pdf"), file("good.pdf")], state.options);
  assert.equal(state.books[0].libraryMissing, false);
});

test("adota livro já cadastrado pelo mesmo caminho sem duplicar", async () => {
  const state = fixture([{ id: "existing", filePath: "/books/a.pdf", title: "Personalizado", lastPosition: { page: 3 } }]);
  const report = await syncBookLibrary(folder, [file("a.pdf")], state.options);
  assert.equal(report.unchanged, 1);
  assert.equal(state.books.length, 1);
  assert.equal(state.books[0].librarySource.folderId, folder.id);
  assert.equal(state.books[0].lastPosition.page, 3);
});

test("normaliza caminhos de pasta do desktop e arquivos do navegador", () => {
  const native = nativeFolderFiles({ dirPath: "/books", filesList: [{ path: "/books/sub/a.epub", name: "a.epub" }] });
  assert.equal(native[0].relativePath, "sub/a.epub");
  const browser = uploadedFolderFiles([{ name: "a.epub", webkitRelativePath: "Books/sub/a.epub", size: 10, lastModified: 1 }]);
  assert.equal(browser[0].relativePath, "sub/a.epub");
});

test("acesso persistente do navegador percorre subpastas e solicita permissão", async () => {
  let requested = false;
  const directory = (name, children) => ({ name, kind: "directory", async *values() { yield* children; } });
  const book = { name: "a.epub", kind: "file", getFile: async () => ({ name: "a.epub", size: 20, lastModified: 1 }) };
  const handle = directory("Books", [directory("sub", [book]), directory(".hidden", [book]), { name: "ignored.txt", kind: "file" }]);
  handle.queryPermission = async () => "prompt";
  handle.requestPermission = async () => { requested = true; return "granted"; };
  const files = await readFolderFiles({ mode: "browser-handle", handle });
  assert.equal(requested, true);
  assert.equal(files.length, 1);
  assert.equal(files[0].relativePath, "sub/a.epub");
  handle.requestPermission = async () => "denied";
  await assert.rejects(readFolderFiles({ mode: "browser-handle", handle }), /Autorize/);
});
