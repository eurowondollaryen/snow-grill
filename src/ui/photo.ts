/**
 * 얼굴 사진 처리: 불러오기 → 원형 크롭(가장자리 부드럽게) → 툰 필터 → 색 추출.
 * 모든 처리는 브라우저 캔버스에서만 한다.
 */

export interface CropView {
  /** 원 중심(원본 이미지 px) */
  cx: number;
  cy: number;
  /** 원 반지름(원본 이미지 px) */
  r: number;
}

const MAX_SRC = 1280;

/** 파일 → 캔버스(긴 변 1280 이하로 축소, EXIF 회전 반영) */
export async function loadPhoto(file: File): Promise<HTMLCanvasElement> {
  let src: CanvasImageSource;
  let w: number;
  let h: number;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    src = bmp;
    w = bmp.width;
    h = bmp.height;
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    src = img;
    w = img.naturalWidth;
    h = img.naturalHeight;
  }
  const k = Math.min(1, MAX_SRC / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** data URL → 캔버스 */
export async function canvasFromUrl(url: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

/** 처음 보여줄 크롭: 이미지 가운데, 짧은 변의 40% 반지름 */
export function defaultView(src: HTMLCanvasElement): CropView {
  const s = Math.min(src.width, src.height);
  return { cx: src.width / 2, cy: src.height * 0.45, r: s * 0.4 };
}

function toonize(data: Uint8ClampedArray): void {
  const levels = 7;
  const step = 255 / (levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    // 채도·대비 살짝 올리고 단계화(포스터라이즈)
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * 1.3;
    g = l + (g - l) * 1.3;
    b = l + (b - l) * 1.3;
    r = (r - 128) * 1.1 + 132;
    g = (g - 128) * 1.1 + 132;
    b = (b - 128) * 1.1 + 132;
    data[i] = Math.round(Math.round(r / step) * step * 0.35 + r * 0.65);
    data[i + 1] = Math.round(Math.round(g / step) * step * 0.35 + g * 0.65);
    data[i + 2] = Math.round(Math.round(b / step) * step * 0.35 + b * 0.65);
  }
}

/** 원형 크롭 → size×size 캔버스(원 밖은 투명, 가장자리 부드럽게) */
export function renderFace(src: HTMLCanvasElement, v: CropView, size = 256, toon = true): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  const d = v.r * 2;
  g.drawImage(src, v.cx - v.r, v.cy - v.r, d, d, 0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  if (toon) toonize(img.data);
  // 원형 알파 + 부드러운 가장자리
  const half = size / 2;
  const feather = size * 0.06;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x + 0.5 - half, y + 0.5 - half);
      const a = Math.max(0, Math.min(1, (half - dist) / feather));
      img.data[(y * size + x) * 4 + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function toDataUrl(c: HTMLCanvasElement): string {
  const webp = c.toDataURL('image/webp', 0.86);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
}

/** 영역 평균색(너무 어둡거나 밝은 픽셀 제외) */
function regionColor(src: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number, test?: (x: number, y: number) => boolean): number | null {
  const ix0 = Math.max(0, Math.floor(x0));
  const iy0 = Math.max(0, Math.floor(y0));
  const ix1 = Math.min(src.width, Math.ceil(x1));
  const iy1 = Math.min(src.height, Math.ceil(y1));
  if (ix1 - ix0 < 2 || iy1 - iy0 < 2) return null;
  const data = src.getContext('2d')!.getImageData(ix0, iy0, ix1 - ix0, iy1 - iy0).data;
  const w = ix1 - ix0;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt(((ix1 - ix0) * (iy1 - iy0)) / 4000)));
  for (let y = 0; y < iy1 - iy0; y += step) {
    for (let x = 0; x < w; x += step) {
      if (test && !test(ix0 + x, iy0 + y)) continue;
      const i = (y * w + x) * 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (l < 18 || l > 245) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  if (n < 5) return null;
  return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
}

/** 사진에서 피부·머리·옷 색 추정 */
export function extractColors(src: HTMLCanvasElement, v: CropView): { skin: number | null; hair: number | null; coat: number | null } {
  const { cx, cy, r } = v;
  const skin = regionColor(src, cx - r * 0.35, cy - r * 0.1, cx + r * 0.35, cy + r * 0.45, (x, y) => Math.hypot(x - cx, (y - cy - r * 0.15) * 1.2) < r * 0.33);
  const hair = regionColor(src, cx - r * 0.6, cy - r * 1.05, cx + r * 0.6, cy - r * 0.72);
  const coat = regionColor(src, cx - r * 0.9, cy + r * 1.35, cx + r * 0.9, cy + r * 2.3);
  return { skin, hair, coat };
}
