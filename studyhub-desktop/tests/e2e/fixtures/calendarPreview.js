import fs from "node:fs";
import path from "node:path";

export const LONG_TASK =
  "Preparar apresentação de programação com exemplos de funções, testes e resultados do projeto";
export const previewState = {
  themePreference: "brisa-amber",
  isDarkMode: true,
  appSettings: { notificationsEnabled: false },
  sidebarOrder: [
    "dashboard",
    "courses",
    "books",
    "materials",
    "journal",
    "knowledge",
    "reviews",
  ],
  sidebarHiddenItems: ["tasks", "projects"],
  courses: [],
  focusSessions: [
    {
      id: "focus",
      status: "completed",
      actualSeconds: 1500,
      completedAt: Date.now(),
    },
  ],
  tasks: {
    list: [
      {
        id: "today",
        title: LONG_TASK,
        dueDate: "2026-10-08",
        dueTime: "15:00",
        status: "pending",
        priority: "high",
        subtasks: [],
      },
      {
        id: "done-today",
        title: "Concluída hoje com prazo anterior",
        dueDate: "2026-10-07",
        status: "completed",
        completedDate: "2026-10-08",
        subtasks: [],
      },
      {
        id: "done-calendar",
        title: "Entrega já concluída",
        dueDate: "2026-10-08",
        status: "completed",
        completedDate: "2026-10-07",
        subtasks: [],
      },
      {
        id: "tomorrow",
        title: "Tarefa de amanhã",
        dueDate: "2026-10-09",
        status: "pending",
        isTodayTask: true,
        subtasks: [],
      },
      {
        id: "late",
        title: "Tarefa atrasada",
        dueDate: "2026-10-06",
        status: "pending",
        isTodayTask: true,
        subtasks: [],
      },
      {
        id: "undated",
        title: "Tarefa sem prazo",
        status: "pending",
        isTodayTask: true,
        subtasks: [],
      },
      {
        id: "done-old",
        title: "Concluída em outro dia",
        dueDate: "2026-10-06",
        status: "completed",
        completedDate: "2026-10-06",
        subtasks: [],
      },
    ],
  },
  academic: {
    activeSemesterId: "current",
    semesters: [
      {
        id: "current",
        name: "2026.2",
        startDate: "2026-08-01",
        endDate: "2026-12-20",
        status: "active",
      },
      { id: "previous", name: "2026.1", status: "completed" },
    ],
    subjects: [
      {
        id: "one",
        semesterId: "current",
        name: "SISTEMAS DISTRIBUÍDOS",
        color: "#8ab4f8",
        schedule: { days: [2], startTime: "19:00", endTime: "20:40" },
      },
      {
        id: "two",
        semesterId: "current",
        name: "SISTEMAS EMBARCADOS",
        color: "#d9be51",
        schedule: { days: [3], startTime: "19:00", endTime: "20:40" },
      },
      {
        id: "three",
        semesterId: "current",
        name: "PROGRAMAÇÃO PARA INTERFACE DE USUÁRIO",
        color: "#88ad67",
        schedule: { days: [4], startTime: "19:00", endTime: "20:40" },
      },
      {
        id: "four",
        semesterId: "current",
        name: "MUNDO DIGITAL",
        color: "#ca8181",
        schedule: { days: [5], startTime: "19:00", endTime: "20:40" },
      },
      {
        id: "archived",
        semesterId: "current",
        name: "salsalslalsa",
        isArchived: true,
      },
      {
        id: "previous-subject",
        semesterId: "previous",
        name: "Disciplina de outro semestre",
      },
    ],
    projects: [
      {
        id: "project",
        semesterId: "current",
        subjectId: "two",
        title: "Projeto de sistemas",
        dueDate: "2026-10-09",
        status: "pending",
      },
    ],
  },
};

export async function preparePreview(
  page,
  { theme = "brisa-amber", tray = false, state = previewState } = {},
) {
  await page.clock.install({ time: new Date(2026, 9, 8, 12) });
  const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
  const url =
    process.env.VITE_SUPABASE_URL ||
    env
      .match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, "") ||
    "https://example.supabase.co";
  const authKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "preview@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    user_metadata: { name: "Alexandre" },
    app_metadata: { provider: "email" },
  };
  const exp = Math.floor(new Date(2030, 0, 1).getTime() / 1000);
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
    user,
    access_token: token,
    refresh_token: "preview",
    expires_at: exp,
    expires_in: 3600,
    token_type: "bearer",
  };
  await page.addInitScript(
    ({ state, authKey, session, tray }) => {
      if (!localStorage.getItem(authKey))
        localStorage.setItem(authKey, JSON.stringify(session));
      if (!localStorage.getItem("studyhub-storage-v2"))
        localStorage.setItem(
          "studyhub-storage-v2",
          JSON.stringify({ state, version: 23 }),
        );
      if (tray) {
        window.trayActions = [];
        window.studyhubDesktop = {
          platform: "darwin",
          trayPopover: { action: (action) => window.trayActions.push(action) },
        };
      }
    },
    {
      state: { ...state, themePreference: theme },
      authKey,
      session,
      tray,
    },
  );
  // Never read/write a real account. Only the production build is served locally.
  await page.context().route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "file:") return route.continue();
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
        ".mjs": "text/javascript",
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
}
export const storedState = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("studyhub-storage-v2")).state,
  );
