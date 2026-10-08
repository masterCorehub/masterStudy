import { test, expect } from "playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { preparePreview, previewState, storedState } from "./fixtures/calendarPreview.js";
import { readerPdf, metadataEpub } from "./fixtures/readerBooks.js";

test("Desktop folder import persists its link and synchronizes without losing notes or duplicating books", async ({ page }) => {
  await preparePreview(page, { state: { ...previewState, books: { list: [] } } });
  await page.addInitScript(({ pdf, epub }) => {
    const initial = [{ path: "/fixture-books/a.pdf", name: "a.pdf", size: 100, lastModified: 1 }, { path: "/fixture-books/sub/b.epub", name: "b.epub", size: 200, lastModified: 1 }, { path: "/fixture-books/cover.png", name: "cover.png" }];
    const changed = [{ path: "/fixture-books/a.pdf", name: "a.pdf", size: 100, lastModified: 2 }, { path: "/fixture-books/new.pdf", name: "new.pdf", size: 100, lastModified: 1 }];
    window.studyhubDesktop = {
      platform: "darwin",
      selectDirectory: async () => {
        localStorage.setItem("folder-selection-count", String(Number(localStorage.getItem("folder-selection-count") || 0) + 1));
        return { rootName: "Minha biblioteca", dirPath: "/fixture-books", filesList: initial };
      },
      scanDirectory: async () => ({ rootName: "Minha biblioteca", dirPath: "/fixture-books", filesList: localStorage.getItem("folder-scan-round") === "2" ? changed : initial }),
      readFileBinary: async source => new Uint8Array(source.endsWith("epub") ? epub : pdf),
    };
  }, { pdf: [...readerPdf({ metadata: true })], epub: [...await metadataEpub()] });
  await page.goto("/");
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await page.getByRole("button", { name: "+ Importar", exact: true }).click();
  await page.getByRole("button", { name: "Pasta local", exact: true }).click();
  await page.getByRole("button", { name: "Importar pasta", exact: true }).click();
  await page.getByRole("button", { name: "Importar 2 livro(s)", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2 adicionado(s)");
  assert.equal((await storedState(page)).books.list.length, 2);
  await page.getByRole("button", { name: "Sincronizar pasta", exact: true }).click();
  await page.getByRole("button", { name: "Importar 2 livro(s)", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("0 adicionado(s)");
  assert.equal((await storedState(page)).books.list.length, 2);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("studyhub-storage-v2"));
    const book = state.state.books.list.find(book => book.filePath.endsWith("a.pdf"));
    Object.assign(book, { title: "Meu livro personalizado", status: "READING", notes: [{ id: "keep", content: "Anotação importante" }], lastPosition: { page: 2 } });
    localStorage.setItem("studyhub-storage-v2", JSON.stringify(state));
    localStorage.setItem("folder-scan-round", "2");
  });
  await page.reload();
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await page.getByRole("button", { name: "+ Importar", exact: true }).click();
  await page.getByRole("button", { name: "Pasta local", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pasta: Minha biblioteca" })).toBeVisible();
  await page.getByRole("button", { name: "Sincronizar pasta", exact: true }).click();
  await page.getByRole("button", { name: "Importar 2 livro(s)", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1 adicionado(s) · 1 atualizado(s)");
  const books = (await storedState(page)).books.list;
  assert.equal(books.length, 3);
  const original = books.find(book => book.filePath.endsWith("a.pdf"));
  assert.equal(original.title, "Meu livro personalizado");
  assert.equal(original.notes[0].content, "Anotação importante");
  assert.equal(original.lastPosition.page, 2);
  assert.equal(books.find(book => book.filePath.endsWith("epub")).libraryMissing, true);
  assert.equal(await page.evaluate(() => localStorage.getItem("folder-selection-count")), "1");
  fs.mkdirSync("qa/book-folder", { recursive: true });
  await page.screenshot({ path: "qa/book-folder/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Sincronizar pasta", exact: true })).toBeVisible();
});

test("Web folder selection imports files and reselecting the same directory does not duplicate", async ({ page }) => {
  const folderPath = fs.mkdtempSync(path.join(os.tmpdir(), "masterstudy-library-"));
  fs.mkdirSync(path.join(folderPath, "sub"));
  fs.writeFileSync(path.join(folderPath, "a.pdf"), readerPdf({ metadata: true }));
  fs.writeFileSync(path.join(folderPath, "sub", "b.epub"), await metadataEpub());
  fs.writeFileSync(path.join(folderPath, "ignored.txt"), "Ignored");
  await preparePreview(page, { state: { ...previewState, books: { list: [] } } });
  await page.addInitScript(() => { window.showDirectoryPicker = undefined; });
  await page.goto("/");
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await page.getByRole("button", { name: "+ Importar", exact: true }).click();
  await page.getByRole("button", { name: "Pasta local", exact: true }).click();
  await page.getByLabel("Pasta de livros", { exact: true }).setInputFiles(folderPath);
  await page.getByRole("button", { name: "Importar 2 livro(s)", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2 adicionado(s)");
  const books = (await storedState(page)).books.list;
  assert.equal(books.length, 2);
  assert.ok(books.every(book => book.filePath.startsWith("book-file://")));
  await page.reload();
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await page.getByRole("button", { name: "+ Importar", exact: true }).click();
  await page.getByRole("button", { name: "Pasta local", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sincronizar pasta", exact: true })).toBeVisible();
  await page.getByLabel("Pasta de livros", { exact: true }).setInputFiles(folderPath);
  await page.getByRole("button", { name: "Importar 2 livro(s)", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("0 adicionado(s) · 0 atualizado(s) · 2 já na biblioteca");
  assert.deepEqual((await storedState(page)).books.list.map(book => book.id), books.map(book => book.id));
});
