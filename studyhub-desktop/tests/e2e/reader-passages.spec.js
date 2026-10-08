import { test, expect } from "playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readerPdf, readerEpub } from "./fixtures/readerBooks.js";

test.use({ deviceScaleFactor: 2 });

// Production APIs are always intercepted; this fixture never signs into an
// actual account or writes to a backend.
const envFile = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const localUrl = envFile
  .match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]
  ?.trim()
  .replace(/^['"]|['"]$/g, "");
const authUrl =
  process.env.VITE_SUPABASE_URL || localUrl || "https://example.supabase.co";
const authKey = `sb-${new URL(authUrl).hostname.split(".")[0]}-auth-token`;
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "preview@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { name: "Alexandre" },
  app_metadata: { provider: "email" },
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(
    JSON.stringify({ sub: user.id, exp, aud: "authenticated" }),
  ).toString("base64url"),
  "preview",
].join(".");
const session = {
  access_token: token,
  refresh_token: "preview",
  expires_at: exp,
  expires_in: 3600,
  token_type: "bearer",
  user,
};

for (const format of ["pdf", "epub"]) test("Reader passages: real " + format + " highlights, saved quotes, exact navigation and double pages", async ({
  page,
}) => {
  test.setTimeout(60000);
  const pdf = readerPdf();
  const epub = await readerEpub();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.addInitScript(
    ({ authKey, session, format }) => {
      if (!localStorage.getItem(authKey))
        localStorage.setItem(authKey, JSON.stringify(session));
      if (!localStorage.getItem("studyhub-storage-v2"))
        localStorage.setItem(
          "studyhub-storage-v2",
          JSON.stringify({
            state: {
              appSettings: { notificationsEnabled: false },
              activeBookId: "reader-book",
              books: { list: [{ id: "reader-book", title: "A arte de ler", author: "Biblioteca masterStudy", status: "READING", totalPages: 3, readPages: 1, filePath: "http://studyhub.test/fixtures/book." + format, lastPosition: { page: format === "pdf" ? 2 : 1 }, bookmarks: [], highlights: [], notes: [], quotes: [] }] },
              themePreference: "brisa-amber",
              isDarkMode: true,
              focusSessions: [
                {
                  id: "preview-focus",
                  status: "completed",
                  actualSeconds: 1500,
                  completedAt: Date.now(),
                },
              ],
              stickyNotes: [ { id: 'resize-note', title: 'Minha nota', content: 'Texto da nota.\n'.repeat(100), pinned: true, color: 'yellow' } ],
              academic: {
                semesters: [
                  {
                    id: "preview-semester",
                    name: "Semestre de teste",
                    status: "active",
                  },
                ],
                activeSemesterId: "preview-semester",
                subjects: [
                  {
                    id: "preview-subject-one",
                    semesterId: "preview-semester",
                    name: "Programação",
                    schedule: {
                      days: [1, 2],
                      startTime: "08:00",
                      endTime: "09:40",
                      room: "Sala 204",
                    },
                  },
                  {
                    id: "preview-subject-two",
                    semesterId: "preview-semester",
                    name: "Estrutura de Dados",
                    schedule: {
                      days: [1, 2],
                      startTime: "10:00",
                      endTime: "11:40",
                      room: "Laboratório",
                    },
                  },
                ],
              },
            },
            version: 21,
          }),
        );
    },
    { authKey, session, format },
  );
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://studyhub.test")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(url.pathname.endsWith("/user") ? user : []),
      });
    if (url.pathname === "/fixtures/book.pdf") return route.fulfill({ contentType: "application/pdf", body: pdf });
    if (url.pathname === "/fixtures/book.epub") return route.fulfill({ contentType: "application/epub+zip", body: epub });
    let file = path.resolve(
      "dist",
      decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html",
    );
    if (
      !file.startsWith(path.resolve("dist") + path.sep) ||
      !fs.existsSync(file)
    )
      file = path.resolve("dist/index.html");
    const type =
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".woff2": "font/woff2",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      }[path.extname(file)] || "application/octet-stream";
    return route.fulfill({
      status: 200,
      contentType: type,
      body: fs.readFileSync(file),
    });
  });
  await page.goto("http://studyhub.test/?screen=book_reader&bookId=reader-book");
  await expect(page.locator(".reader-books-toolbar")).toBeVisible();
  const paper = format === "pdf" ? page.locator(".reader-pdf-engine") : page.locator(".reader-epub-paper");
  if (format === "pdf") {
    await expect(page.locator(".pdf-text-layer").first()).toContainText("Chapter 2");
    assert.ok(await page.locator('.reader-pdf-engine canvas').first().evaluate(el => el.width / el.getBoundingClientRect().width >= 1.99));
    await page.getByRole("button", { name: "Avançar uma página", exact: true }).click();
    await expect(page.locator(".pdf-text-layer").first()).toContainText("Chapter 3");
    await page.getByRole("button", { name: "Voltar uma página", exact: true }).click();
    await expect(page.locator(".pdf-text-layer").first()).toContainText("Chapter 2");
  } else {
    await expect(page.locator(".reader-loading")).toHaveCount(0);
    await expect(page.frameLocator(".reader-epub-paper iframe").first().locator("body")).toContainText("Um lugar para ler");
    await expect(page.getByRole("slider", { name: "Posição no livro" })).toBeEnabled();
  }
  const readBook = () => page.evaluate(() => JSON.parse(localStorage.getItem("studyhub-storage-v2")).state.books.list[0]);
  await page.setViewportSize({ width: 800, height: 850 });
  await page.getByRole("button", { name: "Duas páginas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Duas páginas", exact: true })).toHaveAttribute("aria-pressed", "true");
  if (format === "pdf") {
    await expect(page.locator(".reader-pdf-engine canvas")).toHaveCount(2);
    // Canvas elements exist before their page and text layers finish rendering.
    await expect(page.locator(".pdf-text-layer").nth(1)).toContainText("Chapter 3");
  }
  else {
    const stageWidth = (await page.locator(".reader-epub-paper").boundingBox()).width;
    await expect.poll(() => page.frameLocator(".reader-epub-paper iframe").first().locator("body").evaluate(el => parseFloat(getComputedStyle(el).columnWidth))).toBeLessThan(stageWidth / 2);
    await expect.poll(() => page.frameLocator(".reader-epub-paper iframe").first().locator("body").evaluate(el => Array.from(el.querySelectorAll("p")).flatMap(p => Array.from(p.getClientRects())).filter(r => r.left >= 400 && r.left < 790).length)).toBeGreaterThan(0);
  }
  const selectText = async (kind) => {
    if (format === "epub") {
      await page.frameLocator(".reader-epub-paper iframe").first().locator(kind === "note" ? "p:nth-of-type(2)" : kind === "manual" ? "p:nth-of-type(3)" : "p").first().evaluate(el => {
        const range = document.createRange();
        range.setStart(el.firstChild, 0); range.setEnd(el.firstChild, Math.min(45, el.firstChild.length));
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
      });
    } else {
      const layer = page.locator(".pdf-text-layer").nth(kind === "note" ? 1 : 0);
      await layer.locator("span").nth(kind === "manual" ? 1 : 0).evaluate(el => {
        const range = document.createRange(); range.selectNodeContents(el);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      });
    }
    await expect(page.getByRole("toolbar", { name: "Ações do trecho selecionado" })).toBeVisible();
    const menu = await page.getByRole("toolbar", { name: "Ações do trecho selecionado" }).boundingBox();
    assert.ok(menu.y >= 0 && menu.x >= 0);
  };
  await selectText("quote");
  await page.getByRole("button", { name: "Salvar como Citação" }).click();
  await page.getByRole("button", { name: "Salvar citação", exact: true }).click();
  await expect.poll(async () => (await readBook()).quotes.length).toBe(1);
  const quote = (await readBook()).quotes[0];
  if (format === "epub") assert.ok(quote.cfi.includes(","));
  else assert.ok(quote.rects.length);
  await expect.poll(async () => (await readBook()).highlights.find(h => h.linkedAnnotationId === quote.id)?.color).toBe("yellow");
  if (format === "epub") await expect(page.locator(".reader-passage-highlight rect").first()).toBeVisible();
  else await expect(page.locator("svg[data-highlight-id] rect").first()).toBeVisible();

  await selectText("note");
  await page.getByRole("button", { name: "Salvar como Anotação" }).click();
  await page.getByPlaceholder("Escreva suas observações, resumo ou ideias...").fill("Comentário sobre este trecho");
  await page.getByRole("button", { name: "Salvar anotação", exact: true }).click();
  const note = (await readBook()).notes[0];
  assert.ok(note);
  if (format === "epub") assert.ok(note.cfi && note.cfi !== quote.cfi);
  else assert.equal(note.page, 3);
  assert.equal((await readBook()).highlights.find(h => h.linkedAnnotationId === note.id).color, "yellow");
  await selectText("manual");
  await page.getByTitle("Grifar Verde", { exact: true }).click();
  await expect.poll(async () => (await readBook()).highlights.filter(h => !h.linkedAnnotationId && h.color === 'green').length).toBe(1);
  await selectText("note");
  await page.getByTitle("Grifar Azul", { exact: true }).click();
  await expect.poll(async () => (await readBook()).highlights.find(h => h.linkedAnnotationId === note.id)?.color).toBe('blue');
  fs.mkdirSync("qa/reader-passages", { recursive: true });
  await page.screenshot({ path: "qa/reader-passages/" + format + "-two-pages.png" });

  // Move to another chapter/page, then navigate using the saved quote.
  await page.getByRole("button", { name: "Duas páginas", exact: true }).click();
  if (format === "pdf") {
    await page.getByRole("button", { name: "Avançar uma página", exact: true }).click();
    await expect(page.locator(".pdf-text-layer").first()).toContainText("Chapter 3");
  } else {
    await page.getByRole("button", { name: "Sumário e anotações", exact: true }).click();
    await page.getByRole("button", { name: "Encontrar o seu ritmo", exact: true }).click();
    await expect(page.frameLocator(".reader-epub-paper iframe").first().locator("body")).toContainText("Encontrar o seu ritmo");
  }
  await page.getByRole("button", { name: "Sumário e anotações", exact: true }).click();
  await page.getByRole("button", { name: "Citações", exact: true }).click();
  await page.getByRole("button", { name: "Abrir citação no livro", exact: true }).click();
  await expect(page.locator(".reader-library-panel")).toHaveCount(0);
  if (format === "pdf") await expect(page.locator(".pdf-text-layer").first()).toContainText("Chapter 2");
  else {
    await expect(page.frameLocator(".reader-epub-paper iframe").first().locator("body")).toContainText("Um lugar para ler");
    const mark = page.locator(".reader-passage-highlight rect").first();
    await expect(mark).toBeVisible();
    await expect.poll(async () => { const box = await mark.boundingBox(); return box && box.x >= 0 && box.y >= 70 && box.y < 750; }).toBeTruthy();
  }
  await page.getByRole("button", { name: "Sumário e anotações", exact: true }).click();
  await page.getByRole("button", { name: "Notas", exact: true }).click();
  await expect(page.getByTestId('annotation-excerpt')).toContainText(note.selectedText);
  await expect(page.getByTestId('annotation-excerpt')).toContainText('Trecho selecionado');
  await page.getByRole("button", { name: "Abrir anotação no livro", exact: true }).click();
  if (format === "pdf") await expect(page.locator(".pdf-text-layer").first()).toContainText("Chapter 3");
  else await expect(page.locator(".reader-passage-highlight rect").first()).toBeVisible();
  await page.getByRole("button", { name: "Duas páginas", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Duas páginas", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await readBook()).quotes[0].id).toBe(quote.id);
  await expect.poll(async () => (await readBook()).highlights.length).toBe(3);
  assert.deepEqual(errors, []);
});
