import type { Rect } from '../config/balance';

/** 정적 사각형(울타리·시설)과 원(플레이어) 충돌. 좌표는 게임 px. */
export class StaticWorld {
  readonly rects: Rect[] = [];

  constructor(private bounds: { w: number; h: number }) {}

  /** 중심 좌표 기준 사각형 추가 */
  add(cx: number, cy: number, w: number, h: number): Rect {
    const r = { x: cx - w / 2, y: cy - h / 2, w, h };
    this.rects.push(r);
    return r;
  }

  remove(r: Rect): void {
    const i = this.rects.indexOf(r);
    if (i >= 0) this.rects.splice(i, 1);
  }

  /** 이동 후 위치를 겹치지 않게 보정해 반환 */
  resolve(x: number, y: number, radius: number): { x: number; y: number } {
    for (let iter = 0; iter < 2; iter++) {
      for (const r of this.rects) {
        const cx = Math.max(r.x, Math.min(x, r.x + r.w));
        const cy = Math.max(r.y, Math.min(y, r.y + r.h));
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * radius;
          y = cy + (dy / d) * radius;
        } else {
          // 중심이 사각형 안: 가장 가까운 변으로 밀어냄
          const left = x - r.x;
          const right = r.x + r.w - x;
          const top = y - r.y;
          const bottom = r.y + r.h - y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = r.x - radius;
          else if (m === right) x = r.x + r.w + radius;
          else if (m === top) y = r.y - radius;
          else y = r.y + r.h + radius;
        }
      }
    }
    x = Math.max(radius, Math.min(this.bounds.w - radius, x));
    y = Math.max(radius, Math.min(this.bounds.h - radius, y));
    return { x, y };
  }

  overlaps(x: number, y: number, radius: number): Rect | null {
    for (const r of this.rects) {
      const cx = Math.max(r.x, Math.min(x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(y, r.y + r.h));
      if ((x - cx) ** 2 + (y - cy) ** 2 < radius * radius) return r;
    }
    return null;
  }
}
