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

test("Agenda presence toggles, replaces absence, persists and syncs the class log", async ({
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
              academic: {
                semesters: [
                  {
                    id: "preview-semester",
                    name: "Semestre de teste",
                    status: "active",
                  },
                ],
                activeSemesterId: "preview-semester",
                classLogs: [
                  {
                    id: "preview-class",
                    subjectId: "preview-subject-one",
                    semesterId: "preview-semester",
                    date: "2026-10-06",
                    title: "Aula de teste",
                    lessonNumber: 1,
                  },
                ],
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
  await page.goto("http://studyhub.test");

  await page
    .locator(".today-weekdays")
    .getByRole("button", { name: /^Ter/ })
    .click();
  const presence = page.getByRole("button", {
    name: "Registrar presença em Programação",
    exact: true,
  });
  const stored = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem("studyhub-storage-v2")).state,
    );
  await expect(presence).toHaveAttribute("aria-pressed", "false");
  await presence.click();
  await expect(presence).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Hoje", exact: true }),
  ).toBeVisible();
  let state = await stored();
  const records = state.academic.attendance.filter(
    (e) => e.subjectId === "preview-subject-one",
  );
  assert.equal(records.length, 1);
  const date = records[0].date;
  assert.equal(records[0].status, "present");
  assert.equal(
    state.academic.classLogs.find(
      (e) => e.subjectId === "preview-subject-one" && e.date === date,
    ).attendanceStatus,
    "attended",
  );
  assert.equal(state.studyItems.length, 0);
  await presence.click();
  await expect(presence).toHaveAttribute("aria-pressed", "false");
  state = await stored();
  assert.equal(
    state.academic.attendance.filter(
      (e) => e.subjectId === "preview-subject-one",
    ).length,
    0,
  );
  assert.equal(
    state.academic.classLogs.find(
      (e) => e.subjectId === "preview-subject-one" && e.date === date,
    ).attendanceStatus,
    "pending",
  );
  await page.getByTitle("Marcar falta em Programação", { exact: true }).click();
  await presence.click();
  state = await stored();
  assert.equal(
    state.academic.attendance.filter(
      (e) => e.subjectId === "preview-subject-one" && e.date === date,
    ).length,
    1,
  );
  assert.equal(
    state.academic.attendance.find(
      (e) => e.subjectId === "preview-subject-one" && e.date === date,
    ).status,
    "present",
  );
  await page.reload();
  await page
    .locator(".today-weekdays")
    .getByRole("button", { name: /^Ter/ })
    .click();
  await expect(presence).toHaveAttribute("aria-pressed", "true");
  fs.mkdirSync("qa/agenda-attendance", { recursive: true });
  await page.screenshot({ path: "qa/agenda-attendance/presence.png" });
  assert.deepEqual(errors, []);
});
