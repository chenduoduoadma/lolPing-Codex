import { BrowserWindow, ipcMain, type NativeImage, type Rectangle, type IpcMainInvokeEvent } from 'electron';
import { pixelCrop } from '../shared/captureRegion';
import { loadPage, pageUrl, preloadPath } from './paths';

export class CaptureRegionWindow {
  private win: BrowserWindow | null = null;
  select(image: NativeImage, bounds: Rectangle): Promise<NativeImage | null> {
    if (this.win) throw new Error('正在框选截图。');
    return new Promise((resolve, reject) => {
      const win = new BrowserWindow({
        ...bounds, title: 'lolPing · 框选截图区域', frame: false, show: false,
        resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
        skipTaskbar: true, hasShadow: false, alwaysOnTop: true, enableLargerThanScreen: true,
        backgroundColor: '#101820',
        webPreferences: { preload: preloadPath('captureRegion'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
      });
      this.win = win;
      let settled = false;
      const channels = ['capture-region:image', 'capture-region:select', 'capture-region:cancel'];
      const finish = (cropped: NativeImage | null, error?: Error): void => {
        if (settled) return;
        settled = true; this.win = null;
        for (const channel of channels) ipcMain.removeHandler(channel);
        if (!win.isDestroyed()) win.destroy();
        if (error) reject(error); else resolve(cropped);
      };
      const trusted = (event: IpcMainInvokeEvent): void => {
        if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('不允许的请求来源。');
      };
      ipcMain.handle(channels[0], (event) => { trusted(event); return { url: image.toDataURL(), ...image.getSize() }; });
      ipcMain.handle(channels[1], (event, raw: unknown) => {
        trusted(event);
        const rect = pixelCrop(raw, win.getContentBounds(), image.getSize());
        if (!rect) throw new Error('所选区域太小，请重新拖动框选。');
        finish(image.crop(rect));
      });
      ipcMain.handle(channels[2], (event) => { trusted(event); finish(null); });
      win.webContents.on('will-navigate', (event) => { if (event.url !== pageUrl('captureRegion')) event.preventDefault(); });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.once('render-process-gone', () => finish(null, new Error('框选窗口未能正常运行，请重试。')));
      win.on('closed', () => finish(null));
      win.setAlwaysOnTop(true, 'screen-saver');
      win.once('ready-to-show', () => { if (!settled) { win.show(); win.setBounds(bounds); win.focus(); } });
      void loadPage(win, 'captureRegion').catch((e) => finish(null, e instanceof Error ? e : new Error(String(e))));
    });
  }
  destroy(): void { this.win?.destroy(); }
}
