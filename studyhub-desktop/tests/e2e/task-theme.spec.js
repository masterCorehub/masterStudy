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

test("Task details follow app themes in reading, editing and mobile", async ({
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
              appSettings: { notificationsEnabled: false },
              tasks: { list: [{ id: 'theme-task', title: 'Preparar apresentação de programação com exemplos de funções, testes e resultados do projeto', dueDate: new Date().toLocaleDateString('en-CA'), isTodayTask: true, status: 'pending', priority: 'medium', subtasks: [] }, { id: 'overdue-task', title: 'Revisar o relatório da disciplina', dueDate: '2020-01-01', status: 'pending', priority: 'high', academicSubjectId: 'preview-subject-one', subtasks: [] }, { id: 'unscheduled-task', title: 'Organizar referências do projeto', status: 'pending', priority: 'low', subtasks: [] }] },
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
  const openDetails = async () => {
    await page.getByRole('button', { name: /^Preparar apresentação de programação/ }).first().click();
    await expect(page.locator('.campus-task-detail-page h1')).toBeVisible();
    // Dispensa apenas o aviso da fixture para capturar a tela inteira.
    const dismiss = page.getByTitle('Dispensar alerta');
    if (await dismiss.count()) await dismiss.first().click();
  };
  const checkColors = async () => {
    const colors = await page.evaluate(() => {
      const root = document.querySelector('.campus-task-detail-page');
      const token = name => {
        const span = document.createElement('span');
        span.style.color = 'var(' + name + ')';
        root.appendChild(span);
        const value = getComputedStyle(span).color;
        span.remove();
        return value;
      };
      return {
        text: getComputedStyle(root.querySelector('h1') || root.querySelector('.campus-task-detail-title-input')).color,
        expectedText: token('--on-surface'),
        panel: getComputedStyle(root.querySelector('.campus-task-detail-panel')).backgroundColor,
        expectedPanel: token('--surface-container-low'),
        font: parseFloat(getComputedStyle(root.querySelector('h1') || root.querySelector('.campus-task-detail-title-input')).fontSize),
      };
    });
    assert.equal(colors.text, colors.expectedText);
    assert.equal(colors.panel, colors.expectedPanel);
    assert.ok(colors.font <= 36);
  };
  await page.goto('http://studyhub.test');
  await openDetails();
  fs.mkdirSync('qa/task-theme', { recursive: true });
  for (const theme of ['brisa-amber', 'light', 'dark']) {
    if (theme !== 'brisa-amber') {
      await page.evaluate(theme => {
        const saved = JSON.parse(localStorage.getItem('studyhub-storage-v2'));
        saved.state.themePreference = theme;
        saved.state.isDarkMode = theme !== 'light';
        localStorage.setItem('studyhub-storage-v2', JSON.stringify(saved));
      }, theme);
      await page.reload();
      await openDetails();
    }
    await checkColors();
    await expect(page.getByRole('button', { name: 'Iniciar Pomodoro', exact: true })).toHaveCount(0);
    await page.screenshot({ path: 'qa/task-theme/' + theme + '.png' });
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await checkColors();
    await page.getByPlaceholder('Titulo da tarefa').fill('Tarefa editada');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.locator('.campus-task-detail-page h1')).toContainText('Preparar apresentação de programação');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'qa/task-theme/mobile.png' });
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.locator('.tasks-workspace h1')).toHaveText('Tarefas');
  await expect(page.locator('.campus-task-row')).toHaveCount(3);
  await expect(page.locator('.campus-task-group-today .campus-task-row')).toHaveCount(1);
  await expect(page.locator('.campus-task-group-overdue .campus-task-row')).toHaveCount(1);
  await expect(page.locator('.campus-task-group-unscheduled .campus-task-row')).toHaveCount(1);
  await page.getByRole('button', { name: /^Concluir Preparar apresentação/ }).click();
  await expect(page.locator('.campus-task-row')).toHaveCount(2);
  await page.getByRole('button', { name: /^Concluídas/ }).click();
  await expect(page.locator('.campus-task-row')).toHaveCount(1);
  await page.locator('.campus-task-row').press('Enter');
  await expect(page.locator('.campus-task-detail-page h1')).toBeVisible();
  await page.getByPlaceholder('Adicionar subtarefa', { exact: true }).fill('Conferir documento');
  await page.getByRole('button', { name: 'Adicionar subtarefa', exact: true }).click();
  await page.getByRole('button', { name: 'Marcar Conferir documento', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Progresso das subtarefas' })).toHaveAttribute('value', '1');
  await page.getByRole('button', { name: 'Voltar para tarefas', exact: true }).click();
  await page.screenshot({ path: 'qa/task-theme/tasks-list.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await expect(page.getByRole('textbox', { name: 'Buscar tarefas' })).toBeVisible();
  expect((await page.getByRole('textbox', { name: 'Buscar tarefas' }).boundingBox()).width).toBeGreaterThan(90);
  const rowSurface = await page.locator('.campus-task-row').first().evaluate(el => {
    const sample = document.createElement('span');
    sample.style.backgroundColor = 'var(--surface-container-low)';
    el.appendChild(sample);
    const expected = getComputedStyle(sample).backgroundColor;
    sample.remove();
    return { actual: getComputedStyle(el).backgroundColor, expected };
  });
  assert.equal(rowSurface.actual, rowSurface.expected);
  await page.screenshot({ path: 'qa/task-theme/tasks-mobile.png' });
  assert.deepEqual(errors, []);
});
