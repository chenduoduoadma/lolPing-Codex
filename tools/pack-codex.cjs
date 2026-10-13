const fs = require('node:fs/promises');
const path = require('node:path');
const asar = require('@electron/asar');
(async () => {
  const stage = path.resolve('codex-package');
  if (path.dirname(stage) !== path.resolve(process.cwd())) throw new Error('Invalid package staging path');
  await fs.rm(stage, { recursive: true, force: true });
  await fs.mkdir(path.join(stage, 'out'), { recursive: true });
  for (const folder of ['main', 'preload', 'renderer']) {
    await fs.cp(path.join('out', folder), path.join(stage, 'out', folder), {
      recursive: true, filter: (name) => !name.endsWith('-qa.cjs'),
    });
  }
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  if (process.argv.includes('--legacy-hotfix')) {
    pkg.name = 'lolping'; pkg.productName = 'lolPing'; pkg.version = '0.5.1-codex.3';
    pkg.build.appId = 'com.lolping.app'; pkg.build.productName = 'lolPing';
  }
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
  await fs.mkdir('release-codex', { recursive: true });
  await asar.createPackage(stage, 'release-codex/app.asar');
  console.log('Packed release-codex/app.asar');
})();
