import { _electron as electron } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'masterstudy-notifications-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ executablePath: resolve(process.argv[2]), args: [`--user-data-dir=${profile}`, '--disable-gpu'], env });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  const result = await window.evaluate(() => window.studyhubDesktop.notifications.show({ title: 'masterStudy — teste de notificação', body: 'Verificação da entrega de lembretes.', screen: 'today', sound: false }));
  console.log(JSON.stringify(result));
  if (!result.shown) process.exitCode = 1;
} finally {
  await app?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
