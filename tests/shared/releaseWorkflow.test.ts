import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(join(__dirname, '../../.github/workflows/release.yml'), 'utf8').replace(/\r\n/g, '\n');

describe('Windows release workflow', () => {
  it('requires an explicit manual run and validates before building', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^  (push|pull_request):/m);
    expect(workflow).toContain('runs-on: windows-latest');
    for (const command of ['npm run test:helper', 'npm run typecheck', 'npm exec -- vitest run --maxWorkers=2']) {
      expect(workflow.indexOf(command)).toBeGreaterThan(0);
      expect(workflow.indexOf(command)).toBeLessThan(workflow.indexOf('npm run dist'));
    }
  });

  it('uploads the branded installer and its checksum after building', () => {
    expect(workflow).toContain('release/lolPing-Codex-Setup-$version.exe');
    expect(workflow).toContain('Get-FileHash -LiteralPath $installer -Algorithm SHA256');
    expect(workflow).toContain('gh release upload "v$version" $installer release/SHA256SUMS.txt --clobber');
    expect(workflow.indexOf('npm run dist')).toBeLessThan(workflow.indexOf('Get-FileHash'));
    expect(workflow.indexOf('Get-FileHash')).toBeLessThan(workflow.indexOf('gh release upload'));
  });

  it('keeps releases in draft until every asset upload succeeds', () => {
    expect(workflow).toMatch(/gh release create "v\$version"[^\n]*--draft/);
    expect(workflow.indexOf('gh release create')).toBeLessThan(workflow.indexOf('gh release upload'));
    expect(workflow.indexOf('gh release upload')).toBeLessThan(workflow.indexOf("throw 'Failed to upload release assets.'"));
    expect(workflow.indexOf("throw 'Failed to upload release assets.'")).toBeLessThan(workflow.indexOf('gh release edit "v$version" --draft=false'));
    expect(workflow).toContain('--target $env:GITHUB_SHA');
  });

  it('refuses to overwrite an already published version', () => {
    expect(workflow).toContain('gh release view "v$version" --json isDraft --jq .isDraft');
    expect(workflow).toContain("if ($existing -ne 'true') { throw");
    expect(workflow.indexOf("if ($existing -ne 'true')")).toBeLessThan(workflow.indexOf('gh release upload'));
  });

  it('uses only the runner token and leaves no git credentials behind', () => {
    expect(workflow).toMatch(/actions\/checkout@v7\n\s+with:\n\s+persist-credentials: false/);
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('GH_REPO: ${{ github.repository }}');
    expect(workflow).not.toMatch(/git (push|commit|tag)|gh auth login/);
  });
});
