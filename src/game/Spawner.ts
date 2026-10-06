import { BOSS, HUNT_ZONES, SPAWN, type BearKind, type Rect } from '../config/balance';
import type { Theme } from '../config/stages';
import { Bear } from '../entities/Bear';
import { Customer } from '../entities/Customer';
import { CUSTOMERS } from '../config/balance';
import type { Counter } from '../stations/Counter';
import { clamp, rand } from '../utils/math';
import type { Ctx } from './Ctx';

/** 사냥터별 최대 마리수 유지(무리 지어 등장) + 주기적인 보스 */
export class Spawner {
  readonly bears: Bear[] = [];
  private timers = { A: 0, B: 0 };
  huntBOpen = false;
  private bossTimer: number = BOSS.interval - BOSS.firstDelay;
  onBoss?: (b: Bear) => void;

  constructor(
    private ctx: Ctx,
    private theme: Theme,
  ) {}

  get boss(): Bear | null {
    return this.bears.find((b) => b.alive && b.isBoss) ?? null;
  }

  init(): void {
    for (let i = 0; i < SPAWN.initialA; i++) this.spawn('A', false);
    if (this.huntBOpen) this.openB(false);
  }

  openB(preferOffscreen = true): void {
    this.huntBOpen = true;
    for (let i = this.countIn(HUNT_ZONES.B); i < SPAWN.initialB; i++) this.spawn('B', preferOffscreen);
  }

  private countIn(zone: Rect): number {
    let n = 0;
    for (const b of this.bears) if (b.alive && !b.isBoss && b.zone === zone) n++;
    return n;
  }

  private pickPoint(zone: Rect, preferOffscreen: boolean): { x: number; y: number } {
    const v = this.ctx.r.viewRect();
    let p = { x: 0, y: 0 };
    for (let i = 0; i < SPAWN.offscreenTries; i++) {
      p = { x: rand(zone.x + 50, zone.x + zone.w - 50), y: rand(zone.y + 50, zone.y + zone.h - 30) };
      if (!preferOffscreen) return p;
      const m = 60;
      if (!(p.x > v.x - m && p.x < v.right + m && p.y > v.y - m && p.y < v.bottom + m)) return p;
    }
    return p;
  }

  spawn(which: 'A' | 'B', preferOffscreen = true, at?: { x: number; y: number }): Bear {
    const zone = HUNT_ZONES[which];
    const kind: BearKind = which === 'B' ? 'polar' : Math.random() < SPAWN.brownChance ? 'brown' : 'baby';
    const p = at ?? this.pickPoint(zone, preferOffscreen);
    const bear = new Bear(this.ctx, kind, zone, p.x, p.y, this.theme);
    this.bears.push(bear);
    return bear;
  }

  spawnBoss(): Bear {
    const zone = HUNT_ZONES.A;
    const p = this.pickPoint(zone, false);
    const bear = new Bear(this.ctx, 'boss', zone, p.x, p.y, this.theme, `👑 ${this.theme.bears.boss.name}`);
    this.bears.push(bear);
    this.onBoss?.(bear);
    return bear;
  }

  update(dt: number): void {
    for (let i = this.bears.length - 1; i >= 0; i--) {
      const b = this.bears[i];
      if (b.removed) this.bears.splice(i, 1);
      else b.update(dt);
    }
    this.tick('A', SPAWN.maxA, dt);
    if (this.huntBOpen) this.tick('B', SPAWN.maxB, dt);
    if (!this.boss) {
      this.bossTimer += dt;
      if (this.bossTimer >= BOSS.interval) {
        this.bossTimer = 0;
        this.spawnBoss();
      }
    }
  }

  private tick(which: 'A' | 'B', max: number, dt: number): void {
    const zone = HUNT_ZONES[which];
    if (this.countIn(zone) >= max) {
      this.timers[which] = 0;
      return;
    }
    this.timers[which] += dt;
    if (this.timers[which] < SPAWN.respawnInterval) return;
    this.timers[which] = 0;
    const n = Math.min(SPAWN.packSize, max - this.countIn(zone));
    const c = this.pickPoint(zone, true);
    for (let i = 0; i < n; i++) {
      const p = {
        x: clamp(c.x + rand(-SPAWN.packSpread, SPAWN.packSpread), zone.x + 50, zone.x + zone.w - 50),
        y: clamp(c.y + rand(-SPAWN.packSpread, SPAWN.packSpread), zone.y + 50, zone.y + zone.h - 30),
      };
      this.spawn(which, true, p);
    }
  }
}

/** 손님 생성(입구) · 줄 배정 · 풀링 */
export class CustomerFlow {
  private all: Customer[] = [];
  private timer = 0;

  constructor(
    private ctx: Ctx,
    private counters: Counter[],
  ) {}

  get activeCount(): number {
    return this.all.reduce((n, c) => n + (c.active ? 1 : 0), 0);
  }

  update(dt: number): void {
    const open = this.counters.filter((c) => c.unlocked);
    const interval = open.length > 1 ? CUSTOMERS.intervalWithCounter2 : CUSTOMERS.interval;
    const target = open.filter((c) => !c.queueFull).sort((a, b) => a.queue.length - b.queue.length)[0];
    if (target) {
      this.timer += dt;
      if (this.timer >= interval) {
        this.timer = 0;
        const c = this.all.find((x) => !x.active) ?? this.create();
        c.spawn(CUSTOMERS.entrance.x, CUSTOMERS.entrance.y);
        target.join(c);
      }
    } else this.timer = Math.min(this.timer, interval);
    for (const c of this.all) c.update(dt);
  }

  draw(): void {
    for (const c of this.all) c.draw();
  }

  private create(): Customer {
    const c = new Customer(this.ctx);
    this.all.push(c);
    return c;
  }
}
