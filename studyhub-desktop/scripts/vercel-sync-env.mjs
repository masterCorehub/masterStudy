import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const entries = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

for (const key of ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_PUBLIC_APP_URL"]) {
  const value = entries[key]?.trim();
  if (!value) throw new Error(`Variável ausente: ${key}`);
  const result = spawnSync(
    "./node_modules/.bin/vercel",
    ["env", "add", key, "production", "--force"],
    { input: `${value}\n`, encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `Falha ao configurar ${key}\n`);
    process.exit(result.status || 1);
  }
  process.stdout.write(`Configurada: ${key}\n`);
}
