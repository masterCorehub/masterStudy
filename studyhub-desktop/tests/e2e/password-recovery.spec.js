import { test, expect } from "playwright/test";
import fs from "node:fs";
import path from "node:path";

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

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://studyhub.test")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          url.pathname.endsWith("/user")
            ? user
            : url.pathname.endsWith("/token")
              ? session
              : [],
        ),
      });
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
});

test("fresh browser completes recovery from email fragment without PKCE storage", async ({
  page,
}) => {
  let updated = false;
  await page.route("**/auth/v1/user", async (route) => {
    if (route.request().method() === "PUT") updated = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    });
  });
  const callback = new URLSearchParams({
    access_token: token,
    refresh_token: "preview",
    expires_in: "3600",
    token_type: "bearer",
    type: "recovery",
  });
  await page.goto(`http://studyhub.test/#${callback}`);
  await expect(
    page.getByRole("heading", { name: "Definir nova senha" }),
  ).toBeVisible();
  fs.mkdirSync("qa/password-recovery", { recursive: true });
  await page.screenshot({ path: "qa/password-recovery/new-password.png" });
  await page
    .getByLabel("Nova senha", { exact: true })
    .fill("test-new-password");
  await page
    .getByLabel("Repita a nova senha", { exact: true })
    .fill("test-new-password");
  await page.locator('form button[type="submit"]').click();
  await expect.poll(() => updated).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Hoje", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(new URL(page.url()).searchParams.has("auth")).toBe(false);
});

test("expired recovery link explains the problem and offers another email", async ({
  page,
}) => {
  await page.goto(
    "http://studyhub.test/?auth=recovery#error=access_denied&error_code=otp_expired",
  );
  await expect(
    page.getByText("Este link expirou ou já foi utilizado.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Solicitar novo link de recuperação" })
    .click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

test("recovery marker without a session cannot update a password", async ({
  page,
}) => {
  let updated = false;
  await page.route("**/auth/v1/user", async (route) => {
    if (route.request().method() === "PUT") updated = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    });
  });
  await page.goto("http://studyhub.test/?auth=recovery");
  await page
    .getByLabel("Nova senha", { exact: true })
    .fill("test-new-password");
  await page
    .getByLabel("Repita a nova senha", { exact: true })
    .fill("test-new-password");
  await page.locator('form button[type="submit"]').click();
  await expect(
    page.getByText("Este link não criou uma sessão de recuperação.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(updated).toBe(false);
});
