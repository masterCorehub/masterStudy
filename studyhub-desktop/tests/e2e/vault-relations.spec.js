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

test("Vault creates nested notes in context and connects inline tags", async ({
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
              stickyNotes: [
                {
                  id: "resize-note",
                  title: "Minha nota",
                  content: "Texto da nota.\n".repeat(100),
                  pinned: true,
                  color: "yellow",
                },
              ],
              activeVaultId: "custom-vault",
              customVaults: [{ id: "custom-vault", name: "Meus estudos" }],
              studyItems: [
                {
                  id: "parent",
                  title: "Principal",
                  itemType: "note",
                  vaultId: "custom-vault",
                  content:
                    '<p>#Cálculo</p><p><a href="#nested-note=old-child">Antiga</a></p>',
                },
                {
                  id: "other",
                  title: "Relacionada",
                  itemType: "note",
                  vaultId: "custom-vault",
                  content: "<p>#cálculo</p>",
                },
                {
                  id: "old-child",
                  title: "Antiga",
                  itemType: "note",
                  sourceKind: "nested-note",
                  content: "<p>Nota antiga</p>",
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
  await expect(page).toHaveTitle("masterStudy");
  await expect(page.locator(".campus-sidebar h1")).toHaveText("masterStudy");
  await page
    .getByRole("button", { name: "Materiais / Vault", exact: true })
    .click();
  await page.getByText("Principal", { exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: "Mostrar notas internas de Principal" }),
  ).toBeVisible();
  const editor = page.locator(".tiptap[contenteditable=true]").first();
  await editor.click();
  await editor.press("ControlOrMeta+End");
  await editor.press("Enter");
  await editor.pressSequentially("/");
  await page.getByText("Nota Interna", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "↳ Nota interna — Principal", exact: true }),
  ).toBeVisible();
  const notes = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("studyhub-storage-v2")).state.studyItems,
  );
  const child = notes.find((note) => note.title === "Nota interna — Principal");
  assert.equal(child.parentNoteId, "parent");
  assert.equal(child.vaultId, "custom-vault");
  assert.ok(
    notes
      .find((note) => note.id === "parent")
      .content.includes(`#nested-note=${child.id}`),
  );
  await page
    .getByRole("button", { name: "↳ Nota interna — Principal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "← Principal", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "← Principal", exact: true }).click();
  await expect(page.getByRole('button', { name: 'Expandir painel direito' })).toBeVisible();
  await page.getByRole('button', { name: 'Expandir painel direito' }).click();
  await page.getByRole("button", { name: "Grafo Local", exact: true }).click();
  await expect(page.getByText("4 notas · 3 conexões")).toBeVisible();
  const canvas = page.getByLabel('Grafo de conexões entre notas');
  const checkResolution = async () => {
    await expect.poll(() => canvas.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return Math.abs(el.width - Math.round(rect.width * devicePixelRatio)) + Math.abs(el.height - Math.round(rect.height * devicePixelRatio));
    })).toBe(0);
  };
  await checkResolution();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Recolher painel direito' }).click();
    await expect(canvas).toHaveCount(0);
    await page.getByRole('button', { name: 'Expandir painel direito' }).click();
    await checkResolution();
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await checkResolution();
  fs.mkdirSync("qa/vault-relations", { recursive: true });
  await page.screenshot({ path: "qa/vault-relations/graph.png" });
  await page.reload();
  const restored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("studyhub-storage-v2")).state.studyItems,
  );
  assert.equal(
    restored.find((note) => note.id === child.id).parentNoteId,
    "parent",
  );
  assert.equal(
    restored.find((note) => note.id === "old-child").parentNoteId,
    "parent",
  );
  await page.goto(
    "http://studyhub.test/?screen=sticky_note_widget&standalone=1&noteId=resize-note",
  );
  await expect(page.locator(".sticky-note-widget-screen")).toBeVisible();
  assert.equal(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  const shadow = await page
    .locator(".sticky-note-widget-screen article")
    .evaluate((el) => getComputedStyle(el).boxShadow);
  assert.ok(!shadow.includes("25px"));
  assert.deepEqual(errors, []);
});
