import { test, expect } from "playwright/test";
import { preparePreview, previewState, storedState } from "./fixtures/calendarPreview.js";
import { readerPdf } from "./fixtures/readerBooks.js";
import fs from "node:fs";

test("Drive público prévia, importação, persistência e sincronização sem duplicação", async ({ page }) => {
  await preparePreview(page, { state: { ...previewState, books: { list: [] } } });
  let downloads = 0;
  await page.route("**/api/public-drive?**", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("action") === "download") {
      downloads++;
      return route.fulfill({ body: readerPdf({ metadata: true }), contentType: "application/pdf" });
    }
    return route.fulfill({ json: { folder: { id: "drive-root", name: "Livros públicos", link: url.searchParams.get("link"), mode: "drive-public-direct" }, files: [{ id: "book1", name: "Livro.pdf", displayPath: "Livro.pdf" }] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await page.getByRole("button", { name: "+ Importar", exact: true }).click();
  await page.getByRole("button", { name: "Google Drive", exact: true }).click();
  const panel = page.getByRole("region", { name: "Biblioteca do Google Drive" });
  await panel.getByLabel("Link público do Google Drive").fill("https://drive.google.com/drive/folders/root");
  await expect(panel.getByText("Configurar acesso à API do Google Drive")).toHaveCount(0);
  await panel.getByRole("button", { name: "Buscar livros" }).click();
  await expect(panel.getByRole("button", { name: "Importar 1 livro(s)" })).toBeVisible();
  expect(downloads).toBe(0);
  await panel.getByRole("button", { name: "Importar 1 livro(s)" }).click();
  await expect(page.getByRole("status")).toContainText("1 adicionado(s)");
  expect((await storedState(page)).books.list).toHaveLength(1);
  await page.reload();
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await page.getByRole("button", { name: "+ Importar", exact: true }).click();
  await page.getByRole("button", { name: "Google Drive", exact: true }).click();
  await panel.getByRole("button", { name: "Buscar novos livros" }).click();
  await panel.getByRole("button", { name: "Importar 1 livro(s)" }).click();
  await expect(page.getByRole("status")).toContainText("1 já na biblioteca");
  expect(downloads).toBe(1);
  expect((await storedState(page)).books.list).toHaveLength(1);
  fs.mkdirSync("qa/book-drive", { recursive: true });
  await page.screenshot({ path: "qa/book-drive/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.getByLabel("Link público do Google Drive")).toBeVisible();
});
