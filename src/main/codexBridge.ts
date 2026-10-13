import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, nativeImage, screen, shell, type IpcMainInvokeEvent } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isPingId } from '../shared/pings';
import type { CodexState, CodexSubmission } from '../shared/codex';
import { CodexRunner } from './codexRunner';
import { CaptureRegionWindow } from './captureRegionWindow';
import { findCodex, usableWorkspace } from './codexDiscovery';
import { numberDisplays } from './displayNumbers';
import { captureWithWindows } from './windowsCapture';
import { loadPage, pageUrl, preloadPath, settingsDir } from './paths';

export class CodexBridge {
  private win: BrowserWindow | null = null;
  private cancelled = false;
  private captureBusy = false;
  private readonly regionPicker = new CaptureRegionWindow();
  constructor(private readonly runner = new CodexRunner(() => findCodex({ configuredPath: this.state.preferences.codexPath })), private readonly dataDir = settingsDir()) {
    this.configPath = join(dataDir, 'codex-bridge.json');
  }
  private displayId: number | null = null;
  private lastGesture: { displayId: number; at: number } | null = null;
  private lastPing = 0;
  private screenshotPng: Buffer | null = null;
  private state: CodexState = {
    preferences: { enabled: true, trigger: 'assist', workspace: usableWorkspace(null, app.getPath('documents')), codexPath: null },
    phase: 'idle', message: '输入问题，确认后交给 Codex。', reply: '', threadId: null, screenshot: null,
    displays: [], captureDisplayId: null,
  };
  private readonly configPath: string;
  private isRunning(): boolean { return this.state.phase === 'running'; }

  async start(): Promise<void> {
    this.refreshDisplays();
    screen.on('display-added', this.displaysChanged);
    screen.on('display-removed', this.displaysChanged);
    screen.on('display-metrics-changed', this.displaysChanged);
    try {
      const saved = JSON.parse(await readFile(this.configPath, 'utf8'));
      if (typeof saved.enabled === 'boolean') this.state.preferences.enabled = saved.enabled;
      if (isPingId(saved.trigger)) this.state.preferences.trigger = saved.trigger;
      this.state.preferences.workspace = usableWorkspace(saved.workspace, app.getPath('documents'));
      if (typeof saved.codexPath === 'string') this.state.preferences.codexPath = saved.codexPath;
    } catch { /* first run */ }
    this.handle('codex:state', () => this.state);
    this.handle('codex:preferences', async (value) => {
      if (!value || typeof value.enabled !== 'boolean' || !isPingId(value.trigger)) throw new Error('无效的触发设置。');
      this.state.preferences.enabled = value.enabled;
      this.state.preferences.trigger = value.trigger;
      await this.savePreferences(); return this.push();
    });
    this.handle('codex:workspace', async () => {
      if (this.state.phase === 'running') throw new Error('请等待当前任务结束。');
      const result = await dialog.showOpenDialog(this.win!, { title: '选择 Codex 工作文件夹', defaultPath: this.state.preferences.workspace, properties: ['openDirectory'] });
      if (!result.canceled && result.filePaths[0]) {
        this.state.preferences.workspace = result.filePaths[0]; await this.savePreferences();
      }
      return this.push();
    });
    this.handle('codex:executable', async () => {
      if (this.isRunning()) throw new Error('请等待当前任务结束。');
      const result = await dialog.showOpenDialog(this.win!, { title: '选择 Codex 命令行程序 codex.exe', properties: ['openFile'], filters: [{ name: 'Codex 程序', extensions: ['exe'] }] });
      if (!result.canceled && result.filePaths[0]) {
        this.state.preferences.codexPath = findCodex({ configuredPath: result.filePaths[0] });
        await this.savePreferences();
      }
      return this.push();
    });
    this.handle('codex:display', (id: unknown) => {
      if (this.isRunning() || this.captureBusy) throw new Error('请先完成当前操作。');
      if (typeof id !== 'number' || !screen.getAllDisplays().some((d) => d.id === id)) throw new Error('所选屏幕已断开，请重新选择。');
      this.displayId = id; this.refreshDisplays();
      // An old attachment must not be mistaken for a fresh capture of the newly selected display.
      this.screenshotPng = null; this.state.screenshot = null;
      this.state.message = '已切换截图屏幕，请重新截图。';
      return this.push();
    });
    this.handle('codex:capture', () => this.capture());
    this.handle('codex:capture-region', () => this.capture(true));
    this.handle('codex:clear-capture', () => {
      if (this.state.phase === 'running') throw new Error('任务运行时不能更换截图。');
      this.screenshotPng = null; this.state.screenshot = null; return this.push();
    });
    this.handle('codex:submit', (value) => this.submit(value));
    this.handle('codex:cancel', () => { this.cancelled = true; this.runner.cancel(); return this.state; });
    this.handle('codex:open-thread', async () => {
      if (this.state.threadId && /^[0-9a-f-]{36}$/i.test(this.state.threadId)) await shell.openExternal(`codex://threads/${this.state.threadId}`);
    });
  }

  private handle(channel: string, callback: (value?: any) => unknown): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, value) => {
      if (!this.win || event.sender !== this.win.webContents || event.senderFrame !== this.win.webContents.mainFrame) throw new Error('不允许的请求来源。');
      return callback(value);
    });
  }
  private async savePreferences(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.configPath, JSON.stringify(this.state.preferences, null, 2), 'utf8');
  }
  private push(): CodexState {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('codex:changed', this.state);
    return this.state;
  }
  private readonly displaysChanged = (): void => { this.refreshDisplays(); this.push(); };
  private refreshDisplays(): void {
    const all = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    this.state.displays = numberDisplays(all, primary.id).map((d) => {
      const actual = all.find((a) => a.id === d.id)!;
      return { id: d.id, number: d.number, primary: d.primary, label: actual.label,
        width: Math.round(actual.size.width * actual.scaleFactor), height: Math.round(actual.size.height * actual.scaleFactor), scale: actual.scaleFactor };
    });
    if (!all.some((d) => d.id === this.displayId)) this.displayId = primary.id;
    this.state.captureDisplayId = this.displayId;
  }
  /** Record native input coordinates before renderer IPC: mixed-DPI overlay IDs are not the capture target. */
  recordGesture(x: number, y: number): void {
    const point = process.platform === 'win32' ? screen.screenToDipPoint({ x, y }) : { x, y };
    this.lastGesture = { displayId: screen.getDisplayNearestPoint(point).id, at: Date.now() };
  }
  onPing(id: string, displayId: number): void {
    if (!this.state.preferences.enabled || id !== this.state.preferences.trigger) return;
    const target = this.lastGesture && Date.now() - this.lastGesture.at < 1500
      ? this.lastGesture.displayId : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
    // Update the capture target even when a repeated ping is within the window-opening debounce.
    if (!this.captureBusy && !this.isRunning()) {
      if (this.displayId !== target) {
        this.screenshotPng = null; this.state.screenshot = null;
        this.state.message = '已跟随信号切换截图屏幕，请重新截图。';
      }
      this.displayId = target; this.refreshDisplays(); this.push();
    }
    if (Date.now() - this.lastPing < 2000) return;
    this.lastPing = Date.now(); this.open(target);
  }
  open(displayId?: number): void {
    if (this.captureBusy) return;
    if (!this.win) {
      this.displayId ??= displayId ?? screen.getPrimaryDisplay().id;
      this.refreshDisplays();
      const win = new BrowserWindow({ width: 820, height: 790, minWidth: 650, minHeight: 570,
        title: 'lolPing · Codex 协助', show: false, backgroundColor: '#101820',
        webPreferences: { preload: preloadPath('codex'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
      this.win = win; win.removeMenu();
      win.webContents.on('will-navigate', (event) => { if (event.url !== pageUrl('codex')) event.preventDefault(); });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.on('close', (event) => { event.preventDefault(); win.hide(); });
      win.once('ready-to-show', () => { win.show(); win.focus(); });
      void loadPage(win, 'codex');
    } else {
      this.refreshDisplays();
      if (this.win.isMinimized()) this.win.restore();
      this.win.show(); this.win.focus();
    }
  }
  private async capture(region = false): Promise<CodexState> {
    if (this.state.phase === 'running') throw new Error('请等待任务结束后再截图。');
    if (this.captureBusy) throw new Error('正在截图，请先完成当前操作。');
    this.captureBusy = true;
    const win = this.win!;
    win.hide();
    try {
      await new Promise((done) => setTimeout(done, 350));
      this.refreshDisplays();
      const display = screen.getAllDisplays().find((d) => d.id === this.displayId)!;
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: {
        width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor),
      } }).catch((error) => { if (process.platform === 'win32') return []; throw error; });
      const source = sources.find((s) => s.display_id === String(display.id));
      let bitmap = source?.thumbnail;
      if (!bitmap || bitmap.isEmpty()) {
        if (process.platform !== 'win32') throw new Error('无法截取所选屏幕，请重试。');
        bitmap = nativeImage.createFromBuffer(await captureWithWindows(screen.dipToScreenRect(null, display.bounds)));
        if (bitmap.isEmpty()) throw new Error('无法截取所选屏幕，请重试。');
      }
      const image = region ? await this.regionPicker.select(bitmap, display.bounds) : bitmap;
      if (!image) return this.state; // cancel preserves any earlier attachment
      this.screenshotPng = image.toPNG();
      this.state.screenshot = image.toDataURL();
      const number = this.state.displays.find((d) => d.id === display.id)?.number;
      this.state.message = `已截取屏幕 ${number}；确认提交后才会发送给 Codex。`;
      return this.push();
    } finally { this.captureBusy = false; if (!win.isDestroyed()) { win.show(); win.focus(); } }
  }
  private async submit(raw: unknown): Promise<CodexState> {
    const value = raw as CodexSubmission | null;
    if (!value || typeof value.question !== 'string' || !value.question.trim() || value.question.length > 20000 || typeof value.allowChanges !== 'boolean' || typeof value.attachScreenshot !== 'boolean') throw new Error('请输入问题（最多 20000 字）。');
    if (this.isRunning()) throw new Error('已有任务正在运行。');
    if (this.captureBusy) throw new Error('请先完成截图操作。');
    if (value.attachScreenshot && !this.screenshotPng) throw new Error('请先截图或取消附图。');
    const workspace = this.state.preferences.workspace;
    const { stat } = await import('node:fs/promises');
    if (!(await stat(workspace)).isDirectory()) throw new Error('工作文件夹不存在。');
    if (this.isRunning()) throw new Error('已有任务正在运行。');
    this.cancelled = false;
    this.state.phase = 'running'; this.state.reply = ''; this.state.threadId = null;
    this.state.message = '已交给 Codex，正在处理…'; this.push();
    const png = value.attachScreenshot ? this.screenshotPng : null;
    void (async () => {
      try {
        let image: string | undefined;
        if (png) {
          const dir = join(this.dataDir, 'codex-requests'); await mkdir(dir, { recursive: true });
          image = join(dir, `${Date.now()}.png`); await writeFile(image, png);
        }
        if (this.cancelled) throw new Error('已停止任务。');
        await this.runner.run({ workspace, question: value.question.trim(), allowChanges: value.allowChanges, image }, (update) => {
          if (update.reply) this.state.reply = [this.state.reply, update.reply].filter(Boolean).join('\n\n');
          if (update.threadId) this.state.threadId = update.threadId;
          if (update.message) this.state.message = update.message;
          this.push();
        });
        this.state.phase = 'completed'; this.state.message = 'Codex 已处理完成。';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.state.phase = message === '已停止任务。' ? 'cancelled' : 'failed'; this.state.message = message;
      }
      this.push();
    })();
    return this.state;
  }
  destroy(): void {
    screen.removeListener('display-added', this.displaysChanged);
    screen.removeListener('display-removed', this.displaysChanged);
    screen.removeListener('display-metrics-changed', this.displaysChanged);
    this.runner.cancel(); this.regionPicker.destroy(); this.win?.destroy(); this.win = null;
  }
}
