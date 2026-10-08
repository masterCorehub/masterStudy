import { test, expect } from "playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  preparePreview,
  previewState,
  storedState,
} from "./fixtures/calendarPreview.js";
import { readerPdf, metadataEpub } from "./fixtures/readerBooks.js";

async function library(page) {
  await preparePreview(page, {
    state: { ...previewState, books: { list: [] } },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await page
    .getByRole("button", { name: "Adicionar Livro", exact: true })
    .first()
    .click();
  return page.getByRole("form", { name: "Cadastrar livro" });
}

test("PDF import extracts title, author, exact pages and a persistent first-page cover", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 980 });
  const form = await library(page);
  await form.getByLabel("Arquivo do livro").setInputFiles({
    name: "journey.pdf",
    mimeType: "application/pdf",
    buffer: readerPdf({ metadata: true }),
  });
  await expect(form.getByRole("status")).toContainText(
    "Dados do arquivo preenchidos",
  );
  await expect(form.getByLabel("Título *", { exact: true })).toHaveValue(
    "A journey through books",
  );
  await expect(form.getByLabel("Autor", { exact: true })).toHaveValue(
    "MasterStudy Library",
  );
  await expect(form.getByLabel("Total de páginas (opcional)")).toHaveValue("3");
  await expect(form.getByAltText("Capa extraída do livro")).toBeVisible();
  fs.mkdirSync("qa/book-import", { recursive: true });
  await page.screenshot({ path: "qa/book-import/pdf-autofill.png" });
  await form.getByRole("button", { name: "Salvar Livro" }).click();
  // Saving includes an async IndexedDB transaction for the uploaded file.
  await expect(form).toHaveCount(0);
  const book = (await storedState(page)).books.list[0];
  assert.equal(book.totalPages, 3);
  assert.match(book.coverUrl, /^data:image\/jpeg/);
  assert.match(book.filePath, /^book-file:\/\//);
  await page.reload();
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await expect(
    page.getByText("A journey through books", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continuar Lendo", exact: true })
    .click();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .first()
        .evaluate((canvas) => canvas.width),
    )
    .toBeGreaterThan(100);
  assert.deepEqual(errors, []);
});

for (const version of [2, 3])
  test(`EPUB ${version} uses the embedded cover and never invents pages`, async ({
    page,
  }) => {
    const form = await library(page);
    await form.getByLabel("Arquivo do livro").setInputFiles({
      name: "arte.epub",
      mimeType: "application/epub+zip",
      buffer: await metadataEpub({ version }),
    });
    await expect(form.getByRole("status")).toContainText("porcentagem");
    await expect(form.getByLabel("Título *", { exact: true })).toHaveValue(
      "A arte de ler",
    );
    await expect(form.getByLabel("Autor", { exact: true })).toHaveValue(
      "Biblioteca masterStudy",
    );
    await expect(form.getByLabel("Total de páginas (opcional)")).toHaveValue(
      "",
    );
    await expect(form.getByAltText("Capa extraída do livro")).toBeVisible();
    await form.getByRole("button", { name: "Salvar Livro" }).click();
    await page
      .getByRole("button", { name: "Ver Detalhes", exact: true })
      .click();
    await expect(page.getByTestId("book-extent")).toHaveText(
      "EPUB · leitura em porcentagem",
    );
    await page
      .getByRole("button", { name: "Ler Livro", exact: true })
      .last()
      .click();
    await expect(page.locator("iframe").first()).toBeVisible();
    await expect
      .poll(async () => (await storedState(page)).books.list[0].locationCount)
      .toBeGreaterThan(1);
    assert.equal((await storedState(page)).books.list[0].totalPages, 0);
  });

test("EPUB page list is a labeled reference; an EPUB without a cover can still be saved", async ({
  page,
}) => {
  const form = await library(page);
  await form.getByLabel("Arquivo do livro").setInputFiles({
    name: "reference.epub",
    mimeType: "application/epub+zip",
    buffer: await metadataEpub({ pages: true, cover: false }),
  });
  await expect(form.getByRole("status")).toContainText("não inclui uma capa");
  await expect(form.getByLabel("Total de páginas (opcional)")).toHaveValue("2");
  await form.getByRole("button", { name: "Salvar Livro" }).click();
  await page.getByRole("button", { name: "Ver Detalhes", exact: true }).click();
  await expect(page.getByTestId("book-extent")).toHaveText(
    "2 páginas de referência",
  );
});

test("Existing books can recover their cover and count without losing custom metadata", async ({
  page,
}) => {
  await preparePreview(page, {
    state: {
      ...previewState,
      books: {
        list: [
          {
            id: "old-book",
            title: "Meu título",
            author: "Meu autor",
            totalPages: 100,
            readPages: 1,
            status: "READING",
            filePath: "http://studyhub.test/test-book.pdf",
            notes: [{ id: "note", content: "Preservar" }],
          },
        ],
      },
    },
  });
  await page.route("**/test-book.pdf", (route) =>
    route.fulfill({
      contentType: "application/pdf",
      body: readerPdf({ metadata: true }),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Livros", exact: true }).click();
  await page.getByRole("button", { name: "Ver Detalhes", exact: true }).click();
  await page.getByRole("button", { name: "Extrair capa e páginas" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Dados do arquivo preenchidos" }),
  ).toBeVisible();
  const book = (await storedState(page)).books.list[0];
  assert.equal(book.title, "Meu título");
  assert.equal(book.author, "Meu autor");
  assert.equal(book.totalPages, 3);
  assert.equal(book.notes[0].content, "Preservar");
  assert.match(book.coverUrl, /^data:image\/jpeg/);
});

test("Broken PDF fails visibly and a manual book needs no uploaded file", async ({
  page,
}) => {
  const form = await library(page);
  await form.getByLabel("Arquivo do livro").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(form.getByRole("alert")).toContainText("Não foi possível ler");
  await form.getByLabel("Título *", { exact: true }).fill("Livro físico");
  await form.getByLabel("Total de páginas (opcional)").fill("230");
  await form.getByRole("button", { name: "Salvar Livro" }).click();
  const book = (await storedState(page)).books.list[0];
  assert.equal(book.filePath, null);
  assert.equal(book.totalPages, 230);
});

for (const lostCover of [undefined, "blob:http://studyhub.test/expired-cover"])
  test(`EPUB restores ${lostCover ? "expired" : "missing"} cover automatically without losing reading data`, async ({ page }) => {
    const epub = await metadataEpub();
    await preparePreview(page, {
      state: { ...previewState, books: { list: [{ id: "recover-book", title: "Título personalizado", author: "Meu autor", status: "READING", filePath: "http://studyhub.test/recover.epub", coverSource: "file", coverUrl: lostCover, lastPosition: { page: 5, percent: 32 }, notes: [{ id: "keep-note", content: "Preservar" }] }] } },
    });
    await page.route("**/recover.epub", route => route.fulfill({ contentType: "application/epub+zip", body: epub }));
    await page.goto("/");
    await page.getByRole("button", { name: "Livros", exact: true }).click();
    await expect.poll(async () => (await storedState(page)).books.list[0].coverUrl || "").toMatch(/^data:image\/jpeg/);
    const book = (await storedState(page)).books.list[0];
    assert.equal(book.title, "Título personalizado");
    assert.equal(book.author, "Meu autor");
    assert.equal(book.lastPosition.percent, 32);
    assert.equal(book.notes[0].content, "Preservar");
    await expect(page.getByAltText("Capa").first()).toBeVisible();
    await expect.poll(() => page.getByAltText("Capa").first().evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await page.reload();
    await page.getByRole("button", { name: "Livros", exact: true }).click();
    await expect.poll(() => page.getByAltText("Capa").first().evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  });
