import { describe, expect, it } from 'vitest';
import { pixelCrop, rectBetweenPoints } from '../../src/shared/captureRegion';
describe('screenshot region geometry', () => {
  it('supports dragging in either direction', () => {
    expect(rectBetweenPoints({ x: 300, y: 180 }, { x: 70, y: 45 })).toEqual({ x: 70, y: 45, width: 230, height: 135 });
    expect(rectBetweenPoints({ x: 70, y: 45 }, { x: 300, y: 180 })).toEqual({ x: 70, y: 45, width: 230, height: 135 });
  });
  it('maps 125% display scaling without dropping edge pixels', () => {
    expect(pixelCrop({ x: 10, y: 20, width: 100, height: 80 }, { width: 1536, height: 864 }, { width: 1920, height: 1080 })).toEqual({ x: 12, y: 25, width: 126, height: 100 });
  });
  it('uses actual thumbnail dimensions even when the source is downscaled', () => {
    expect(pixelCrop({ x: 640, y: 360, width: 640, height: 360 }, { width: 1920, height: 1080 }, { width: 960, height: 540 })).toEqual({ x: 320, y: 180, width: 320, height: 180 });
  });
  it('clips partially off-screen selections to the captured bitmap', () => {
    expect(pixelCrop({ x: -20, y: 80, width: 70, height: 40 }, { width: 100, height: 100 }, { width: 200, height: 200 })).toEqual({ x: 0, y: 160, width: 100, height: 40 });
    expect(pixelCrop({ x: 110, y: 80, width: 70, height: 40 }, { width: 100, height: 100 }, { width: 200, height: 200 })).toBeNull();
  });
  it('rejects malformed or empty rectangles and invalid image dimensions', () => {
    const size = { width: 100, height: 100 };
    for (const raw of [null, {}, { x: '0', y: 0, width: 50, height: 50 }, { x: NaN, y: 0, width: 50, height: 50 }, { x: 0, y: 0, width: -10, height: 10 }, { x: 0, y: 0, width: 1, height: 1 }]) expect(pixelCrop(raw, size, size)).toBeNull();
    expect(pixelCrop({ x: 0, y: 0, width: 50, height: 50 }, { width: 0, height: 100 }, size)).toBeNull();
  });
});
