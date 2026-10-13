import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findCodex, usableWorkspace } from '../../src/main/codexDiscovery';
let dir: string;
const file = (path: string) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, 'fixture'); return path; };
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lolping-codex-discovery-')); });
afterEach(() => { if (!dir.startsWith(join(tmpdir(), 'lolping-codex-discovery-'))) throw new Error('Invalid test path'); rmSync(dir, { recursive: true, force: true }); });
describe('portable Codex discovery', () => {
  it('keeps an existing workspace and replaces a missing machine-specific path', () => {
    expect(usableWorkspace(dir, dir)).toBe(dir);
    expect(usableWorkspace(join(dir, 'missing'), dir)).toBe(dir);
    expect(usableWorkspace(null, join(dir, 'missing'), dir)).toBe(dir);
  });
  it('selects the newest desktop CLI binary', () => {
    const old = file(join(dir, 'OpenAI', 'Codex', 'bin', 'older', 'codex.exe'));
    const recent = file(join(dir, 'OpenAI', 'Codex', 'bin', 'newer', 'codex.exe'));
    utimesSync(old, new Date(0), new Date(0));
    expect(findCodex({ localAppData: dir, appData: dir, searchPath: '' })).toBe(recent);
  });
  it('honors a valid manually selected binary and rejects an unrelated executable', () => {
    const selected = file(join(dir, 'custom', 'codex.exe'));
    expect(findCodex({ configuredPath: selected })).toBe(selected);
    const unrelated = file(join(dir, 'custom', 'app.exe'));
    expect(() => findCodex({ configuredPath: unrelated })).toThrow('codex.exe');
  });
  it('finds a native CLI on PATH', () => {
    const binary = file(join(dir, 'bin', 'codex.exe'));
    expect(findCodex({ localAppData: dir, appData: dir, searchPath: join(dir, 'bin') })).toBe(binary);
  });
  it('finds the npm-installed Windows native package', () => {
    const binary = file(join(dir, 'npm', 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'codex', 'codex.exe'));
    expect(findCodex({ localAppData: dir, appData: dir, searchPath: join(dir, 'npm') })).toBe(binary);
  });
  it('explains when no supported executable exists', () => {
    expect(() => findCodex({ localAppData: dir, appData: dir, searchPath: '' })).toThrow('选择 Codex 程序');
  });
});
