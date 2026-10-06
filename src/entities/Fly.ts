import type { ItemBatch, ItemKind } from '../engine/ItemBatch';
import type { V3 } from '../game/Ctx';

type Target = V3 | (() => V3);

interface Flight {
  kind: ItemKind;
  from: V3;
  to: Target;
  t: number;
  dur: number;
  h: number;
  s0: number;
  s1: number;
  spin: number;
  onArrive?: () => void;
}

/** 포물선 비행 연출(아이템·코인·보석) — 월드 단위 */
export class FlySystem {
  private list: Flight[] = [];

  fly(kind: ItemKind, from: V3, to: Target, o: { dur?: number; h?: number; s0?: number; s1?: number; onArrive?: () => void } = {}): void {
    this.list.push({ kind, from: { ...from }, to, t: 0, dur: o.dur ?? 0.3, h: o.h ?? 0.8, s0: o.s0 ?? 1, s1: o.s1 ?? 1, spin: Math.random() * 6, onArrive: o.onArrive });
  }

  get count(): number {
    return this.list.length;
  }

  update(dt: number, batch: ItemBatch): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const to = typeof f.to === 'function' ? f.to() : f.to;
      const x = f.from.x + (to.x - f.from.x) * k;
      const z = f.from.z + (to.z - f.from.z) * k;
      const y = f.from.y + (to.y - f.from.y) * k + Math.sin(Math.PI * k) * f.h;
      batch.add(f.kind, x, y, z, f.spin + k * 8, f.s0 + (f.s1 - f.s0) * k);
      if (k >= 1) {
        this.list.splice(i, 1);
        f.onArrive?.();
      }
    }
  }
}
