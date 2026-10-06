import type { Point, Rect } from '../config/balance';

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + (ay - by) ** 2;
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const randInt = (a: number, b: number): number => Math.floor(rand(a, b + 1));

export function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** 중심 좌표 기준 사각형 */
export function centered(p: Point, w: number, h: number): Rect {
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}

/** 지수 감쇠 기반 프레임 독립 lerp 계수 */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

export function formatNum(n: number): string {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('ko-KR');
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
