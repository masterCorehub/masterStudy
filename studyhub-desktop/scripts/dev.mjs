import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteEntry = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const electronExecutable = require("electron");
const children = new Set();
let shuttingDown = false;

const stopChildren = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
};

const finish = (code = 0) => {
  process.exitCode = code;
  stopChildren();
  setTimeout(() => process.exit(code), 50).unref();
};

process.on("SIGINT", () => finish(0));
process.on("SIGTERM", () => finish(0));
process.on("exit", stopChildren);

const spawnLogged = (label, executable, args, options = {}) => {
  const child = spawn(executable, args, {
    cwd: projectRoot,
    stdio: "inherit",
    ...options,
  });
  children.add(child);
  child.on("error", (error) => {
    console.error(`[${label}] Não foi possível iniciar: ${error.message}`);
    finish(1);
  });
  child.on("close", () => children.delete(child));
  return child;
};

const rendererReady = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("http://127.0.0.1:5173/", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes("<title>StudyHub</title>") && html.includes("/src/main.jsx");
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const waitForRenderer = async (viteProcess) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (viteProcess.exitCode !== null) {
      throw new Error("O servidor visual foi encerrado antes de ficar pronto.");
    }
    if (await rendererReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("O servidor visual não iniciou na porta 5173 em até 2 minutos.");
};

console.log("[StudyHub] Iniciando interface de desenvolvimento…");
const viteProcess = spawnLogged("renderer", process.execPath, [
  viteEntry,
  "--host",
  "127.0.0.1",
  "--port",
  "5173",
  "--strictPort",
  ...(process.argv.includes("--force") ? ["--force"] : []),
]);

try {
  await waitForRenderer(viteProcess);
  console.log("[StudyHub] Interface pronta. Abrindo a janela do aplicativo…");

  const electronEnvironment = { ...process.env };
  delete electronEnvironment.ELECTRON_RUN_AS_NODE;
  delete electronEnvironment.ELECTRON_NO_ATTACH_CONSOLE;

  const electronProcess = spawnLogged(
    "electron",
    electronExecutable,
    [
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=9223",
      projectRoot,
    ],
    { env: electronEnvironment },
  );
  electronProcess.on("close", (code) => finish(code ?? 0));
} catch (error) {
  console.error(`[StudyHub] ${error.message}`);
  finish(1);
}
