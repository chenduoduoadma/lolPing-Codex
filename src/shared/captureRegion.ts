export interface CaptureRect { x: number; y: number; width: number; height: number }
export interface CaptureSize { width: number; height: number }
export interface CaptureRegionApi {
  image(): Promise<{ url: string; width: number; height: number }>;
  select(rect: CaptureRect): Promise<void>;
  cancel(): Promise<void>;
}

/** A selection is relative to this display's content area, never desktop coordinates. */
export function rectBetweenPoints(a: { x: number; y: number }, b: { x: number; y: number }): CaptureRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** Map DIP selection edges to the actual captured bitmap, including fractional Windows scaling. */
export function pixelCrop(raw: unknown, viewport: CaptureSize, bitmap: CaptureSize): CaptureRect | null {
  const r = raw as Partial<CaptureRect> | null;
  if (!r || ![r.x, r.y, r.width, r.height, viewport.width, viewport.height, bitmap.width, bitmap.height]
    .every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  if (r.width! <= 0 || r.height! <= 0 || viewport.width <= 0 || viewport.height <= 0 || bitmap.width <= 0 || bitmap.height <= 0) return null;
  const left = Math.max(0, Math.min(viewport.width, r.x!));
  const top = Math.max(0, Math.min(viewport.height, r.y!));
  const right = Math.max(0, Math.min(viewport.width, r.x! + r.width!));
  const bottom = Math.max(0, Math.min(viewport.height, r.y! + r.height!));
  const x = Math.floor(left * bitmap.width / viewport.width);
  const y = Math.floor(top * bitmap.height / viewport.height);
  const endX = Math.min(bitmap.width, Math.ceil(right * bitmap.width / viewport.width));
  const endY = Math.min(bitmap.height, Math.ceil(bottom * bitmap.height / viewport.height));
  if (endX - x < 2 || endY - y < 2) return null;
  return { x, y, width: endX - x, height: endY - y };
}
