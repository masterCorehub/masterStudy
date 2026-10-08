import { test, expect } from "playwright/test";
import { preparePreview, previewState, storedState } from "./fixtures/calendarPreview.js";
import { readerPdf } from "./fixtures/readerBooks.js";
import fs from "node:fs";

test("categorias prontas e personalizadas filtram livros e preservam dados", async ({ page }) => {
  await preparePreview(page, { state: { ...previewState, books: { list: [{ id: "one", title: "Livro teste", author: "Autor", status: "TO READ", notes: [{ content: "Minha nota" }], lastPosition: { page: 3 } }] }, bookCategories: [] } });
  await page.goto("/");
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await expect(page.getByRole("button", { name: /Romance 0/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ficção 0/ })).toBeVisible();
  await page.getByLabel("Categoria de Livro teste").selectOption("category-romance");
  await page.getByRole("button", { name: /Romance 1/ }).click();
  await expect(page.getByLabel("Categoria de Livro teste")).toBeVisible();
  await page.getByRole("button", { name: "+ Criar categoria" }).click();
  await page.getByLabel("Nome da categoria").fill("Faculdade");
  await page.getByRole("button", { name: "Salvar categoria" }).click();
  const categoryId = (await storedState(page)).bookCategories[0].id;
  await page.getByRole("button", { name: /Todas 1/ }).click();
  await page.getByLabel("Categoria de Livro teste").selectOption(categoryId);
  await page.getByRole("button", { name: /Faculdade 1/ }).click();
  await page.getByRole("button", { name: "Renomear categoria" }).click();
  await page.getByLabel("Nome da categoria").fill("Leituras acadêmicas");
  await page.getByRole("button", { name: "Salvar categoria" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await page.getByRole("button", { name: /Leituras acadêmicas 1/ }).click();
  await expect(page.getByLabel("Categoria de Livro teste")).toBeVisible();
  while (await page.getByTitle("Dispensar alerta", { exact: true }).count()) await page.getByTitle("Dispensar alerta", { exact: true }).first().click();
  await page.setViewportSize({ width: 1280, height: 1000 });
  fs.mkdirSync("qa/book-organization", { recursive: true });
  await page.screenshot({ path: "qa/book-organization/categories.png" });
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Excluir categoria" }).click();
  const state = await storedState(page);
  expect(state.bookCategories).toHaveLength(0);
  expect(state.books.list[0].categoryId).toBeNull();
  expect(state.books.list[0].notes[0].content).toBe("Minha nota");
  expect(state.books.list[0].lastPosition.page).toBe(3);
});

test("importação em lote usa a categoria selecionada e sincronização não a altera", async ({ page }) => {
  await preparePreview(page, { state: { ...previewState, books: { list: [] }, bookCategories: [] } });
  await page.addInitScript(pdf => {
    window.studyhubDesktop = {
      selectDirectory: async () => ({ rootName: "Arquivos", dirPath: "/books", filesList: [{ path: "/books/livro.pdf", name: "livro.pdf", size: 100, lastModified: 1 }] }),
      scanDirectory: async () => ({ dirPath: "/books", filesList: [{ path: "/books/livro.pdf", name: "livro.pdf", size: 100, lastModified: 1 }] }),
      readFileBinary: async () => new Uint8Array(pdf),
    };
  }, [...readerPdf({ metadata: true })]);
  await page.goto("/");
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  // Fechar lembretes como um usuário antes de interagir com o filtro atrás deles.
  while (await page.getByTitle("Dispensar alerta", { exact: true }).count()) {
    await page.getByTitle("Dispensar alerta", { exact: true }).first().click();
  }
  await page.getByRole("button", { name: /Tecnologia 0/ }).click();
  await page.getByRole("button", { name: "+ Importar", exact: true }).click();
  await page.getByRole("button", { name: "Pasta local", exact: true }).click();
  await page.getByRole("button", { name: "Importar pasta", exact: true }).click();
  await page.getByRole("button", { name: "Importar 1 livro(s)", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1 adicionado(s)");
  expect((await storedState(page)).books.list[0].categoryId).toBe("category-technology");
  await page.getByRole("button", { name: "Fechar importação" }).click();
  await page.getByRole("button", { name: /Todas 1/ }).click();
  await page.getByRole("button", { name: "+ Importar", exact: true }).click();
  await page.getByRole("button", { name: "Pasta local", exact: true }).click();
  await page.getByRole("button", { name: "Sincronizar pasta", exact: true }).click();
  await page.getByRole("button", { name: "Importar 1 livro(s)", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1 já na biblioteca");
  expect((await storedState(page)).books.list[0].categoryId).toBe("category-technology");
});

test("migra uma pasta interna antiga para categoria personalizada", async ({ page }) => {
  await preparePreview(page, { state: { ...previewState, books: { list: [{ id: "old", title: "Antigo", status: "TO READ", folderId: "folder-old" }] }, bookFolders: [{ id: "folder-old", name: "Clássicos" }] } });
  await page.goto("/");
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await expect(page.getByRole("button", { name: /Clássicos 1/ })).toBeVisible();
  const state = await storedState(page);
  expect(state.bookCategories[0].name).toBe("Clássicos");
  expect(state.books.list[0].categoryId).toBe(state.bookCategories[0].id);
});
