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

for (const platform of ['web', 'darwin', 'win32']) test("Sidebar, platform chrome and Markdown — " + platform, async ({
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
  await page.addInitScript(platform => {
    if (platform !== 'web') window.studyhubDesktop = {
      platform,
      windowControls: { isMaximized: async () => false, onMaximizedChange: () => () => {}, minimize: async () => {}, toggleMaximize: async () => true, close: async () => {} },
      stickyNotes: { broadcastChange: async () => {}, onChanged: () => () => {} },
    };
  }, platform);
  await page.goto("http://studyhub.test");
  await expect(page).toHaveTitle('masterStudy');
  await expect(page.locator('.campus-sidebar h1')).toHaveText('masterStudy');
  await expect(page.locator('.app-titlebar')).toHaveAttribute('data-platform', platform);
  await expect(page.locator('.app-window-controls')).toHaveCount(platform === 'win32' ? 1 : 0);
  await expect(page.getByText('Academic Management', { exact: true })).toHaveCount(0);
  const sidebar = page.locator('.campus-sidebar');
  assert.equal(Math.round((await sidebar.boundingBox()).width), 232);
  await page.getByRole('button', { name: 'Recolher menu', exact: true }).click();
  await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(64);
  await page.getByRole('button', { name: 'Expandir menu', exact: true }).click();
  await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(232);
  fs.mkdirSync('qa/sidebar-markdown', { recursive: true });
  await page.screenshot({ path: 'qa/sidebar-markdown/' + platform + '.png' });
  const source = '# Plano de estudo\n\n**Revisar React** e *praticar*.\n\n- Ler capítulo\n- Fazer exercícios\n\n[Curso](https://example.com)\n\n`const x = 1`\n\n[Inseguro](javascript:alert(1))';
  const note = page.locator('[data-today-note="resize-note"]');
  await note.getByRole('textbox', { name: 'Conteúdo de Minha nota', exact: true }).fill(source);
  await note.getByRole('button', { name: 'Visualizar Markdown' }).click();
  await expect(note.getByRole('heading', { name: 'Plano de estudo' })).toBeVisible();
  await expect(note.locator('strong')).toHaveText('Revisar React');
  await expect(note.locator('li')).toHaveCount(2);
  await expect(note.locator('a[href^="javascript:"]')).toHaveCount(0);
  await page.reload();
  await expect(note.getByRole('heading', { name: 'Plano de estudo' })).toBeVisible();
  await page.getByRole('button', { name: 'Sticky Notes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plano de estudo' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar Markdown' }).click();
  await expect(page.getByRole('textbox', { name: 'Conteúdo da nota' })).toHaveValue(source);
  await page.getByRole('button', { name: 'Visualizar Markdown' }).click();
  await page.goto('http://studyhub.test/?screen=sticky_note_widget&standalone=1&noteId=resize-note');
  await expect(page.getByRole('heading', { name: 'Plano de estudo' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar Markdown' }).click();
  await page.getByRole('textbox', { name: 'Conteúdo da nota' }).fill(source + '\n\n## Concluído');
  await page.getByRole('button', { name: 'Visualizar Markdown' }).click();
  await expect(page.getByRole('heading', { name: 'Concluído' })).toBeVisible();
  await page.screenshot({ path: 'qa/sidebar-markdown/note-' + platform + '.png' });
  assert.deepEqual(errors, []);
});
