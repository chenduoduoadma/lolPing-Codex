import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, basename } from 'node:path';

function isFile(path: string): boolean { try { return statSync(path).isFile(); } catch { return false; } }
export function usableWorkspace(saved: unknown, documents: string, home = homedir()): string {
  const isDirectory = (value: string) => { try { return statSync(value).isDirectory(); } catch { return false; } };
  if (typeof saved === 'string' && isDirectory(saved)) return saved;
  return isDirectory(documents) ? documents : home;
}
export function findCodex(options: { configuredPath?: string | null; localAppData?: string; appData?: string; searchPath?: string } = {}): string {
  if (options.configuredPath) {
    if (basename(options.configuredPath).toLowerCase() !== 'codex.exe' || !isFile(options.configuredPath)) throw new Error('所选 Codex 程序不存在，请重新选择 codex.exe。');
    return options.configuredPath;
  }
  const local = options.localAppData ?? process.env.LOCALAPPDATA;
  const roaming = options.appData ?? process.env.APPDATA;
  const root = local ? join(local, 'OpenAI', 'Codex', 'bin') : null;
  const desktopCandidates = root && existsSync(root) ? readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name, 'codex.exe')).filter(isFile) : [];
  desktopCandidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (desktopCandidates[0]) return desktopCandidates[0];
  const directories = (options.searchPath ?? process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const vendor = join('vendor', 'x86_64-pc-windows-msvc', 'codex', 'codex.exe');
  const npmRoots = [...directories, ...(roaming ? [join(roaming, 'npm')] : [])];
  const candidates = [
    ...directories.map((dir) => join(dir, 'codex.exe')),
    ...npmRoots.flatMap((dir) => [
      join(dir, 'node_modules', '@openai', 'codex', vendor),
      join(dir, 'node_modules', '@openai', 'codex-win32-x64', vendor),
      join(dir, 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-win32-x64', vendor),
    ]),
  ];
  const found = candidates.find(isFile);
  if (!found) throw new Error('未找到 Codex。请安装并登录 Codex，或点击“选择 Codex 程序”指定 codex.exe。');
  return found;
}
