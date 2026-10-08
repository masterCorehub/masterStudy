import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const run = (command, args) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { stdio: 'inherit' });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolveRun() : reject(new Error(`Empacotamento falhou (${code}).`)));
});
if (process.platform !== 'darwin') throw new Error('Execute o empacotamento local no macOS.');
// Assina fora do Documents/iCloud, onde metadados podem ser adicionados durante codesign.
const staging = await mkdtemp(join(tmpdir(), 'masterstudy-mac-'));
const archive = resolve('release/masterStudy-local-arm64.zip');
try {
  await run(process.execPath, [resolve('node_modules/electron-builder/out/cli/cli.js'), '--mac', 'dir', '--arm64', '--config.mac.identity=-', `--config.directories.output=${staging}`]);
  await mkdir(resolve('release'), { recursive: true });
  await run('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--noextattr', '--keepParent', join(staging, 'mac-arm64/masterStudy.app'), `${archive}.tmp`]);
  await rename(`${archive}.tmp`, archive);
  console.log(`Aplicativo assinado: ${archive}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
