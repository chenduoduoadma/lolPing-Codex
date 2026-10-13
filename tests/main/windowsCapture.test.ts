import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: Object.assign(() => {}, {
  [Symbol.for('nodejs.util.promisify.custom')]: (...args: unknown[]) => mock.run(...args),
}) }));
import { captureWithWindows } from '../../src/main/windowsCapture';
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
beforeEach(() => mock.run.mockReset());
describe('Windows monitor capture fallback', () => {
  it('uses validated physical coordinates, DPI awareness and returns PNG bytes without changing execution policy', async () => {
    mock.run.mockResolvedValue({ stdout: png.toString('base64'), stderr: '' });
    await expect(captureWithWindows({ x: -1920, y: 0, width: 1920, height: 1080 })).resolves.toEqual(png);
    const [path, args, options] = mock.run.mock.calls[0];
    expect(path).toMatch(/WindowsPowerShell.*powershell\.exe$/);
    expect(args).not.toContain('-ExecutionPolicy'); expect(options.windowsHide).toBe(true);
    const script = Buffer.from(args[args.length - 1], 'base64').toString('utf16le');
    expect(script).toContain("ConvertFrom-Json '[-1920,0,1920,1080]'");
    expect(script).toContain('SetThreadDpiAwarenessContext');
  });
  it('rejects nonnumeric, fractional, empty and excessive dimensions before starting a process', async () => {
    for (const rect of [{ x: '0;exit', y: 0, width: 10, height: 10 }, { x: .5, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 0, width: 20000, height: 20000 }]) await expect(captureWithWindows(rect as any)).rejects.toThrow('无效');
    expect(mock.run).not.toHaveBeenCalled();
  });
  it('rejects an empty or malformed capture result', async () => {
    mock.run.mockResolvedValue({ stdout: 'invalid', stderr: '' });
    await expect(captureWithWindows({ x: 0, y: 0, width: 100, height: 100 })).rejects.toThrow('截图失败');
  });
});
