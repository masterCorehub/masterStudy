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
  await expect(page.getByRole("heading", { name: "Entre na sua conta" })).toBeVisible();
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
  // Target the input, since the visibility button also has "senha" in its label.
  const password = page.locator("#account-password");
  await expect(password).toHaveAttribute("minlength", "8");
  await expect(page.locator(".account-auth-shell")).toBeVisible();
  await expect(page.locator(".account-auth-intro")).toBeVisible();
});

test("recuperação envia o destino web publicado ao Supabase", async ({ page }) => {
  let recoveryUrl;
  let recoveryBody;
  const env = await readFile(".env", "utf8").catch(() => "");
  const publicUrl = process.env.VITE_PUBLIC_APP_URL ||
    env.match(/^VITE_PUBLIC_APP_URL=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "") ||
    "http://studyhub.test";
  await page.route("**/auth/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/recover")) {
      recoveryUrl = url;
      recoveryBody = route.request().postDataJSON();
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByLabel("E-mail").fill("preview@example.invalid");
  await page.locator('form button[type="submit"]').click();
  await expect.poll(() => recoveryUrl?.searchParams.get("redirect_to")).toBe(
    `${publicUrl.replace(/\/$/, "")}/?auth=recovery`,
  );
  expect(recoveryBody.code_challenge).toBeNull();
  await expect(page.getByText("Enviamos um link de recuperação.", { exact: false })).toBeVisible();
});
