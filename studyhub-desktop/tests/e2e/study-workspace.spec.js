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

for (const provider of ["ollama-web", "gemini-desktop"]) {
  test(`Learning workspace panels and study tools: ${provider}`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 980 });
    await page.addInitScript(
      ({ authKey, session, provider }) => {
        if (provider === "gemini-desktop") {
          window.toolRequests = [];
          window.studyhubDesktop = {
            academicAI: {
              status: async () => ({
                provider: "gemini",
                available: true,
                models: [{ name: "gemini-test" }],
              }),
              indexSources: async () => ({ results: [{ ok: true }] }),
              generate: async (payload) => {
                window.toolRequests.push(payload);
                if (window.invalidToolResponse)
                  return { content: '{"cards":[]}' };
                if (payload.kind === "flashcards")
                  return {
                    content: JSON.stringify({
                      cards: [
                        {
                          front: "O que é uma pilha?",
                          back: "Estrutura LIFO.",
                        },
                      ],
                    }),
                  };
                if (payload.kind === "mindmap")
                  return {
                    content: JSON.stringify({
                      label: "Estruturas",
                      children: [
                        { label: "Pilha", children: [{ label: "LIFO" }] },
                      ],
                    }),
                  };
                return {
                  content:
                    "### Guia de teste\nMaterial gerado para conferir a interface.",
                };
              },
            },
          };
        }
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
                  aiChatHistories: {
                    "preview-subject-one": Array.from(
                      { length: 20 },
                      (_, i) => ({
                        role: i % 2 ? "ai" : "user",
                        content:
                          `Conversa ${i}: ` +
                          "Conteúdo de revisão. ".repeat(40),
                        time: "10:00",
                      }),
                    ),
                  },
                  resources: [
                    {
                      id: "source-one",
                      subjectId: "preview-subject-one",
                      semesterId: "preview-semester",
                      type: "link",
                      title: "Referência de programação",
                      url: "https://example.invalid",
                      selected: true,
                    },
                    {
                      id: "source-two",
                      subjectId: "preview-subject-one",
                      semesterId: "preview-semester",
                      type: "link",
                      title: "Exercícios da semana",
                      url: "https://example.invalid/exercises",
                      selected: true,
                    },
                    ...Array.from({ length: 20 }, (_, i) => ({
                      id: `extra-${i}`,
                      subjectId: "preview-subject-one",
                      semesterId: "preview-semester",
                      type: "link",
                      title: `Material ${i}`,
                      url: "https://example.invalid",
                      selected: true,
                    })),
                  ],
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
      { authKey, session, provider },
    );
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://studyhub.test")
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            url.pathname === "/api/generate"
              ? {
                  response:
                    "### Guia de teste\nMaterial gerado para conferir a interface.",
                }
              : url.pathname.endsWith("/user")
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

    fs.mkdirSync("qa/study-workspace", { recursive: true });
    await page
      .getByRole("button", { name: "Cursos e Disciplinas", exact: true })
      .click();
    await page.locator(".study-create-menu > summary").click();
    await expect(
      page.getByRole("button", { name: "Nova Disciplina", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Nova Disciplina", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: "qa/study-workspace/mobile-courses.png" });
    await page.setViewportSize({ width: 1440, height: 980 });
    await page.screenshot({ path: "qa/study-workspace/courses.png" });
    await page.getByText("Programação", { exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Conversa com suas fontes",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("#study-sources-panel")).toHaveCount(0);
    await expect(page.locator("#study-tools-panel")).toHaveCount(0);
    const conversations = page.getByRole("combobox", { name: "Selecionar conversa" });
    const originalChat = await conversations.inputValue();
    await page.getByRole("button", { name: "Criar novo chat", exact: true }).click();
    const newChat = await conversations.inputValue();
    assert.notEqual(newChat, originalChat);
    await page.getByRole("button", { name: "Renomear chat", exact: true }).click();
    await page.getByRole("textbox", { name: "Nome do chat", exact: true }).fill("Revisão isolada");
    await page.getByRole("textbox", { name: "Nome do chat", exact: true }).press("Enter");
    await expect(conversations.locator("option:checked")).toHaveText("Revisão isolada");
    await conversations.selectOption(originalChat);
    await expect(conversations).toHaveValue(originalChat);
    await expect(page.locator(".study-subject-page aside")).toHaveCount(0);
    await page.setViewportSize({ width: 1200, height: 600 });
    const suggestions = page.locator(".study-chat-suggestions");
    const suggestion = suggestions.getByRole("button").first();
    const rowBox = await suggestions.boundingBox();
    const buttonBox = await suggestion.boundingBox();
    const inputBox = await page
      .getByRole("textbox", { name: "Pergunta para a IA" })
      .boundingBox();
    assert.ok(
      buttonBox.height >= 36 &&
        buttonBox.y >= rowBox.y &&
        buttonBox.y + buttonBox.height <= rowBox.y + rowBox.height,
    );
    assert.ok(buttonBox.y + buttonBox.height <= inputBox.y);
    await page.screenshot({
      path: `qa/study-workspace/suggestions-${provider}.png`,
    });
    await page.setViewportSize({ width: 1440, height: 980 });
    await page.screenshot({ path: "qa/study-workspace/studio.png" });
    await page.getByRole("button", { name: /^Fontes / }).click();
    await expect(
      page.getByRole("textbox", { name: "Buscar fontes", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Buscar fontes", exact: true })
      .fill("Referência");
    await expect(
      page.locator("#study-sources-panel input[type=checkbox]"),
    ).toHaveCount(1);
    await page.locator("#study-sources-panel label").click();
    await expect(
      page.locator("#study-sources-panel input[type=checkbox]"),
    ).not.toBeChecked();
    await page.screenshot({ path: "qa/study-workspace/sources.png" });
    await page
      .getByRole("button", { name: "Ferramentas", exact: true })
      .click();
    await expect(page.locator("#study-sources-panel")).toHaveCount(0);
    await expect(page.locator("#study-tools-panel")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Guia de Estudo/ }),
    ).toBeVisible();
    await page.screenshot({ path: "qa/study-workspace/tools.png" });
    await page.getByRole("button", { name: /Guia de Estudo/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Ferramenta de estudo", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Conteúdo Gerado — Programação",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Fechar ferramenta de estudo", exact: true })
      .click();
    if (provider === "gemini-desktop") {
      await page.getByRole("button", { name: /Flashcards IA/ }).click();
      await expect(
        page.getByText("O que é uma pilha?", { exact: true }),
      ).toBeVisible();
      await page.getByText("O que é uma pilha?", { exact: true }).click();
      await expect(
        page.getByText("Estrutura LIFO.", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Fechar ferramenta de estudo" })
        .click();
      await page.getByRole("button", { name: /Mapa Mental/ }).click();
      await expect(
        page.locator(".study-mindmap").getByText("LIFO", { exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: "qa/study-workspace/mindmap-gemini.png" });
      await page
        .getByRole("button", { name: "Fechar ferramenta de estudo" })
        .click();
      const requests = await page.evaluate(() => window.toolRequests);
      assert.deepEqual(
        requests.map((r) => r.kind),
        ["guide", "flashcards", "mindmap"],
      );
      assert.deepEqual(requests.at(-1).sourceIds, [
        "source-two",
        ...Array.from({ length: 20 }, (_, i) => `extra-${i}`),
      ]);
      assert.equal(requests.at(-1).model, "gemini-test");
      await page.evaluate(() => {
        window.invalidToolResponse = true;
      });
      await page.getByRole("button", { name: /Flashcards IA/ }).click();
      await expect(
        page.getByText(/precisam conter pergunta e resposta/),
      ).toBeVisible();
      await page.evaluate(() => {
        window.invalidToolResponse = false;
      });
      await page.getByRole("button", { name: "Tentar Novamente" }).click();
      await expect(
        page.getByText("O que é uma pilha?", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Fechar ferramenta de estudo" })
        .click();
    }
    await page
      .getByRole("button", { name: "Fechar ferramentas", exact: true })
      .click();
    await page.getByRole("button", { name: "Aulas", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Registrar Aula", exact: true }),
    ).toBeVisible();
    await page.locator(".study-more-nav summary").click();
    await page
      .getByRole("button", { name: "Provas e notas", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Provas e notas", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Estúdio de estudo", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: /^Fontes / }).click();
    await expect(page.locator("#study-sources-panel")).toBeVisible();
    await expect(
      page.locator("#study-sources-panel input[type=checkbox]"),
    ).not.toBeChecked();
    await expect(page.locator(".study-chat-panel")).not.toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: "qa/study-workspace/mobile-sources.png" });
    await page
      .getByRole("button", { name: "Fechar fontes", exact: true })
      .click();
    await expect(page.locator(".study-chat-panel")).toBeVisible();
    await page.screenshot({ path: "qa/study-workspace/mobile-studio.png" });
    assert.deepEqual(errors, []);
  });
}
