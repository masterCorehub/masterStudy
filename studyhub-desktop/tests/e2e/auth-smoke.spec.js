import { expect, test } from "playwright/test";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const DIST_ROOT = path.resolve("dist");
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
};

const exists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

test.beforeEach(async ({ page }) => {
  await page.route("http://studyhub.test/**", async (route) => {
    const url = new URL(route.request().url());
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let candidate = path.resolve(DIST_ROOT, relative || "index.html");
    if (!candidate.startsWith(`${DIST_ROOT}${path.sep}`) || !(await exists(candidate))) {
      candidate = path.join(DIST_ROOT, "index.html");
    }
    const extension = path.extname(candidate).toLowerCase();
    await route.fulfill({
      status: 200,
      body: await readFile(candidate),
      contentType: CONTENT_TYPES[extension] || "application/octet-stream",
    });
  });
});

test("abre o produto em perfil limpo sem tela branca", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entre para continuar" })).toBeVisible();
  await expect(page.getByText("Something went wrong", { exact: false })).toHaveCount(0);
  expect(pageErrors).toEqual([]);

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
});

test("fluxo de cadastro exige os campos básicos sem liberar o app", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
  await expect(page.getByLabel("Nome")).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  const password = page.getByLabel("Senha");
  await expect(password).toHaveAttribute("minlength", "8");
  await expect(page.getByRole("heading", { name: "Entre para continuar" })).toBeVisible();
});
