const fs = require('node:fs/promises');
const path = require('node:path');
const asar = require('@electron/asar');
(async () => {
  const stage = path.resolve('qa-package');
  await fs.mkdir(path.join(stage, 'out/main'), { recursive: true });
  await fs.mkdir(path.join(stage, 'out/preload'), { recursive: true });
  await fs.copyFile('out/main/codex-qa.cjs', path.join(stage, 'out/main/codex-qa.cjs'));
  await fs.copyFile('out/preload/codex.js', path.join(stage, 'out/preload/codex.js'));
  await fs.copyFile('out/preload/captureRegion.js', path.join(stage, 'out/preload/captureRegion.js'));
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: 'lolping-codex-qa', version: '0.5.1', main: 'out/main/codex-qa.cjs' }));
  await asar.createPackage(stage, 'qa-runtime/resources/app.asar');
})();
