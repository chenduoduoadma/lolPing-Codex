// Optional offline build using the already verified Electron runtime and upstream helper on this PC.
// Normal source builds use npm run dist (builds the C++ helper and downloads Electron).
const fs = require('node:fs/promises');
const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
(async () => {
  const root = process.cwd();
  const source = process.env.LOLPING_ELECTRON_DIST || path.join(root, 'qa-runtime');
  const runtime = path.join(root, '.cache', 'electron-dist');
  if (!path.resolve(runtime).startsWith(path.resolve(root) + path.sep)) throw new Error('Invalid runtime staging path');
  await fs.mkdir(path.join(runtime, 'resources'), { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.isFile() && entry.name !== 'lolPing.exe' && !entry.name.startsWith('Uninstall')) {
      await fs.copyFile(path.join(source, entry.name), path.join(runtime, entry.name));
    }
  }
  await fs.cp(path.join(source, 'locales'), path.join(runtime, 'locales'), { recursive: true });
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  const artifacts = await build({
    targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
    publish: 'never',
    config: { electronDist: runtime, publish: null },
  });
  console.log(artifacts.join('\n'));
})().catch((error) => { console.error(error); process.exitCode = 1; });
