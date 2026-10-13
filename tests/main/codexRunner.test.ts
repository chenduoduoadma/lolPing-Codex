import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mock.spawn }));
import { CodexRunner } from '../../src/main/codexRunner';
function child() {
  const c = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), pid: 1234, kill: vi.fn() });
  mock.spawn.mockReturnValue(c); return c;
}
beforeEach(() => mock.spawn.mockReset());
describe('Codex bridge execution', () => {
  it('keeps user text in stdin, attaches an image, and only reports success after a completed turn', async () => {
    const c = child(); const updates: unknown[] = [];
    const runner = new CodexRunner(() => 'C:\\Codex\\codex.exe');
    const input = '中文问题 `$(danger)` --shell & stuff';
    const promise = runner.run({ workspace: 'E:\\my project', question: input, allowChanges: false, image: 'E:\\capture x.png' }, (u) => updates.push(u));
    const [exe, args, opts] = mock.spawn.mock.calls[0];
    expect(exe).toBe('C:\\Codex\\codex.exe'); expect(opts.shell).toBe(false);
    expect(args).toContain('read-only'); expect(args).toContain('E:\\capture x.png'); expect(args.join(' ')).not.toContain(input);
    expect(args.slice(-2)).toEqual(['--', '-']); // '-' must be the stdin prompt, never another --image argument
    expect(c.stdin.read().toString()).toContain(input);
    c.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }) + '\n');
    c.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '中文答案' } }) + '\n');
    c.stdout.write('{"type":"turn.completed"}\n'); c.emit('close', 0);
    await promise; expect(updates).toContainEqual({ threadId: 'thread-1' }); expect(updates).toContainEqual({ reply: '中文答案' });
  });
  it('rejects a zero exit code without completion, and permits retry after failure', async () => {
    const c = child(); const runner = new CodexRunner(() => 'codex.exe');
    const promise = runner.run({ workspace: 'E:\\codex', question: 'help', allowChanges: false }, () => {});
    c.emit('close', 0); await expect(promise).rejects.toThrow('未完成');
    const c2 = child(); const retry = runner.run({ workspace: 'E:\\codex', question: 'retry', allowChanges: false }, () => {});
    c2.stdout.write('{"type":"turn.completed"}\n'); c2.emit('close', 0); await expect(retry).resolves.toBeUndefined();
  });
  it('allows explicitly authorized workspace changes while denying escalation and prevents concurrent tasks', async () => {
    const c = child(); const runner = new CodexRunner(() => 'codex.exe');
    const first = runner.run({ workspace: 'E:\\codex', question: 'fix', allowChanges: true }, () => {});
    expect(mock.spawn.mock.calls[0][1]).toContain('workspace-write');
    expect(mock.spawn.mock.calls[0][1]).toContain('approval_policy="never"');
    expect(mock.spawn.mock.calls[0][1]).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    await expect(runner.run({ workspace: 'E:\\codex', question: 'again', allowChanges: false }, () => {})).rejects.toThrow('已有任务');
    c.stdout.write('{"type":"turn.failed","error":{"message":"无法登录"}}\n'); c.emit('close', 1);
    await expect(first).rejects.toThrow('无法登录');
  });
  it('cancels the task and returns a cancelled result', async () => {
    const c = child(); const runner = new CodexRunner(() => 'codex.exe');
    const promise = runner.run({ workspace: 'E:\\codex', question: 'help', allowChanges: false }, () => {});
    runner.cancel(); c.emit('close', 1); await expect(promise).rejects.toThrow('已停止');
    if (process.platform === 'win32') expect(mock.spawn.mock.calls[1][1]).toEqual(['/PID', '1234', '/T', '/F']);
    else expect(c.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
