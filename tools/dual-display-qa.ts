// Tests actual monitor/source mapping using solid test windows. No user desktop image is saved or sent.
import { app, BrowserWindow, desktopCapturer, nativeImage, screen } from 'electron';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CodexBridge } from '../src/main/codexBridge';
import { captureWithWindows } from '../src/main/windowsCapture';
import type { CodexRunner } from '../src/main/codexRunner';
import { registerAppScheme, serveAppScheme } from '../src/main/appProtocol';
const dir = join(process.cwd(), 'qa-output', 'dual-display');
mkdirSync(join(dir, 'user-data'), { recursive: true });
app.setPath('userData', join(dir, 'user-data'));
registerAppScheme(); app.on('window-all-closed', () => {});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errors: unknown[] = [];
const results: unknown[] = [];
function sample(image: Electron.NativeImage): number[] {
  const size = image.getSize(); const bytes = image.toBitmap();
  const offset = (Math.floor(size.height * .2) * size.width + Math.floor(size.width * .2)) * 4;
  return [bytes[offset + 2], bytes[offset + 1], bytes[offset]];
}
function sameColor(actual: number[], expected: number[]): boolean { return actual.every((v, i) => Math.abs(v - expected[i]) < 4); }
void app.whenReady().then(async () => {
  let bridge: CodexBridge | null = null;
  const windows: BrowserWindow[] = [];
  try {
    serveAppScheme({ rendererRoot: join(process.cwd(), 'out/renderer'), emoteDirs: () => [] });
    const displays = screen.getAllDisplays();
    const metadata = displays.map((d) => ({ id: d.id, label: d.label, bounds: d.bounds, scale: d.scaleFactor, physical: screen.dipToScreenRect(null, d.bounds) }));
    await writeFile(join(dir, 'displays.json'), JSON.stringify(metadata, null, 2));
    const colors = displays.map((_, i) => i % 2 ? [180, 90, 30] : [30, 110, 180]);
    for (let i = 0; i < displays.length; i++) {
      const d = displays[i]; const color = colors[i];
      const banner = new BrowserWindow({ ...d.bounds, title: `lolPing 截图验证 ${i + 1}`, frame: false, show: false, alwaysOnTop: true, skipTaskbar: true, enableLargerThanScreen: true, backgroundColor: `#${color.map((v) => v.toString(16).padStart(2, '0')).join('')}` });
      windows.push(banner);
      banner.setAlwaysOnTop(true, 'screen-saver');
      await banner.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;width:100vw;height:100vh;background:rgb(${color.join(',')});display:grid;place-items:center;color:white;font:32px sans-serif">屏幕 ${i + 1} · 截图功能测试<br>测试结束后自动关闭</body></html>`));
      banner.showInactive(); banner.setBounds(d.bounds);
    }
    await sleep(700);
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    await writeFile(join(dir, 'sources.json'), JSON.stringify(sources.map((s) => ({ id: s.id, displayId: s.display_id, name: s.name })), null, 2));
    for (let i = 0; i < displays.length; i++) {
      const source = sources.find((s) => s.display_id === String(displays[i].id));
      const bitmap = source?.thumbnail ?? nativeImage.createFromBuffer(await captureWithWindows(screen.dipToScreenRect(null, displays[i].bounds)));
      if (!sameColor(sample(bitmap), colors[i])) throw new Error(`Monitor ${displays[i].id} does not match its captured source: ${sample(bitmap)}`);
    }
    bridge = new CodexBridge({ run: async () => { throw new Error('No model requests allowed in hardware QA'); }, cancel() {} } as unknown as CodexRunner, dir);
    await bridge.start(); bridge.open();
    const assistant = BrowserWindow.getAllWindows().find((w) => !windows.includes(w))!;
    await sleep(700);
    for (let i = 0; i < displays.length; i++) {
      const display = displays[i];
      const point = screen.dipToScreenPoint({ x: display.bounds.x + 100, y: display.bounds.y + 100 });
      bridge.recordGesture(point.x, point.y);
      // Deliberately provide the OTHER overlay ID: capture must follow the physical gesture instead.
      bridge.onPing('assist', displays[(i + 1) % displays.length].id);
      const state = await assistant.webContents.executeJavaScript('window.codexApi.state()');
      if (state.captureDisplayId !== display.id) throw new Error('Physical gesture selected the wrong monitor');
      if (i > 0 && state.screenshot !== null) throw new Error('A stale attachment survived switching monitors');
      const manual = await assistant.webContents.executeJavaScript(`window.codexApi.selectDisplay(${display.id})`);
      if (manual.captureDisplayId !== display.id) throw new Error('Manual screen selection failed');
      const capture = await assistant.webContents.executeJavaScript('window.codexApi.capture()');
      if (!sameColor(sample(nativeImage.createFromDataURL(capture.screenshot)), colors[i])) throw new Error('Whole-screen capture selected the wrong monitor');
      const pending = assistant.webContents.executeJavaScript('window.codexApi.captureRegion()');
      const deadline = Date.now() + 7000;
      let picker: BrowserWindow | undefined;
      while (Date.now() < deadline) {
        picker = BrowserWindow.getAllWindows().find((w) => !windows.includes(w) && w !== assistant);
        if (picker && !picker.webContents.isLoading() && await picker.webContents.executeJavaScript('document.body.dataset.ready === "true"')) break;
        await sleep(50);
      }
      if (!picker) throw new Error('Region window missing');
      const actualDisplay = screen.getDisplayMatching(picker.getBounds()).id;
      if (actualDisplay !== display.id) throw new Error(`Region window opened on ${actualDisplay}, expected ${display.id}`);
      await picker.webContents.executeJavaScript("document.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100,bubbles:true}));document.dispatchEvent(new PointerEvent('pointermove',{button:0,pointerId:1,clientX:300,clientY:250,bubbles:true}));document.dispatchEvent(new PointerEvent('pointerup',{button:0,pointerId:1,clientX:300,clientY:250,bubbles:true}));");
      const crop = await pending;
      if (!sameColor(sample(nativeImage.createFromDataURL(crop.screenshot)), colors[i])) throw new Error('Region crop contains the wrong monitor');
      results.push({ displayId: display.id, scale: display.scaleFactor, physicalGesture: true, manualSelection: true, wholeScreen: true, regionWindow: true, croppedPixels: true });
    }
    await writeFile(join(dir, 'result.json'), JSON.stringify({ passed: true, results, errors }, null, 2));
    bridge.destroy(); for (const win of windows) win.destroy(); app.exit(0);
  } catch (error) {
    errors.push(error instanceof Error ? error.stack : String(error));
    await writeFile(join(dir, 'result.json'), JSON.stringify({ passed: false, results, errors }, null, 2));
    bridge?.destroy(); for (const win of windows) if (!win.isDestroyed()) win.destroy(); app.exit(1);
  }
});
