import { test, expect } from "playwright/test";
import assert from "node:assert/strict";
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

test("Journal inherits app palettes and preserves saved entries across themes", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.addInitScript(
    ({ authKey, session }) => {
      if (!localStorage.getItem(authKey))
        localStorage.setItem(authKey, JSON.stringify(session));
      if (!localStorage.getItem("studyhub-storage-v2"))
        localStorage.setItem(
          "studyhub-storage-v2",
          JSON.stringify({
            state: {
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
    { authKey, session },
  );
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://studyhub.test")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(url.pathname.endsWith("/user") ? user : url.pathname.endsWith("/token") ? session : []),
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
  await page.goto("http://studyhub.test");


  const openJournal = async () => {
    await page.getByRole("button", { name: "Diário", exact: true }).click();
    await page.getByRole("textbox", { name: "Senha da conta" }).fill("preview-password");
    await page.getByRole("button", { name: "Abrir diário" }).click();
    await expect(page.getByRole("heading", { name: "Meu diário" })).toBeVisible();
  };
  const checkPalette = async () => {
    const colors = await page.locator(".journal-screen").evaluate((node) => {
      const style = getComputedStyle(node);
      const resolved = (token) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        node.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      return {
        ink: style.color, appInk: resolved("--on-surface"),
        accent: resolved("--journal-accent"), appAccent: resolved("--primary"),
        paper: getComputedStyle(node.querySelector(".journal-paper")).backgroundColor,
        appPaper: resolved("--surface-container-low"),
        button: getComputedStyle(node.querySelector(".journal-primary-button")).color,
        appButton: resolved("--on-primary"),
      };
    });
    expect(colors.ink).toBe(colors.appInk);
    expect(colors.accent).toBe(colors.appAccent);
    expect(colors.paper).toBe(colors.appPaper);
    expect(colors.button).toBe(colors.appButton);
  };
  await openJournal();
  await checkPalette();
  await page.getByPlaceholder("Dê um título a este momento...").fill("Um dia de estudo");
  await page.getByPlaceholder("Respire fundo e escreva sem se julgar. Este espaço é só seu...").fill("Hoje organizei minhas ideias e avancei com calma.");
  await page.getByRole("button", { name: "Salvar", exact: true }).first().click();
  await expect(page.locator(".journal-history-column")).toContainText("Um dia de estudo");
  fs.mkdirSync("qa/journal-theme", { recursive: true });
  await page.screenshot({ path: "qa/journal-theme/brisa.png" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      const saved = JSON.parse(localStorage.getItem("studyhub-storage-v2"));
      saved.state.themePreference = theme;
      saved.state.isDarkMode = theme === "dark";
      localStorage.setItem("studyhub-storage-v2", JSON.stringify(saved));
    }, theme);
    await page.reload();
    await openJournal();
    await checkPalette();
    await expect(page.locator(".journal-history-column")).toContainText("Um dia de estudo");
    await page.screenshot({ path: `qa/journal-theme/${theme}.png` });
  }
  expect(errors).toEqual([]);
});
