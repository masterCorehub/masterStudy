import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { _electron as electron, chromium } from "playwright";

const executablePath = resolve(
  process.argv[2] || "release/linux-unpacked/studyhub-desktop",
);
const profilePath = await mkdtemp(join(tmpdir(), "studyhub-smoke-"));
const rendererErrors = [];
let electronApp;
let cdpBrowser;
let appImageProcess;
let processLog = "";

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function cleanEnvironment() {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  environment.APPIMAGELAUNCHER_DISABLE = "1";
  return environment;
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function connectToAppImage() {
  const port = await reservePort();
  appImageProcess = spawn(
    executablePath,
    [
      `--user-data-dir=${profilePath}`,
      "--disable-gpu",
      `--remote-debugging-port=${port}`,
    ],
    {
      detached: true,
      env: cleanEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const recordLog = (chunk) => {
    processLog = `${processLog}${chunk}`.slice(-20_000);
  };
  appImageProcess.stdout.on("data", recordLog);
  appImageProcess.stderr.on("data", recordLog);

  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (appImageProcess.exitCode !== null) {
      throw new Error(
        `O AppImage encerrou antes de abrir a janela. Log: ${processLog}`,
      );
    }
    try {
      cdpBrowser = await chromium.connectOverCDP(endpoint);
      const context = cdpBrowser.contexts()[0];
      if (!context) throw new Error("Contexto Electron ainda não disponível.");
      const pages = context.pages();
      return pages[0] || context.waitForEvent("page", { timeout: 10_000 });
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Não foi possível conectar ao AppImage. Log: ${processLog}`);
}

async function connectToUnpackedApp() {
  electronApp = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${profilePath}`, "--disable-gpu"],
    env: cleanEnvironment(),
    timeout: 30_000,
  });
  return electronApp.firstWindow({ timeout: 30_000 });
}

async function stopAppImage() {
  if (!appImageProcess || appImageProcess.exitCode !== null) return;
  try {
    process.kill(-appImageProcess.pid, "SIGTERM");
  } catch {
    return;
  }
  await Promise.race([
    new Promise((resolveExit) => appImageProcess.once("exit", resolveExit)),
    delay(3_000),
  ]);
  if (appImageProcess.exitCode === null) {
    try {
      process.kill(-appImageProcess.pid, "SIGKILL");
    } catch {
      // The application may have exited between the check and the signal.
    }
  }
}

try {
  const window =
    extname(executablePath).toLowerCase() === ".appimage"
      ? await connectToAppImage()
      : await connectToUnpackedApp();

  window.on("pageerror", (error) => rendererErrors.push(error.message));
  window.on("console", (message) => {
    if (message.type() === "error") rendererErrors.push(message.text());
  });

  await window.waitForLoadState("domcontentloaded");
  await window.locator("body").waitFor({ state: "visible", timeout: 15_000 });
  await window.waitForTimeout(1_500);

  const snapshot = await window.evaluate(() => ({
    title: document.title,
    text: document.body?.innerText?.trim() || "",
    childCount: document.body?.children?.length || 0,
    width: document.body?.getBoundingClientRect().width || 0,
    height: document.body?.getBoundingClientRect().height || 0,
  }));
  const fatalText = /something went wrong|minified react error|browserfileref is not defined/i;
  const fatalErrors = rendererErrors.filter((message) => fatalText.test(message));

  if (
    !snapshot.text ||
    snapshot.childCount === 0 ||
    snapshot.width === 0 ||
    snapshot.height === 0 ||
    fatalText.test(snapshot.text) ||
    fatalErrors.length ||
    fatalText.test(processLog)
  ) {
    throw new Error(
      `A janela empacotada não passou no smoke test: ${JSON.stringify({ snapshot, fatalErrors, processLog })}`,
    );
  }

  console.log(
    JSON.stringify({
      ok: true,
      executablePath,
      title: snapshot.title,
      visibleTextPreview: snapshot.text.slice(0, 160),
      rendererErrorCount: rendererErrors.length,
    }),
  );
} finally {
  await electronApp?.close().catch(() => {});
  await cdpBrowser?.close().catch(() => {});
  await stopAppImage();
  await rm(profilePath, { recursive: true, force: true });
}
