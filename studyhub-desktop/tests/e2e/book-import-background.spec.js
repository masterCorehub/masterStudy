import { test, expect } from "playwright/test";
import { preparePreview, previewState, storedState } from "./fixtures/calendarPreview.js";
import { readerPdf } from "./fixtures/readerBooks.js";
import fs from "node:fs";

test("seleção parcial continua importando após fechar a janela e mudar de tela", async ({ page }) => {
  await preparePreview(page, { state: { ...previewState, books: { list: [] } } });
  const downloads = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/api/public-drive?**", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("action") === "download") {
      downloads.push(url.searchParams.get("id"));
      await gate;
      return route.fulfill({ body: readerPdf({ metadata: true }), contentType: "application/pdf" });
    }
    return route.fulfill({ json: { folder: { id: "drive-root", name: "Biblioteca", link: url.searchParams.get("link"), mode: "drive-public-direct" }, files: [1,2,3].map(id => ({ id: `book${id}`, name: `Livro ${id}.pdf`, displayPath: `Livro ${id}.pdf` })) } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await page.getByRole("button", { name: "+ Importar", exact: true }).click();
  await page.getByRole("button", { name: "Google Drive", exact: true }).click();
  await page.getByLabel("Link público do Google Drive").fill("https://drive.google.com/drive/folders/root");
  await page.getByRole("button", { name: "Buscar livros", exact: true }).click();
  await page.getByRole("checkbox", { name: "Livro 2.pdf", exact: true }).uncheck();
  await expect(page.getByText("2 de 3 selecionado(s)")).toBeVisible();
  fs.mkdirSync("qa/book-import-background", { recursive: true });
  await page.screenshot({ path: "qa/book-import-background/selection.png" });
  await page.getByRole("button", { name: "Importar 2 livro(s)", exact: true }).click();
  await expect(page.getByText("Importando livros", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fechar importação", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.getByText("Importando livros", { exact: true })).toBeVisible();
  await page.screenshot({ path: "qa/book-import-background/navigation.png" });
  release();
  await expect(page.getByText("Importação concluída", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("2 adicionado(s)");
  expect(downloads).toEqual(["book1", "book3"]);
  expect((await storedState(page)).books.list).toHaveLength(2);
});
