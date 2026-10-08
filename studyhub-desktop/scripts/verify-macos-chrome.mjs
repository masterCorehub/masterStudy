import { _electron as electron } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const profile = await mkdtemp(join(tmpdir(), 'masterstudy-native-chrome-'));
let app;
try {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: resolve(process.argv[2]), args: [`--user-data-dir=${profile}`, '--disable-gpu'], env });
  const page = await app.firstWindow();
  // A fresh isolated profile starts at login, before the internal toolbar mounts.
  await page.locator('body').waitFor({ state: 'visible' });
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('.app-window-controls').count(), 0);
  const native = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(window => window.getTitle() === 'masterStudy');
    return { buttons: win.getWindowButtonPosition(), visible: win.isVisible() };
  });
  assert.deepEqual(native.buttons, { x: 14, y: 17 });
  assert.equal(native.visible, true);
  console.log(JSON.stringify({ ok: true, nativeMacWindowButtons: native.buttons, customWindowControls: 0 }));
} finally {
  await app?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
