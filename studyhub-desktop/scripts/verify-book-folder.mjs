import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readerPdf, metadataEpub } from "../tests/e2e/fixtures/readerBooks.js";

// Only generated fixture files and a disposable Electron profile are used.
const root = await fs.mkdtemp(path.join(os.tmpdir(), "masterstudy-folder-check-"));
const folder = path.join(root, "books");
await fs.mkdir(path.join(folder, "sub"), { recursive: true });
await fs.writeFile(path.join(folder, "a.pdf"), readerPdf());
await fs.writeFile(path.join(folder, "sub", "b.epub"), await metadataEpub());
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const options = { executablePath: process.argv[2], args: [`--user-data-dir=${path.join(root, "profile")}`, "--disable-gpu"], env };
let app;
try {
  app = await electron.launch(options);
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.studyhubDesktop?.selectDirectory));
  // Replace the native chooser only inside this disposable app process.
  await app.evaluate(({ dialog }, dirPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dirPath] });
  }, folder);
  const selected = await page.evaluate(() => window.studyhubDesktop.selectDirectory());
  assert.equal(selected.dirPath, folder);
  assert.equal(selected.filesList.length, 2);
  assert.ok(selected.filesList.every(file => file.size > 0 && file.lastModified > 0));
  const length = await page.evaluate(async filePath => (await window.studyhubDesktop.readFileBinary(filePath)).byteLength, path.join(folder, "a.pdf"));
  assert.ok(length > 0);
  await app.close();
  app = await electron.launch(options);
  const reopened = await app.firstWindow();
  await reopened.waitForFunction(() => Boolean(window.studyhubDesktop?.scanDirectory));
  await fs.writeFile(path.join(folder, "new.pdf"), readerPdf());
  const scanned = await reopened.evaluate(dirPath => window.studyhubDesktop.scanDirectory(dirPath), folder);
  assert.equal(scanned.filesList.length, 3);
  assert.ok(scanned.filesList.find(file => file.name === "new.pdf"));
  console.log(JSON.stringify({ ok: true, initialFiles: 2, afterRestartFiles: 3, binaryRead: true, retainedPermission: true }));
} finally {
  await app?.close().catch(() => {});
  await fs.rm(root, { recursive: true, force: true });
}
