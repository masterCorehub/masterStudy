import { _electron as electron } from "playwright";
import { expect } from "playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  preparePreview,
  previewState,
  LONG_TASK,
} from "../tests/e2e/fixtures/calendarPreview.js";

const require = createRequire(import.meta.url);
const database = require("../electron/storage/study-db.cjs");
const profile = await mkdtemp(join(tmpdir(), "masterstudy-calendar-native-"));
const fakeApp = { getPath: () => profile };
let application;
const errors = [];
try {
  // Seed only a temporary SQLite profile; never open the user's real library.
  database.saveState(fakeApp, previewState);
  database.closeDatabase();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    executablePath: resolve(process.argv[2]),
    args: [`--user-data-dir=${profile}`, "--disable-gpu"],
    env,
  });
  expect(await application.evaluate(({ app }) => app.getPath("userData"))).toBe(
    profile,
  );
  const page = await application.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await preparePreview(page);
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.getByRole("button", { name: "Tarefas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Minhas Tarefas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calendário", exact: true }).click();
  await expect(page.locator(".academic-calendar-month")).toHaveAttribute(
    "data-week-count",
    "5",
  );
  await expect(
    page
      .locator('[data-date="2026-10-08"]')
      .getByText("Tarefa · Concluída", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Meta+k");
  const palette = page.getByRole("dialog", {
    name: "Paleta de Comandos Global",
  });
  await palette.getByRole("button", { name: /Cursos/ }).click();
  await expect(palette.getByText("salsalslalsa", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    palette.getByText("SISTEMAS DISTRIBUÍDOS", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await mkdir("qa/calendar-tasks", { recursive: true });
  await page.screenshot({ path: "qa/calendar-tasks/packaged-calendar.png" });

  // Exercise a real utility renderer with the packaged preload and real IPC.
  const popupPromise = application.waitForEvent("window");
  await application.evaluate(async ({ app, BrowserWindow }) => {
    const win = new BrowserWindow({
      width: 360,
      height: 470,
      frame: false,
      transparent: true,
      webPreferences: {
        preload: `${app.getAppPath()}/electron/preload.cjs`,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    await win.loadFile(`${app.getAppPath()}/dist/index.html`, {
      query: { screen: "tray_popover", standalone: "1" },
    });
  });
  const popup = await popupPromise;
  popup.on("pageerror", (error) => errors.push(error.message));
  await popup.clock.install({ time: new Date(2026, 9, 8, 12) });
  await popup.reload();
  await expect(
    popup.getByRole("main", { name: "Menu rápido masterStudy" }),
  ).toBeVisible();
  await expect(popup.getByText(LONG_TASK, { exact: true })).toBeVisible();
  await expect(
    popup.getByText("Tarefa de amanhã", { exact: true }),
  ).toHaveCount(0);
  await popup
    .getByRole("textbox", { name: "Nova tarefa para hoje" })
    .fill("Tarefa nativa de teste");
  await popup
    .getByRole("button", { name: "Adicionar tarefa", exact: true })
    .click();
  await expect(
    page
      .locator(".academic-calendar-day-preview")
      .getByText("Tarefa nativa de teste", { exact: true }),
  ).toBeVisible();
  await popup
    .getByRole("button", {
      name: "Concluir tarefa Tarefa nativa de teste",
      exact: true,
    })
    .click();
  await expect
    .poll(async () => {
      const data = await page.evaluate(() =>
        window.studyhubDesktop.studyDatabase.load(),
      );
      return data.state.tasks.list.find(
        (t) => t.title === "Tarefa nativa de teste",
      )?.completedDate;
    })
    .toBe("2026-10-08");
  await popup.screenshot({ path: "qa/calendar-tasks/packaged-menu.png" });
  await popup
    .getByRole("button", { name: "Buscar no app", exact: true })
    .click();
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await popup
    .getByRole("button", { name: "Todas as tarefas", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Minhas Tarefas" }),
  ).toBeVisible();
  const noteCount = await page.evaluate(
    async () =>
      (await window.studyhubDesktop.studyDatabase.load()).state.studyItems
        .length,
  );
  const notePromise = application.waitForEvent("window");
  await popup.getByRole("button", { name: "Nota rápida", exact: true }).click();
  const note = await notePromise;
  await expect(note).toHaveURL(/mode=note-search/);
  expect(
    await page.evaluate(
      async () =>
        (await window.studyhubDesktop.studyDatabase.load()).state.studyItems
          .length,
    ),
  ).toBe(noteCount);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      ok: true,
      packagedCalendar: true,
      tasksRestoredFromSQLite: true,
      searchVisibility: true,
      nativeMenuIPC: true,
      taskCreatedAndCompletedAcrossWindows: true,
      quickNoteOpenedWithoutCreatingNote: true,
      rendererErrors: errors,
    }),
  );
} finally {
  database.closeDatabase();
  await application?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
