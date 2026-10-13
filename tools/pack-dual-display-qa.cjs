const fs = require('node:fs/promises');
const path = require('node:path');
const asar = require('@electron/asar');
(async () => {
  const root = path.resolve('qa-package-dual');
  await fs.mkdir(path.join(root, 'out/main'), { recursive: true });
  await fs.mkdir(path.join(root, 'out/preload'), { recursive: true });
  await fs.copyFile('out/main/dual-display-qa.cjs', path.join(root, 'out/main/dual-display-qa.cjs'));
  for (const name of ['codex', 'captureRegion']) await fs.copyFile(`out/preload/${name}.js`, path.join(root, `out/preload/${name}.js`));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'lolping-dual-display-qa', version: '0.5.1', main: 'out/main/dual-display-qa.cjs' }));
  await asar.createPackage(root, 'qa-runtime/resources/app.asar');
})();
