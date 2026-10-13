import { pixelCrop, rectBetweenPoints, type CaptureRegionApi, type CaptureRect } from '../../shared/captureRegion';
declare global { interface Window { captureRegionApi: CaptureRegionApi } }
const api = window.captureRegionApi;
const image = document.getElementById('screen-image') as HTMLImageElement;
const box = document.getElementById('selection')!;
const shade = document.getElementById('shade')!;
const dimensions = document.getElementById('dimensions')!;
const hint = document.getElementById('hint')!;
let start: { x: number; y: number } | null = null;
let bitmap = { width: 0, height: 0 };
let ready = false;
let submitting = false;
const point = (e: PointerEvent) => ({ x: Math.max(0, Math.min(innerWidth, e.clientX)), y: Math.max(0, Math.min(innerHeight, e.clientY)) });
function paint(rect: CaptureRect): void {
  shade.hidden = true; box.style.display = 'block';
  Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  const crop = pixelCrop(rect, { width: innerWidth, height: innerHeight }, bitmap);
  dimensions.textContent = crop ? `${crop.width} × ${crop.height} px` : '拖动框选';
}
async function cancel(): Promise<void> { if (!submitting) { submitting = true; await api.cancel(); } }
document.addEventListener('pointerdown', (event) => {
  if (!ready || submitting || event.button !== 0) return;
  event.preventDefault(); start = point(event);
  try { document.body.setPointerCapture(event.pointerId); } catch { /* synthetic QA event */ }
  paint(rectBetweenPoints(start, start));
});
document.addEventListener('pointermove', (event) => { if (start && !submitting) paint(rectBetweenPoints(start, point(event))); });
document.addEventListener('pointerup', (event) => {
  if (!start || submitting || event.button !== 0) return;
  const rect = rectBetweenPoints(start, point(event)); start = null;
  if (rect.width < 3 || rect.height < 3) { hint.textContent = '区域太小，请重新拖动框选 · Esc / 右键取消'; return; }
  submitting = true;
  void api.select(rect).catch((error) => { submitting = false; hint.textContent = String(error); });
});
document.addEventListener('contextmenu', (event) => { event.preventDefault(); void cancel(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); void cancel(); } });
image.onload = () => { ready = true; document.body.dataset.ready = 'true'; };
void api.image().then((value) => { bitmap = value; image.src = value.url; }).catch((error) => { hint.textContent = String(error); });
