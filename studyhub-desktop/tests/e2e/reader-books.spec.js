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

for (const format of ["pdf", "epub"]) test("Reader: real " + format + " navigation, appearance, search and persistence", async ({
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
  await page.addInitScript(() => {
    window.readerTurns = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.dataset.pageTurn) window.readerTurns.push(this.dataset.pageTurn);
      return animate.apply(this, args);
    };
  });
  await page.goto("http://studyhub.test/?screen=book_reader&bookId=reader-book");
  await expect(page.locator(".reader-books-toolbar")).toBeVisible();
  await expect(page.locator(".reader-books-toolbar").getByRole("button", { name: "Tela cheia", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Favoritar página", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remover página dos favoritos", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Remover página dos favoritos", exact: true }).click();
  await page.getByRole("button", { name: "Temas e ajustes", exact: true }).click();
  await page.getByRole("button", { name: "Fechar painel de leitura", exact: true }).click({ position: { x: 20, y: 250 } });
  await expect(page.getByRole("dialog", { name: "Temas e ajustes" })).toHaveCount(0);
  const paper = format === "pdf" ? page.locator(".reader-pdf-engine") : page.locator(".reader-epub-paper");
  if (format === "pdf") {
    await expect(page.locator(".pdf-text-layer").first()).toContainText("Chapter 2");
    assert.ok(await page.locator('.reader-pdf-engine canvas').first().evaluate(el => el.width / el.getBoundingClientRect().width >= 1.99));
    await page.getByRole("button", { name: "Avançar uma página", exact: true }).click();
    await expect(page.locator(".pdf-text-layer").first()).toContainText("Chapter 3");
    await expect.poll(() => page.evaluate(() => window.readerTurns.includes('next'))).toBe(true);
    await page.getByRole("button", { name: "Voltar uma página", exact: true }).click();
    await expect(page.locator(".pdf-text-layer").first()).toContainText("Chapter 2");
    await expect.poll(() => page.evaluate(() => window.readerTurns.includes('prev'))).toBe(true);
  } else {
    await expect(page.locator(".reader-loading")).toHaveCount(0);
    await expect(page.frameLocator(".reader-epub-paper iframe").first().locator("body")).toContainText("Um lugar para ler");
    await expect(page.getByRole("slider", { name: "Posição no livro" })).toBeEnabled();
    await page.getByRole("button", { name: "Avançar uma página", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.readerTurns.includes('next'))).toBe(true);
    await page.getByRole("button", { name: "Voltar uma página", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.readerTurns.includes('prev'))).toBe(true);
  }
  await expect(page.locator('[data-page-turn]')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const turnCount = await page.evaluate(() => window.readerTurns.length);
  await page.getByRole("button", { name: "Avançar uma página", exact: true }).click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.readerTurns.length)).toBe(turnCount);
  await page.getByRole("button", { name: "Voltar uma página", exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const before = await paper.boundingBox();
  await page.mouse.move(700, 500);
  await expect(page.locator(".reader-top-chrome")).toHaveClass(/is-hidden/);
  const after = await paper.boundingBox();
  assert.equal(after.height, before.height);
  await page.mouse.move(600, 20);
  await expect(page.locator(".reader-top-chrome")).not.toHaveClass(/is-hidden/);
  await page.getByRole("button", { name: "Temas e ajustes", exact: true }).click();
  await page.getByRole("button", { name: /Papel/ }).click();
  fs.mkdirSync("qa/apple-books-reader", { recursive: true });
  await page.screenshot({ path: "qa/apple-books-reader/" + format + "-appearance.png" });
  if (format === "pdf") {
    const canvas = page.locator(".reader-pdf-engine canvas").first();
    const width = await canvas.evaluate(el => el.getBoundingClientRect().width);
    await page.getByRole("slider", { name: "Zoom do PDF" }).evaluate(el => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, '1.5'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await expect.poll(() => canvas.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(width);
    await page.getByRole("slider", { name: "Zoom do PDF" }).evaluate(el => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, '1'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  } else {
    await page.getByRole("button", { name: "Aumentar fonte", exact: true }).click();
    await expect(page.frameLocator(".reader-epub-paper iframe").first().locator("body")).toHaveCSS("font-size", "20px");
  }
  await page.getByRole("button", { name: "Fechar ajustes" }).click();
  await page.getByRole("button", { name: "Marcar página", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remover marcador", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sumário e anotações", exact: true }).click();
  await page.screenshot({ path: "qa/apple-books-reader/" + format + "-contents.png" });
  if (format === "pdf") {
    await expect(page.getByRole("button", { name: "Abrir página 1", exact: true }).locator("img")).toBeVisible();
    await page.getByRole("button", { name: "Abrir página 1", exact: true }).click();
    await expect(page.locator(".pdf-text-layer").first()).toContainText("Chapter 1");
  } else {
    await page.getByRole("button", { name: "Encontrar o seu ritmo", exact: true }).click();
    await expect(page.frameLocator(".reader-epub-paper iframe").first().locator("body")).toContainText("Encontrar o seu ritmo");
  }
  await page.getByRole("button", { name: "Buscar no livro", exact: true }).click();
  await page.getByRole("textbox", { name: "Buscar no livro", exact: true }).fill(format === "pdf" ? "journey" : "curiosidade");
  await expect(page.locator(".reader-search-results button").first()).toBeVisible();
  await page.locator(".reader-search-results button").first().click();
  await expect(page.locator(".reader-search-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Voltar à leitura", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Voltar à leitura", exact: true }).click();
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("studyhub-storage-v2")).state.books.list[0]);
  assert.equal(saved.readerSettings.theme, "sepia");
  assert.equal(saved.bookmarks.length, 1);
  if (format === "epub") assert.ok(saved.lastPosition.cfi);
  fs.mkdirSync("qa/apple-books-reader", { recursive: true });
  await page.screenshot({ path: "qa/apple-books-reader/" + format + ".png" });
  await page.reload();
  if (format === "pdf") await expect(page.locator(".pdf-text-layer").first()).toContainText("Chapter " + saved.lastPosition.page);
  else {
    await expect(page.locator('.reader-epub-paper iframe').first()).toBeVisible();
    await expect(page.locator(".reader-loading")).toHaveCount(0);
    await expect(page.getByRole("slider", { name: "Posição no livro" })).toBeEnabled();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("studyhub-storage-v2")).state.books.list[0].lastPosition.cfi)).toBe(saved.lastPosition.cfi);
  }
  await page.getByRole("button", { name: "Temas e ajustes", exact: true }).click();
  await page.getByRole("checkbox", { name: "Páginas lado a lado" }).check();
  if (format === "pdf") await expect(page.locator('.reader-pdf-engine canvas')).toHaveCount(2);
  else await expect(page.locator('.reader-epub-paper')).toHaveClass(/is-spread/);
  await page.getByRole("checkbox", { name: "Páginas lado a lado" }).uncheck();
  await page.getByRole("button", { name: "Rolagem", exact: true }).click();
  if (format === "pdf") await expect(page.locator('.pdf-continuous-container')).toBeVisible();
  else { await expect(page.locator('.reader-loading')).toHaveCount(0); await expect(page.locator('.reader-epub-paper .epub-container')).toBeVisible(); }
  await page.getByRole("button", { name: "Páginas", exact: true }).click();
  if (format === "epub") {
    await expect(page.locator('.reader-epub-paper iframe').first()).toBeVisible();
    await expect(page.locator('.reader-loading')).toHaveCount(0);
    await expect(page.getByRole("slider", { name: "Posição no livro" })).toBeEnabled();
  }
  await page.getByRole("button", { name: "Fechar ajustes" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Voltar à biblioteca" })).toBeVisible();
  await page.getByRole("button", { name: "Temas e ajustes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Fechar ajustes" })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "qa/apple-books-reader/" + format + "-mobile.png" });
  assert.deepEqual(errors, []);
});
