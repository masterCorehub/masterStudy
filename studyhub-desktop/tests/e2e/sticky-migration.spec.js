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

test("Legacy quick notes migrate once and deleted notes stay deleted", async ({
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
              stickyNotes: [{ id: 'manual', title: 'Anotação rápida', content: 'Nota legítima', color: 'yellow' }],
              dashboardQuickNote: 'Texto antigo',
              dashboardQuickNotes: [{ id: 'old-deleted', title: 'Excluída', content: 'Não recriar' }, { id: 'old-kept', title: 'Preservada', content: 'Conteúdo a manter' }],
              universalTrash: [{ id: 'trash-old', entityType: 'sticky_note', entityId: 'sticky-old-deleted', payload: { id: 'sticky-old-deleted' } }],
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
  await page.getByRole('button', { name: 'Sticky Notes', exact: true }).click();
  const savedState = () => page.evaluate(() => JSON.parse(localStorage.getItem('studyhub-storage-v2')).state);
  let state = await savedState();
  assert.deepEqual(state.stickyNotes.map(note => note.id).sort(), ['manual', 'sticky-old-kept']);
  assert.equal(state.dashboardQuickNote, '');
  assert.deepEqual(state.dashboardQuickNotes, []);
  const preserved = page.locator('article.sticky-note-themed').filter({ has: page.locator('input[value="Preservada"]') });
  await expect(preserved).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await preserved.getByRole('button', { name: 'Excluir nota', exact: true }).click();
  await page.reload();
  assert.deepEqual((await savedState()).stickyNotes.map(note => note.id), ['manual']);
  // Simula uma restauração antiga: a lixeira deve impedir a recriação novamente.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('studyhub-storage-v2'));
    saved.version = 22;
    saved.state.dashboardQuickNotes = [{ id: 'old-kept', title: 'Preservada', content: 'Conteúdo antigo' }];
    localStorage.setItem('studyhub-storage-v2', JSON.stringify(saved));
  });
  await page.reload();
  state = await savedState();
  assert.deepEqual(state.stickyNotes.map(note => note.id), ['manual']);
  assert.equal(state.stickyNotes[0].content, 'Nota legítima');
  assert.deepEqual(errors, []);
});
