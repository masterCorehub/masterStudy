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

test("Today flow preserves geometry in organization, reorders, persists, restores and scrolls long lists", async ({
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

  const widget = (id) => page.locator(`[data-dashboard-widget-id="${id}"]`);
  const saved = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("studyhub-storage-v2")).state
          .dashboardWidgets,
    );
  const check = async (label) => {
    await expect
      .poll(() =>
        page.locator(".today-panel").evaluateAll((panels) =>
          panels.every((panel) => {
            const body = panel.querySelector(".today-panel-layout");
            const css = getComputedStyle(panel);
            return (
              body.getBoundingClientRect().bottom <=
              panel.getBoundingClientRect().bottom -
                parseFloat(css.paddingBottom) +
                1
            );
          }),
        ),
      )
      .toBe(true);
    const rects = await page
      .locator("[data-dashboard-widget-id]")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          id: node.dataset.dashboardWidgetId,
          rect: node.getBoundingClientRect().toJSON(),
        })),
      );
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].rect,
          b = rects[j].rect;
        assert.ok(
          !(
            a.left < b.right - 1 &&
            a.right > b.left + 1 &&
            a.top < b.bottom - 1 &&
            a.bottom > b.top + 1
          ),
          label + ": " + rects[i].id + " overlaps " + rects[j].id,
        );
      }
  };
  await widget("schedule").waitFor();
  await check("initial");
  await page
    .getByRole("group", { name: "Dia da agenda" })
    .getByRole("button", { name: /Sex/ })
    .click();
  await expect(widget("schedule")).toContainText("Sem aulas neste dia");
  await page
    .getByRole("group", { name: "Dia da agenda" })
    .getByRole("button", { name: /Seg/ })
    .click();
  await expect(widget("schedule")).toContainText("Estrutura de Dados");
  await expect(widget("summary")).toContainText("25 min");
  fs.mkdirSync("qa/today-flow", { recursive: true });
  await page.screenshot({
    path: "qa/today-flow/desktop-empty.png",
    fullPage: true,
  });
  // Exercise the real store actions with temporary, isolated preview data.
  for (const title of [
    "Revisar conteúdo da última aula",
    "Resolver exercícios de programação",
    "Organizar anotações da semana",
  ]) {
    await page
      .getByRole("textbox", { name: "Nova tarefa para hoje" })
      .fill(title);
    await widget("tasks")
      .getByRole("button", { name: "Adicionar", exact: true })
      .click();
  }
  await page
    .getByRole("button", {
      name: "Concluir tarefa Revisar conteúdo da última aula",
      exact: true,
    })
    .click();
  await expect(widget("summary")).toContainText("1/3");
  for (const title of ["Ler por 15 minutos", "Praticar inglês"]) {
    await page
      .getByRole("textbox", { name: "Novo hábito", exact: true })
      .fill(title);
    await page
      .getByRole("button", { name: "Adicionar hábito", exact: true })
      .click();
  }
  await page
    .getByRole("button", {
      name: "Concluir hábito Ler por 15 minutos",
      exact: true,
    })
    .click();
  await expect(widget("summary")).toContainText("1/2");
  await widget("water")
    .getByRole("button", { name: "+ 250 ml", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "Meta de hidratação" }),
  ).toHaveAttribute("aria-valuenow", "13");
  const dismiss = page.getByTitle("Dispensar alerta").first();
  if (await dismiss.count()) await dismiss.click();
  await expect
    .poll(() =>
      page
        .getByRole("progressbar")
        .locator("span")
        .evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBeGreaterThan(10);
  await page.screenshot({
    path: "qa/today-flow/desktop.png",
    fullPage: true,
  });
  const laneIds = () =>
    page
      .locator("[data-dashboard-lane]")
      .evaluateAll((lanes) =>
        Object.fromEntries(
          lanes.map((lane) => [
            lane.dataset.dashboardLane,
            [...lane.querySelectorAll("[data-dashboard-widget-id]")].map(
              (w) => w.dataset.dashboardWidgetId,
            ),
          ]),
        ),
      );
  const geometry = () =>
    page.locator("[data-dashboard-widget-id]").evaluateAll((nodes) =>
      Object.fromEntries(
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return [
            node.dataset.dashboardWidgetId,
            { width: r.width, height: r.height, top: r.top, left: r.left },
          ];
        }),
      ),
    );
  const originalOrder = {
    main: ["summary", "tasks", "schedule", "water"],
    side: ["deadlines", "habits", "flashcards"],
  };
  assert.deepEqual(await laneIds(), originalOrder);
  await expect(
    page.getByRole("button", { name: "Concluir organização", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".today-flow-controls")).toHaveCount(0);

  // Natural height is independent of legacy saved rowSpan; only long lists scroll.
  const tasksList = widget("tasks").locator(".today-list");
  assert.ok(
    await tasksList.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  );
  const shortHeight = (await widget("tasks").boundingBox()).height;
  for (let i = 0; i < 9; i++) {
    await page
      .getByRole("textbox", { name: "Nova tarefa para hoje" })
      .fill(`Item adicional ${i} para testar bastante conteúdo`);
    await widget("tasks")
      .getByRole("button", { name: "Adicionar", exact: true })
      .click();
  }
  await check("long lists scroll");
  assert.ok(
    await tasksList.evaluate(
      (el) => el.scrollHeight > el.clientHeight && el.clientHeight <= 181,
    ),
  );
  for (let i = 0; i < 9; i++)
    await page
      .getByRole("button", {
        name: `Excluir tarefa Item adicional ${i} para testar bastante conteúdo`,
        exact: true,
      })
      .click();
  assert.equal((await widget("tasks").boundingBox()).height, shortHeight);
  const beforeEditing = await geometry();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .getByRole("button", { name: "Organizar widgets", exact: true })
    .click();
  assert.deepEqual(
    await geometry(),
    beforeEditing,
    "organization controls must not change card geometry",
  );
  await page.screenshot({
    path: "qa/today-flow/organizing.png",
    fullPage: true,
  });

  const tasksHandle = widget("tasks").getByRole("button", {
    name: "Arrastar Tarefas de hoje",
    exact: true,
  });
  const handleBox = await tasksHandle.boundingBox();
  const targetBox = await widget("schedule").boundingBox();
  const orderBeforeDrag = await laneIds();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height * 0.8,
    { steps: 12 },
  );
  await expect(widget("schedule")).toHaveClass(/drop-after/);
  assert.deepEqual(
    await laneIds(),
    orderBeforeDrag,
    "preview must not move the targets",
  );
  await page.mouse.up();
  assert.deepEqual((await laneIds()).main, [
    "summary",
    "schedule",
    "tasks",
    "water",
  ]);
  await check("drag insertion");

  // Keyboard cancellation must leave the saved order intact.
  const beforeCancel = await saved();
  const waterHandle = widget("water").getByRole("button", {
    name: "Arrastar Hidratação",
    exact: true,
  });
  await waterHandle.focus();
  const waterBox = await waterHandle.boundingBox();
  const taskBox = await widget("tasks").boundingBox();
  await page.mouse.move(waterBox.x + 10, waterBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(taskBox.x + 100, taskBox.y - 6, { steps: 6 });
  await expect(widget("tasks")).toHaveClass(/drop-before/);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(await saved(), beforeCancel);
  await widget("summary").getByTitle("Mover para baixo").click();
  assert.deepEqual((await laneIds()).main, [
    "schedule",
    "summary",
    "tasks",
    "water",
  ]);
  await widget("water").getByTitle("Trocar coluna").click();
  assert.equal((await laneIds()).side.at(-1), "water");
  // A pointer drop also moves across columns, with the same before/after rule.
  const crossHandle = await widget("water")
    .getByRole("button", { name: "Arrastar Hidratação", exact: true })
    .boundingBox();
  const mainTarget = await widget("tasks").boundingBox();
  await page.mouse.move(crossHandle.x + 10, crossHandle.y + 10);
  await page.mouse.down();
  await page.mouse.move(mainTarget.x + 100, mainTarget.y + 20, { steps: 12 });
  await expect(widget("tasks")).toHaveClass(/drop-before/);
  await page.mouse.up();
  assert.deepEqual((await laneIds()).main, [
    "schedule",
    "summary",
    "water",
    "tasks",
  ]);
  assert.equal((await laneIds()).side.includes("water"), false);
  const sizesWhileEditing = await geometry();
  await page
    .getByRole("button", { name: "Concluir organização", exact: true })
    .click();
  assert.deepEqual(
    await geometry(),
    sizesWhileEditing,
    "leaving organization must not alter sizes or gaps",
  );
  const configuredOrder = await laneIds();
  await page.reload();
  await widget("tasks").waitFor();
  assert.deepEqual(await laneIds(), configuredOrder);
  await check("reload configured flow");
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page.getByRole("button", { name: /Hábitos.*Visível/ }).click();
  await expect(widget("habits")).toHaveCount(0);
  await page.getByRole("button", { name: /Hábitos.*Oculto/ }).click();
  await page
    .getByRole("button", { name: "Restaurar padrão", exact: true })
    .click();
  await page.keyboard.press("Escape");
  assert.deepEqual(await laneIds(), originalOrder);
  await expect(page.locator(".today-flow-controls")).toHaveCount(0);
  await check("restored default");
  await page.screenshot({ path: "qa/today-flow/desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await check("mobile natural flow");
  const main = await page.locator('[data-dashboard-lane="main"]').boundingBox();
  const side = await page.locator('[data-dashboard-lane="side"]').boundingBox();
  assert.ok(
    side.y >= main.y + main.height,
    "mobile columns stack without overlap",
  );
  await page.screenshot({ path: "qa/today-flow/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .getByRole("button", { name: "Organizar widgets", exact: true })
    .click();
  const mobileBefore = (await laneIds()).main;
  await widget("summary").getByTitle("Mover para baixo").click();
  assert.deepEqual((await laneIds()).main, [
    mobileBefore[1],
    mobileBefore[0],
    ...mobileBefore.slice(2),
  ]);
  await page
    .getByRole("button", { name: "Concluir organização", exact: true })
    .click();
  await check("mobile order");
  assert.equal(errors.length, 0);
});
