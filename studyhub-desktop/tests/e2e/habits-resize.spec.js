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

test("Habits resize, persist, respect content and scroll without collisions", async ({
  page,
}) => {
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
    { authKey, session },
  );
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://studyhub.test")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(url.pathname.endsWith("/user") ? user : []),
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
  await expect(page).toHaveTitle('masterStudy');
  await expect(page.locator('.campus-sidebar h1')).toHaveText('masterStudy');
  const panel = page.locator('.today-habits-resizable');
  const handle = page.getByRole('button', { name: 'Redimensionar hábitos', exact: true });
  for (const title of ['Ler', 'Estudar', 'Caminhar']) {
    await page.getByRole('textbox', { name: 'Novo hábito', exact: true }).fill(title);
    await page.getByRole('button', { name: 'Adicionar hábito', exact: true }).click();
  }
  await panel.scrollIntoViewIfNeeded();
  const before = await panel.boundingBox();
  const grip = await handle.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 55, grip.y + 95, { steps: 8 });
  await page.mouse.up();
  const resized = await panel.boundingBox();
  assert.ok(resized.height > before.height + 65);
  assert.ok(resized.width < before.width - 30);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('studyhub-storage-v2')).state.appSettings.habitsPanelSize);
  await page.reload();
  await expect(panel).toBeVisible();
  assert.equal(Math.round((await panel.boundingBox()).height), Math.round(saved.height));
  await handle.press('ArrowDown');
  assert.equal(Math.round((await panel.boundingBox()).height), Math.round(saved.height) + 24);
  for (let i = 0; i < 20; i++) await handle.press('ArrowUp');
  const list = panel.locator('.today-list');
  // A three-item list must fit entirely at minimum size.
  assert.ok(await list.evaluate(el => el.scrollHeight <= el.clientHeight + 2));
  for (let i = 0; i < 9; i++) {
    await page.getByRole('textbox', { name: 'Novo hábito', exact: true }).fill('Hábito ' + i);
    await page.getByRole('button', { name: 'Adicionar hábito', exact: true }).click();
  }
  assert.ok(await list.evaluate(el => el.scrollHeight > el.clientHeight));
  await expect(page.getByRole('textbox', { name: 'Novo hábito', exact: true })).toBeVisible();
  fs.mkdirSync('qa/habits-resize', { recursive: true });
  await panel.screenshot({ path: 'qa/habits-resize/desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await panel.evaluate(el => el.getBoundingClientRect().width <= el.parentElement.clientWidth + 1));
  await page.getByRole('button', { name: 'Restaurar tamanho automático dos hábitos' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('studyhub-storage-v2')).state.appSettings.habitsPanelSize)).toBe(null);
  assert.deepEqual(errors, []);
});
