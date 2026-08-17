#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const {
  closeDatabase,
  saveState,
} = require("../electron/storage/study-db.cjs");

const projectRoot = path.resolve(__dirname, "..");
const options = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.length ? value.join("=") : true];
  }),
);
const mode = options.mode === "migrated" ? "migrated" : "fresh";
const profilePath = options.profile
  ? path.resolve(String(options.profile))
  : fs.mkdtempSync(path.join(os.tmpdir(), `studyhub-smoke-${mode}-`));
const executablePath = options.executable
  ? path.resolve(String(options.executable))
  : require("electron");
const trace = (message) => {
  if (options.verbose) process.stderr.write(`[smoke] ${message}\n`);
};

function seedMigratedProfile() {
  saveState(
    { getPath: () => profilePath },
    {
      courses: [
        {
          id: "legacy-course",
          title: "Hub de Cálculo",
          progress: 50,
          modules: [
            {
              id: "legacy-module",
              title: "Fundamentos",
              lessons: [
                {
                  id: "legacy-lesson",
                  title: "Introdução ao cálculo",
                  description: "Limites e taxas de variação.",
                  status: "completed",
                },
              ],
            },
          ],
        },
      ],
      tasks: {
        list: [
          {
            id: "legacy-task",
            title: "Lista de derivadas",
            status: "pending",
            dueDate: "2026-07-24",
            context: { courseId: "legacy-course" },
          },
        ],
      },
      studyItems: [
        {
          id: "legacy-note",
          title: "Resumo de limites",
          content: "<p>Um limite descreve o comportamento de uma função.</p>",
          sourceCourseId: "legacy-course",
          tags: ["cálculo"],
        },
      ],
      flashcardDecks: [
        {
          id: "legacy-deck",
          title: "Cálculo ativo",
          courseId: "legacy-course",
          cards: [],
        },
      ],
      focusSessions: [
        {
          id: "legacy-focus",
          taskId: "legacy-task",
          actualSeconds: 1_500,
          endedAt: Date.now(),
        },
      ],
      noteVersions: [],
      studyPlans: [],
      importTransactions: [],
      academic: {
        semesters: [
          {
            id: "semester-current",
            name: "2026.1",
            startDate: "2026-02-02",
            endDate: "2026-07-31",
            status: "active",
          },
          {
            id: "semester-next",
            name: "2026.2",
            startDate: "2026-08-03",
            endDate: "2026-12-18",
            status: "planned",
          },
        ],
        activeSemesterId: "semester-current",
        subjects: [
          {
            id: "legacy-subject",
            semesterId: "semester-current",
            name: "Cálculo I",
            code: "MAT101",
            professor: "Profa. Ada",
            room: "Bloco A · 204",
            credits: 4,
            color: "#7c3aed",
            courseId: "legacy-course",
            passingGrade: 6,
            minimumAttendance: 75,
            schedule: {
              days: [1, 3],
              startTime: "08:00",
              endTime: "10:00",
            },
          },
          {
            id: "future-subject",
            semesterId: "semester-next",
            name: "Algoritmos",
            code: "CC201",
            professor: "Prof. Turing",
            color: "#0f9f8f",
            passingGrade: 6,
            minimumAttendance: 75,
          },
        ],
        grades: [
          {
            id: "legacy-grade",
            subjectId: "legacy-subject",
            title: "P1",
            score: 8,
            maxScore: 10,
            weight: 40,
          },
        ],
        attendance: [
          {
            id: "legacy-attendance",
            subjectId: "legacy-subject",
            date: "2026-07-20",
            status: "present",
          },
        ],
      },
    },
  );
  closeDatabase();
}

async function main() {
  fs.mkdirSync(profilePath, { recursive: true });
  if (mode === "migrated") seedMigratedProfile();
  trace(`perfil ${mode}: ${profilePath}`);
  const launchEnvironment = {
    ...process.env,
    APPIMAGELAUNCHER_DISABLE: "1",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  };
  delete launchEnvironment.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    executablePath,
    args: [
      ...(options.executable ? [] : [projectRoot]),
      `--user-data-dir=${profilePath}`,
      "--ozone-platform=x11",
      "--disable-gpu",
    ],
    cwd: projectRoot,
    env: launchEnvironment,
    timeout: 45_000,
  });
  const launchedProcess = app.process();
  trace("Electron iniciado");
  const rendererErrors = [];
  const attachDiagnostics = (page) => {
    page.on("pageerror", (error) =>
      rendererErrors.push(error.stack || error.message),
    );
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text());
    });
  };
  app.on("window", attachDiagnostics);

  try {
    const page = await app.firstWindow({ timeout: 45_000 });
    trace("janela principal encontrada");
    attachDiagnostics(page);
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: "Faculdade", exact: true }).click();
    await page
      .getByRole("heading", { name: "Faculdade", exact: true })
      .waitFor();
    trace("Faculdade aberta");
    await assertNoErrorScreen(page);

    await page
      .getByRole("button", { name: "Disciplinas", exact: true })
      .click();
    if (mode === "fresh") {
      await page
        .getByRole("heading", { name: "Nenhuma matéria", exact: true })
        .waitFor();
    } else {
      const snapshot = await page.evaluate(() =>
        window.studyhubDesktop?.studyDatabase?.load(),
      );
      trace(
        `snapshot carregado: ${snapshot?.state?.academic?.subjects?.length || 0} matéria(s)`,
      );
      const subjectButton = page
        .getByRole("button")
        .filter({
          has: page.getByRole("heading", { name: "Cálculo I", exact: true }),
        })
        .first();
      await subjectButton.waitFor();
      await subjectButton.click();
      await page
        .getByRole("heading", { name: "Cálculo I", exact: true })
        .waitFor();
      trace("matéria migrada aberta");
      trace(
        `abas Aulas encontradas: ${await page.getByRole("button", { name: "Aulas", exact: true }).count()}`,
      );
      await page
        .getByRole("button", { name: "Aulas", exact: true })
        .click({ timeout: 8_000 });
      trace("aba Aulas aberta");
      await page.waitForTimeout(500);
      trace(
        `aulas vinculadas encontradas: ${await page.getByText("Introdução ao cálculo", { exact: true }).count()}`,
      );
      if (options.verbose) {
        trace((await page.locator("main").innerText()).slice(0, 2_500));
      }
      await page.getByText("Introdução ao cálculo", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Plano e IA", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "IA acadêmica", exact: true })
        .waitFor();
      const academicAiResult = await page.evaluate(async () => {
        const api = window.studyhubDesktop?.academicAI;
        const indexed = await api.indexSources({
          subjectId: "legacy-subject",
          semesterId: "semester-current",
          sources: [
            {
              id: "smoke-authorized-note",
              kind: "note",
              title: "Nota autorizada",
              locator: "Anotação",
              content: "A derivada mede a taxa de variação instantânea.",
            },
          ],
        });
        const sources = await api.listSources("legacy-subject");
        const removed = await api.removeSource("smoke-authorized-note");
        return {
          indexed: indexed.results?.[0]?.ok,
          sourceKeys: sources.map((source) => source.sourceKey),
          removed: removed.removed,
        };
      });
      assert.deepEqual(academicAiResult, {
        indexed: true,
        sourceKeys: ["smoke-authorized-note"],
        removed: true,
      });
      trace("abas da matéria validadas");

      if (options["check-note-context"]) {
        await page
          .getByRole("button", { name: "Notas", exact: true })
          .click({ timeout: 8_000 });
        trace("biblioteca de notas aberta");
        await page.waitForTimeout(500);
        if (options.verbose) {
          trace((await page.locator("main").innerText()).slice(0, 3_000));
        }
        await page
          .getByRole("heading", { name: "Resumo de limites", exact: true })
          .click({ timeout: 8_000 });
        trace("editor da nota aberto");
        trace(
          `seletores de semestre: ${await page.getByRole("button", { name: "Selecionar semestre da nota", exact: true }).count()}`,
        );
        await page
          .getByRole("button", {
            name: "Selecionar semestre da nota",
            exact: true,
          })
          .click({ timeout: 8_000 });
        trace("seletor de semestre aberto");
        await page
          .getByRole("button", { name: "2026.2", exact: true })
          .last()
          .click({ timeout: 8_000 });
        trace("semestre 2026.2 selecionado");
        await page
          .getByRole("button", {
            name: "Selecionar matéria da nota",
            exact: true,
          })
          .click({ timeout: 8_000 });
        trace("seletor de matéria aberto");
        await page
          .getByRole("button", { name: "Algoritmos", exact: true })
          .last()
          .click({ timeout: 8_000 });
        trace("matéria Algoritmos selecionada");
        await page
          .getByRole("button", {
            name: "Cor de destaque: tertiary",
            exact: true,
          })
          .click({ timeout: 8_000 });
        trace("cor terciária selecionada");
        await page.waitForTimeout(800);

        const persistedContext = await page.evaluate(async () => {
          const snapshot = await window.studyhubDesktop?.studyDatabase?.load();
          const note = snapshot?.state?.studyItems?.find(
            (item) => item.id === "legacy-note",
          );
          return {
            academicSemesterId: note?.academicSemesterId,
            academicSubjectId: note?.academicSubjectId,
            accent: note?.accent,
          };
        });
        assert.deepEqual(persistedContext, {
          academicSemesterId: "semester-next",
          academicSubjectId: "future-subject",
          accent: "tertiary",
        });
        trace("seleção de semestre e matéria da nota validada");
      }
    }

    await assertNoErrorScreen(page);
    if (options.screenshot) {
      await page.screenshot({
        path: path.resolve(String(options.screenshot)),
        fullPage: true,
      });
    }
    assert.deepEqual(rendererErrors, [], rendererErrors.join("\n\n"));
    process.stdout.write(
      `${JSON.stringify({ ok: true, mode, profilePath, executablePath })}\n`,
    );
  } catch (error) {
    process.stderr.write(`[smoke] falha: ${error.stack || error.message}\n`);
    throw error;
  } finally {
    await app
      .evaluate(({ app: electronApp }) => {
        setImmediate(() => electronApp.exit(0));
        return true;
      })
      .catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (launchedProcess?.exitCode === null) launchedProcess.kill("SIGKILL");
  }
}

async function assertNoErrorScreen(page) {
  assert.equal(
    await page.getByText("Something went wrong.", { exact: true }).count(),
    0,
    "A tela de erro do React foi exibida.",
  );
  assert.equal(
    await page.getByText(/Minified React error #185/).count(),
    0,
    "O React entrou em um ciclo de atualização.",
  );
}

main().catch((error) => {
  closeDatabase();
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
