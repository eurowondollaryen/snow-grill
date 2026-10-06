import { GEM, PICKUP, type ItemType, type Point, type Rect } from '../config/balance';
import type { ItemBatch } from '../engine/ItemBatch';
import { S } from '../engine/Renderer';
import { clamp, dist2, rand } from '../utils/math';
import type { ItemStack } from './ItemStack';

export interface Collector {
  x: number;
  y: number;
  stack: ItemStack;
  magnetRadius: number;
  onCollect?: (type: ItemType) => void;
}

export interface GemCollector {
  x: number;
  y: number;
  magnetRadius: number;
  onGem: (x: number, y: number) => void;
}

type Kind = ItemType | 'gem';

interface Pickup {
  kind: Kind;
  life: number;
  dropping: boolean;
  t: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  spin: number;
}

/** 바닥에 떨어진 생고기·보석. 좌표는 게임 px. */
export class PickupSystem {
  readonly items: Pickup[] = [];

  get count(): number {
    return this.items.length;
  }

  spawnBurst(kind: Kind, x: number, y: number, n: number, bounds?: Rect): void {
    for (let i = 0; i < n; i++) {
      if (this.items.length >= PICKUP.maxFloor) this.items.shift();
      const a = rand(0, Math.PI * 2);
      const r = rand(PICKUP.scatterMin, PICKUP.scatterMax);
      let tx = x + Math.cos(a) * r;
      let ty = y + Math.sin(a) * r * 0.8;
      if (bounds) {
        tx = clamp(tx, bounds.x + 10, bounds.x + bounds.w - 10);
        ty = clamp(ty, bounds.y + 10, bounds.y + bounds.h - 10);
      }
      this.items.push({ kind, life: PICKUP.despawnTime, dropping: true, t: 0, sx: x, sy: y, tx, ty, spin: rand(0, 6) });
    }
  }

  nearest(x: number, y: number, maxDist = Infinity, within?: Rect, kind: Kind = 'raw'): Point | null {
    let best: Pickup | null = null;
    let bd = maxDist * maxDist;
    for (const p of this.items) {
      if (p.dropping || p.kind !== kind) continue;
      if (within && (p.tx < within.x || p.tx > within.x + within.w || p.ty < within.y || p.ty > within.y + within.h)) continue;
      const d = dist2(x, y, p.tx, p.ty);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? { x: best.tx, y: best.ty } : null;
  }

  update(dt: number, collectors: Collector[], gems: GemCollector | null): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.spin += dt * (p.kind === 'gem' ? 2.5 : 0);
      if (p.dropping) {
        p.t += dt;
        if (p.t >= PICKUP.dropDuration) p.dropping = false;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      if (p.kind === 'gem') {
        if (gems) {
          const r = gems.magnetRadius * GEM.magnetBonus;
          if (dist2(gems.x, gems.y, p.tx, p.ty) <= r * r) {
            gems.onGem(p.tx, p.ty);
            this.items.splice(i, 1);
          }
        }
        continue;
      }
      for (const c of collectors) {
        if (dist2(c.x, c.y, p.tx, p.ty) > c.magnetRadius * c.magnetRadius) continue;
        if (!c.stack.canAccept(p.kind)) continue;
        c.stack.add(p.kind, { x: p.tx * S, y: 0.05, z: p.ty * S });
        c.onCollect?.(p.kind);
        this.items.splice(i, 1);
        break;
      }
    }
  }

  draw(batch: ItemBatch): void {
    for (const p of this.items) {
      let x = p.tx;
      let y = p.ty;
      let h = 0.02;
      if (p.dropping) {
        const k = Math.min(1, p.t / PICKUP.dropDuration);
        x = p.sx + (p.tx - p.sx) * k;
        y = p.sy + (p.ty - p.sy) * k;
        h = 0.3 + Math.sin(Math.PI * k) * 0.7 - k * 0.28;
      } else if (p.kind === 'gem') {
        h = 0.1 + Math.sin(p.spin * 1.3) * 0.06;
      }
      if (p.life < PICKUP.blinkBefore && Math.sin(p.life * 14) < 0) continue;
      batch.add(p.kind, x * S, h, y * S, p.spin, p.kind === 'gem' ? 1.3 : 1, p.dropping ? p.t * 9 : 0);
    }
  }
}
