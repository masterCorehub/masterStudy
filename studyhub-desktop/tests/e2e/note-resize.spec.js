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

test("Pinned notes resize, persist, scroll and respect the column", async ({
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
  const note = page.locator('[data-today-note="resize-note"]');
  await expect(note).toBeVisible();
  await note.scrollIntoViewIfNeeded();
  const handle = page.getByRole('button', { name: 'Redimensionar Minha nota', exact: true });
  const before = await note.boundingBox();
  const grip = await handle.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 60, grip.y + 90, { steps: 8 });
  await page.mouse.up();
  const resized = await note.boundingBox();
  assert.ok(resized.height > before.height + 60);
  assert.ok(resized.width < before.width - 40);
  const savedSize = await page.evaluate(() => JSON.parse(localStorage.getItem('studyhub-storage-v2')).state.stickyNotes.find(n => n.id === 'resize-note').dashboardSize);
  await page.reload();
  await expect(note).toBeVisible();
  const restored = await note.boundingBox();
  assert.equal(Math.round(restored.height), Math.round(savedSize.height));
  assert.equal(Math.round(restored.width), Math.round(savedSize.width));
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(Math.round((await note.boundingBox()).height), Math.round(restored.height) + 24);
  await handle.press('ArrowUp');
  const textArea = note.locator('textarea');
  assert.ok(await textArea.evaluate(el => el.scrollHeight > el.clientHeight));
  await page.getByPlaceholder("Adicionar tarefa para hoje...").fill("Revisão agendada");
  await page.getByRole("button", { name: "Definir data e horário da tarefa", exact: true }).click();
  await page.getByLabel("Data", { exact: true }).fill("2099-10-07");
  await page.getByLabel("Horário", { exact: true }).fill("14:30");
  await page.getByPlaceholder("Adicionar tarefa para hoje...").press("Enter");
  const scheduled = await page.evaluate(() => JSON.parse(localStorage.getItem("studyhub-storage-v2")).state.tasks.list.find(task => task.title === "Revisão agendada"));
  assert.equal(scheduled.dueDate, "2099-10-07");
  assert.equal(scheduled.dueTime, "14:30");
  assert.equal(scheduled.isTodayTask, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await note.scrollIntoViewIfNeeded();
  assert.ok(await note.evaluate(el => el.getBoundingClientRect().width <= el.parentElement.clientWidth));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await note.getByRole('button', { name: 'Restaurar tamanho' }).click();
  assert.equal(Math.round((await note.boundingBox()).height), 240);
  fs.mkdirSync('qa/note-resize', { recursive: true });
  await note.screenshot({ path: 'qa/note-resize/mobile.png' });
  assert.deepEqual(errors, []);
});
