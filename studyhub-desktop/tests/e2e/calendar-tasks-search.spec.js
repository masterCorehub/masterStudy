import { test, expect } from "playwright/test";
import fs from "node:fs";
import {
  LONG_TASK,
  preparePreview,
  storedState,
} from "./fixtures/calendarPreview.js";

const openCalendar = async (page) => {
  await page.getByRole("button", { name: "Calendário", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Calendário acadêmico" }),
  ).toBeVisible();
};
const todayWidget = (page) =>
  page
    .locator(".today-panel")
    .filter({ has: page.getByRole("heading", { name: /Tarefas de hoje/ }) });

test("Hoje respeita datas; Tarefas retorna ao menu e conclusão em outra tela persiste", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await preparePreview(page);
  await page.goto("http://studyhub.test");
  const widget = todayWidget(page);
  await expect(widget.getByText(LONG_TASK, { exact: true })).toBeVisible();
  await expect(
    widget.getByText("Concluída hoje com prazo anterior", { exact: true }),
  ).toBeVisible();
  for (const title of [
    "Tarefa de amanhã",
    "Tarefa atrasada",
    "Tarefa sem prazo",
    "Concluída em outro dia",
  ])
    await expect(widget.getByText(title, { exact: true })).toHaveCount(0);
  const sidebar = page.getByRole("navigation", { name: "Navegação principal" });
  await sidebar.getByRole("button", { name: "Tarefas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tarefas", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Tarefas", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: /Lista/ }).click();
  const late = page
    .locator(".campus-task-row")
    .filter({ hasText: "Tarefa atrasada" });
  await late.locator("button").first().click();
  await expect
    .poll(
      async () =>
        (await storedState(page)).tasks.list.find((t) => t.id === "late")
          .completedDate,
    )
    .toBe("2026-10-08");
  await sidebar.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(
    widget.getByText("Tarefa atrasada", { exact: true }),
  ).toBeVisible();
  await widget
    .getByRole("button", {
      name: "Reabrir tarefa Tarefa atrasada",
      exact: true,
    })
    .click();
  await expect(
    widget.getByText("Tarefa atrasada", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    sidebar.getByRole("button", { name: "Tarefas", exact: true }),
  ).toBeVisible();
  expect((await storedState(page)).sidebarHiddenItems).toEqual(["projects"]);
  expect(errors).toEqual([]);
});

test("Cmd+K e biblioteca mostram as mesmas disciplinas, sem arquivadas nem outro semestre", async ({
  page,
}) => {
  await preparePreview(page);
  await page.goto("http://studyhub.test");
  await page
    .getByRole("button", { name: "Cursos e Disciplinas", exact: true })
    .click();
  const names = await page
    .locator(".campus-discipline-card h2")
    .allTextContents();
  expect(names).toHaveLength(4);
  // Playwright escolhe Command no macOS e Control no Linux/Windows.
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", {
    name: "Paleta de Comandos Global",
  });
  await expect(palette).toBeVisible();
  await palette.getByRole("button", { name: /Cursos/ }).click();
  for (const name of names)
    await expect(palette.getByText(name, { exact: true })).toBeVisible();
  await expect(palette.getByText("salsalslalsa", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    palette.getByText("Disciplina de outro semestre", { exact: true }),
  ).toHaveCount(0);
  await palette.getByText(names[0], { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: names[0], exact: true }).first(),
  ).toBeVisible();
  expect((await storedState(page)).academic.subjects).toHaveLength(6);
});

test("Calendário mostra estado das tarefas, mês compacto, arraste e datas de criação", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await preparePreview(page);
  await page.goto("http://studyhub.test");
  await openCalendar(page);
  await expect(page.locator(".academic-calendar-month")).toHaveAttribute(
    "data-week-count",
    "5",
  );
  await expect(page.locator(".academic-calendar-day")).toHaveCount(35);
  const cell = page.locator('[data-date="2026-10-08"]');
  await expect(
    cell.getByText("Tarefa · Concluída", { exact: true }),
  ).toBeVisible();
  await expect(
    cell.getByText("Tarefa · Pendente", { exact: true }),
  ).toBeVisible();
  await expect(
    cell.locator('[data-event-id="task-done-calendar"]'),
  ).toHaveClass(/is-completed/);
  await expect(
    page
      .locator(".academic-calendar-deadlines")
      .getByText("Entrega já concluída", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".academic-calendar-deadlines")
      .getByText(LONG_TASK, { exact: true }),
  ).toBeVisible();
  const task = cell.locator('[data-event-id="task-today"]');
  await task.dragTo(page.locator('[data-date="2026-10-10"]'));
  await expect
    .poll(
      async () =>
        (await storedState(page)).tasks.list.find((t) => t.id === "today")
          .dueDate,
    )
    .toBe("2026-10-10");
  await page
    .locator('[data-date="2026-10-09"] [data-event-id="project-project"]')
    .dragTo(page.locator('[data-date="2026-10-12"]'));
  await expect
    .poll(
      async () =>
        (await storedState(page)).academic.projects.find(
          (t) => t.id === "project",
        ).dueDate,
    )
    .toBe("2026-10-12");
  await page.reload();
  await openCalendar(page);
  await expect(
    page.locator('[data-date="2026-10-10"] [data-event-id="task-today"]'),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Próximo período", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Novembro de 2026" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await expect(page.locator('input[type="date"]')).toHaveValue("2026-11-08");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Hoje", exact: true }).last().click();
  for (const label of ["Semana", "Dia", "Mês"]) {
    await page
      .locator(".academic-calendar-views")
      .getByRole("button", { name: label, exact: true })
      .click();
    await expect(
      page
        .locator(".academic-calendar-views")
        .getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  fs.mkdirSync("qa/calendar-tasks", { recursive: true });
  await page.screenshot({ path: "qa/calendar-tasks/calendar-amber.png" });
  expect(errors).toEqual([]);
});

for (const theme of ["brisa-amber", "light"])
  test(`Calendário legível e sem vazamento de largura em ${theme}`, async ({
    page,
  }) => {
    await preparePreview(page, { theme });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("http://studyhub.test");
    await openCalendar(page);
    const colors = await page
      .locator(".academic-calendar-deadline.is-due-today")
      .first()
      .evaluate((el) => {
        // O navegador normaliza color(srgb ...) e rgb(...) para o mesmo espaço.
        const ctx = document.createElement("canvas").getContext("2d");
        const rgb = (color) => {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        return {
          background: rgb(getComputedStyle(el).backgroundColor),
          text: rgb(getComputedStyle(el.querySelector("strong")).color),
        };
      });
    const channels = (color) =>
      color.map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    const luminance = (color) => {
      const [r, g, b] = channels(color);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const values = [luminance(colors.background), luminance(colors.text)].sort(
      (a, b) => a - b,
    );
    expect((values[1] + 0.05) / (values[0] + 0.05)).toBeGreaterThanOrEqual(4.5);
    for (const width of [1000, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole("region", { name: "Calendário acadêmico" }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const calendar = await page.locator(".academic-calendar").boundingBox();
      expect(calendar.x + calendar.width).toBeLessThanOrEqual(width);
      await page
        .locator(".academic-calendar-views")
        .getByRole("button", { name: "Dia", exact: true })
        .click();
      await expect(
        page
          .locator(".academic-calendar-agenda")
          .getByText("Entrega já concluída", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `qa/calendar-tasks/calendar-${theme}-${width}.png`,
      });
    }
  });

test("Menu do macOS prioriza Hoje, acompanha tema e executa atalhos", async ({
  page,
}) => {
  await preparePreview(page, { tray: true });
  await page.setViewportSize({ width: 360, height: 470 });
  await page.goto("http://studyhub.test?screen=tray_popover&standalone=1");
  await expect(
    page.getByRole("main", { name: "Menu rápido masterStudy" }),
  ).toBeVisible();
  for (const title of [
    "Tarefa de amanhã",
    "Tarefa atrasada",
    "Tarefa sem prazo",
    "Concluída em outro dia",
  ])
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Nova tarefa para hoje" })
    .fill("Tarefa criada no menu");
  await page
    .getByRole("button", { name: "Adicionar tarefa", exact: true })
    .click();
  await expect(
    page.getByText("Tarefa criada no menu", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Concluir tarefa Tarefa criada no menu",
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (await storedState(page)).tasks.list.find(
          (t) => t.title === "Tarefa criada no menu",
        ).completedDate,
    )
    .toBe("2026-10-08");
  await page.getByRole("button", { name: "Nota rápida", exact: true }).click();
  await page
    .getByRole("button", { name: "Buscar no app", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Todas as tarefas", exact: true })
    .click();
  expect(await page.evaluate(() => window.trayActions)).toEqual([
    "quick-note",
    "search",
    "tasks",
  ]);
  await page.screenshot({ path: "qa/calendar-tasks/menu-macos.png" });
  await page.getByLabel("Mais ações").click();
  await expect(
    page.getByRole("button", { name: "Extrair texto de imagem" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.trayActions.slice(-2))).toEqual([
    "settings",
    "close",
  ]);
});
