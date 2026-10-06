import * as THREE from 'three';
import { HUNT_ZONES, WORKERS, WORLD, type Point } from '../config/balance';
import { MAT, personGeometry } from '../engine/models';
import { S } from '../engine/Renderer';
import { Ease } from '../engine/Tween';
import type { Ctx } from '../game/Ctx';
import type { Counter } from '../stations/Counter';
import type { Station } from '../stations/Station';
import type { Carrier } from '../systems/TransferSystem';
import { inRect } from '../utils/math';
import { route } from '../utils/path';
import { AxeRing } from './Axe';
import type { Bear } from './Bear';
import { ItemStack } from './ItemStack';
import type { Collector, PickupSystem } from './Pickup';

export interface WorkerWorld {
  butchers: Station[];
  counters: Counter[];
  bears: Bear[];
  pickups: PickupSystem;
  now: number;
}

export type WorkerKind = 'cashier' | 'hunter';

/** 고용 NPC 공통: 경로 이동 + 스택 */
export abstract class Worker implements Carrier, Collector {
  protected obj: THREE.Mesh;
  stack: ItemStack;
  x: number;
  y: number;
  transferTimer = 0;
  lastTransfer?: number;
  magnetRadius = 0;
  protected path: Point[] = [];
  protected arrivedAt = -99;
  protected thinkT = 0;
  private walkT = Math.random() * 5;
  private yaw = 0;
  private fx = 0;
  private fy = 1;

  constructor(
    protected ctx: Ctx,
    readonly kind: WorkerKind,
    x: number,
    y: number,
    geo: THREE.BufferGeometry,
    capacity: number,
    protected speed: number,
  ) {
    this.x = x;
    this.y = y;
    this.obj = new THREE.Mesh(geo, MAT.vc);
    this.obj.castShadow = true;
    this.obj.scale.setScalar(0.001);
    ctx.scene.add(this.obj);
    this.stack = new ItemStack(capacity, { scale: 0.9 });
    ctx.tw.add(0.4, (k) => this.obj.scale.setScalar(Math.max(0.001, k)), Ease.outBack);
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  moveTo(p: Point, direct = false): void {
    if (Math.abs(p.x - this.x) < 4 && Math.abs(p.y - this.y) < 4) {
      this.path = [];
      return;
    }
    this.path = direct ? [p] : route({ x: this.x, y: this.y }, p);
  }

  protected step(dt: number, now: number): void {
    let remaining = this.speed * dt;
    let moved = false;
    while (remaining > 0 && this.path.length > 0) {
      const t = this.path[0];
      const dx = t.x - this.x;
      const dy = t.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d <= remaining) {
        this.x = t.x;
        this.y = t.y;
        remaining -= d;
        this.path.shift();
        if (this.path.length === 0) this.arrivedAt = now;
      } else {
        this.x += (dx / d) * remaining;
        this.y += (dy / d) * remaining;
        this.fx = dx / d;
        this.fy = dy / d;
        remaining = 0;
      }
      moved = true;
    }
    const want = Math.atan2(this.fx, this.fy);
    let a = want - this.yaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    this.yaw += a * Math.min(1, dt * 10);
    this.walkT += dt * (moved ? 14 : 2);
    this.obj.position.set(this.x * S, moved ? Math.abs(Math.sin(this.walkT)) * 0.05 : 0, this.y * S);
    this.obj.rotation.set(0, this.yaw, moved ? Math.sin(this.walkT) * 0.08 : 0);
    this.stack.update(dt, this.x * S, this.y * S, Math.sin(this.yaw), Math.cos(this.yaw));
  }

  protected busy(now: number): boolean {
    return now - Math.max(this.lastTransfer ?? -99, this.arrivedAt) < WORKERS.linger;
  }

  abstract update(dt: number, w: WorkerWorld): void;

  draw(): void {
    this.stack.draw(this.ctx.batch);
  }

  destroy(): void {
    this.ctx.scene.remove(this.obj);
  }
}

let cashierGeo: THREE.BufferGeometry | null = null;
let hunterGeo: THREE.BufferGeometry | null = null;

/** 계산원: 판매대 계산 존에 상주 */
export class CashierWorker extends Worker {
  constructor(
    ctx: Ctx,
    readonly counterIndex: number,
    x: number,
    y: number,
  ) {
    cashierGeo ??= personGeometry({ coat: 0x7b4fb5, hat: 0xffd166, apron: true });
    super(ctx, 'cashier', x, y, cashierGeo, 1, WORKERS.cashierSpeed);
  }

  update(dt: number, w: WorkerWorld): void {
    this.step(dt, w.now);
    if (this.moving) return;
    const c = w.counters[this.counterIndex];
    if (c && !c.cashierZone.contains(this.x, this.y)) this.moveTo(c.cashierZone.center);
  }

  isAtPost(w: WorkerWorld): boolean {
    const c = w.counters[this.counterIndex];
    return !!c && c.cashierZone.contains(this.x, this.y);
  }
}

enum HunterState {
  Hunt,
  Deliver,
}

/** 사냥꾼: 사냥터 A에서 곰을 잡고 생고기를 정육대로 운반 */
export class HunterWorker extends Worker {
  readonly axes: AxeRing;
  private st = HunterState.Hunt;

  constructor(ctx: Ctx, x: number, y: number) {
    hunterGeo ??= personGeometry({ coat: 0x8a5a2b, hat: 0x6b4423, fur: true, scarf: 0xb23a48 });
    super(ctx, 'hunter', x, y, hunterGeo, WORKERS.hunterCapacity, WORKERS.hunterSpeed);
    this.magnetRadius = WORKERS.hunterMagnet;
    this.axes = new AxeRing(ctx, this, 0.85);
  }

  get inHunt(): boolean {
    return this.y < WORLD.fenceAY;
  }

  update(dt: number, w: WorkerWorld): void {
    this.step(dt, w.now);
    this.axes.setVisible(this.inHunt);
    this.thinkT -= dt;
    const zone = HUNT_ZONES.A;
    if (this.st === HunterState.Hunt) {
      const anyBear = w.bears.some((b) => b.alive && b.zone === zone);
      if (this.stack.full || (!this.stack.empty && !anyBear)) {
        this.st = HunterState.Deliver;
        this.thinkT = 0;
      } else if (!this.inHunt) {
        if (!this.moving) this.moveTo({ x: WORLD.gateX, y: WORLD.fenceAY - 160 });
      } else if (this.thinkT <= 0) {
        this.thinkT = 0.25;
        const meat = this.stack.canAccept('raw') ? w.pickups.nearest(this.x, this.y, 420, zone) : null;
        if (meat) this.moveTo(meat, true);
        else {
          let best: Bear | null = null;
          let bd = Infinity;
          for (const b of w.bears) {
            if (!b.alive || b.zone !== zone) continue;
            const d = (b.x - this.x) ** 2 + (b.y - this.y) ** 2;
            if (d < bd) {
              bd = d;
              best = b;
            }
          }
          if (best) {
            const dx = this.x - best.x;
            const dy = this.y - best.y;
            const d = Math.hypot(dx, dy) || 1;
            const r = this.axes.radius * 0.8;
            const p = { x: best.x + (dx / d) * r, y: best.y + (dy / d) * r };
            this.moveTo(inRect(p.x, p.y, zone) ? p : { x: best.x, y: best.y }, true);
          }
        }
      }
      return;
    }
    if (this.moving || this.busy(w.now)) return;
    if (this.stack.empty) {
      this.st = HunterState.Hunt;
      this.moveTo({ x: WORLD.gateX, y: WORLD.fenceAY - 160 });
      return;
    }
    if (this.thinkT > 0) return;
    this.thinkT = WORKERS.thinkInterval;
    let best: Station | null = null;
    for (const s of w.butchers) if (s.unlocked && s.inputSpace > 0 && (!best || s.inputSpace > best.inputSpace)) best = s;
    if (best) this.moveTo(best.inputPoint);
  }

  destroy(): void {
    this.axes.destroy();
    super.destroy();
  }
}
