// Local app QA: render the real page with a synthetic screenshot and fake Codex response.
// No desktop capture or model request occurs in this harness.
import { app, BrowserWindow, desktopCapturer, nativeImage, screen } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CodexBridge } from '../src/main/codexBridge';
import { pixelCrop } from '../src/shared/captureRegion';
import type { CodexRunner } from '../src/main/codexRunner';
import { registerAppScheme, serveAppScheme } from '../src/main/appProtocol';
const output = join(process.cwd(), 'qa-output');
mkdirSync(join(output, 'user-data'), { recursive: true });
app.setPath('userData', join(output, 'user-data'));
registerAppScheme();
app.on('window-all-closed', () => {});
void app.whenReady().then(async () => {
  try {
    await mkdir(output, { recursive: true });
    serveAppScheme({ rendererRoot: join(process.cwd(), 'out/renderer'), emoteDirs: () => [] });
    const imageWindow = new BrowserWindow({ width: 600, height: 320, show: false });
    await imageWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html><body style="background:white;font:30px sans-serif;padding:30px">CODEX BRIDGE TEST<br><b>2718</b><p>这是测试图片。</p></body></html>'));
    await new Promise((done) => setTimeout(done, 700));
    const image = await imageWindow.webContents.capturePage();
    await writeFile(join(output, 'test-image.png'), image.toPNG()); imageWindow.destroy();
    desktopCapturer.getSources = async () => [{ id: 'screen:test', name: 'Test screen', display_id: String(screen.getPrimaryDisplay().id), thumbnail: nativeImage.createFromBuffer(image.toPNG()), appIcon: nativeImage.createEmpty() }];
    const fakeRunner = { async run(opts: any, update: any) {
      if (!opts.question.includes('测试问题') || opts.allowChanges || !opts.image) throw new Error('QA submission payload failed');
      update({ reply: '这是测试回复：问题和截图已通过确认流程提交。', threadId: '00000000-0000-0000-0000-000000000000' });
    }, cancel() {} } as unknown as CodexRunner;
    const bridge = new CodexBridge(fakeRunner, output); await bridge.start();
    bridge.onPing('danger', screen.getPrimaryDisplay().id);
    if (BrowserWindow.getAllWindows().length) throw new Error('Wrong ping triggered the assistant');
    bridge.onPing('assist', screen.getPrimaryDisplay().id);
    const win = BrowserWindow.getAllWindows()[0];
    await new Promise<void>((done) => { if (!win.webContents.isLoading()) done(); else win.webContents.once('did-finish-load', () => done()); });
    const errors: string[] = [];
    win.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
    await new Promise((done) => setTimeout(done, 700));
    const initial = await win.webContents.executeJavaScript('document.body.innerText');
    if (!initial.includes('确认并交给 Codex')) throw new Error('Assistant page did not render');
    await writeFile(join(output, 'input.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript('window.codexApi.capture()');
    const waitForRegion = async (): Promise<BrowserWindow> => {
      const deadline = Date.now() + 7000;
      while (Date.now() < deadline) {
        const picker = BrowserWindow.getAllWindows().find((w) => w !== win);
        if (picker && !picker.webContents.isLoading() && await picker.webContents.executeJavaScript('document.body.dataset.ready === "true"')) return picker;
        await new Promise((done) => setTimeout(done, 50));
      }
      throw new Error('Region picker did not load');
    };
    const cropRequest = win.webContents.executeJavaScript('window.codexApi.captureRegion()');
    const picker = await waitForRegion();
    const before = { x: 300, y: 180 }, after = { x: 70, y: 45 };
    const expected = pixelCrop({ x: 70, y: 45, width: 230, height: 135 }, picker.getContentBounds(), image.getSize())!;
    await picker.webContents.executeJavaScript(`document.dispatchEvent(new PointerEvent('pointerdown', {button:0,pointerId:1,clientX:${before.x},clientY:${before.y},bubbles:true})); document.dispatchEvent(new PointerEvent('pointermove', {button:0,pointerId:1,clientX:${after.x},clientY:${after.y},bubbles:true}));`);
    const sizeLabel = await picker.webContents.executeJavaScript('document.getElementById("dimensions").textContent');
    if (sizeLabel !== `${expected.width} × ${expected.height} px`) throw new Error('Selection size label does not match the actual crop');
    await new Promise((done) => setTimeout(done, 250));
    await writeFile(join(output, 'region-picker.png'), (await picker.webContents.capturePage()).toPNG());
    await picker.webContents.executeJavaScript(`document.dispatchEvent(new PointerEvent('pointerup', {button:0,pointerId:1,clientX:${after.x},clientY:${after.y},bubbles:true}));`);
    const cropped = await cropRequest;
    const actualSize = nativeImage.createFromDataURL(cropped.screenshot).getSize();
    if (actualSize.width !== expected.width || actualSize.height !== expected.height) throw new Error('Selected bitmap dimensions do not match the region');
    await writeFile(join(output, 'cropped-region.png'), nativeImage.createFromDataURL(cropped.screenshot).toPNG());
    const cancelRequest = win.webContents.executeJavaScript('window.codexApi.captureRegion()');
    const cancelPicker = await waitForRegion();
    await cancelPicker.webContents.executeJavaScript('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
    const cancelled = await cancelRequest;
    if (cancelled.screenshot !== cropped.screenshot) throw new Error('Cancelling replaced the previous attachment');
    await win.webContents.executeJavaScript('window.codexApi.submit({question:"测试问题：这个图片是什么？",allowChanges:false,attachScreenshot:true})');
    await new Promise((done) => setTimeout(done, 700));
    const text = await win.webContents.executeJavaScript('document.body.innerText');
    if (!text.includes('Codex 已处理完成') || !text.includes('这是测试回复')) throw new Error('Reply did not appear');
    if (errors.length) throw new Error(errors.join('\n'));
    await win.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
    await new Promise((done) => setTimeout(done, 250));
    await writeFile(join(output, 'result.png'), (await win.webContents.capturePage()).toPNG());
    await writeFile(join(output, 'qa-result.json'), JSON.stringify({ passed: true, consoleErrors: errors, croppedSize: actualSize, checks: ['non-trigger ping ignored', 'assist ping opens input', 'real renderer loads', 'synthetic screenshot preview', 'region picker renders', 'reverse drag selection', 'actual bitmap crop dimensions', 'Escape preserves previous attachment', 'confirmed cropped submission', 'answer displayed'] }, null, 2));
    bridge.destroy(); app.exit(0);
  } catch (e) { await writeFile(join(output, 'qa-error.txt'), e instanceof Error ? e.stack ?? String(e) : String(e)); app.exit(1); }
});
