import * as THREE from 'three';
import { COUNTER, CUSTOMERS, type Point } from '../config/balance';
import type { Customer } from '../entities/Customer';
import { Label } from '../engine/Labels';
import { MAT, counterGeometry, ITEM_H } from '../engine/models';
import { S } from '../engine/Renderer';
import { Ease } from '../engine/Tween';
import type { Ctx, V3 } from '../game/Ctx';
import { sound } from '../systems/SoundSystem';
import type { Carrier, TransferTarget } from '../systems/TransferSystem';
import { formatNum } from '../utils/math';
import { Zone } from './Zone';

const COINS_PER_SPRITE = 5;
const PILE_MAX = 36;

/** 판매대 옆 돈더미 */
export class CoinPile {
  value = 0;
  private pending = 0;
  private label: Label;

  constructor(
    private ctx: Ctx,
    readonly pos: Point,
  ) {
    this.label = new Label(ctx.labels, 'pile-val');
  }

  private visibleCount(): number {
    const v = Math.max(0, this.value - this.pending);
    return v <= 0 ? 0 : Math.min(PILE_MAX, Math.ceil(v / COINS_PER_SPRITE));
  }

  private slot(i: number): V3 {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return { x: this.pos.x * S + ((col % 2) - 0.5) * 0.2, y: row * 0.035, z: this.pos.y * S + (Math.floor(col / 2) - 0.5) * 0.2 };
  }

  topPoint(): V3 {
    const s = this.slot(Math.max(0, this.visibleCount() - 1));
    return { x: this.pos.x * S, y: s.y + 0.05, z: this.pos.y * S };
  }

  addIncoming(amount: number): void {
    this.value += amount;
    this.pending += amount;
  }

  arrived(amount: number): void {
    this.pending = Math.max(0, this.pending - amount);
  }

  take(amount: number): number {
    const t = Math.min(this.value, amount);
    this.value -= t;
    this.pending = Math.min(this.pending, this.value);
    return t;
  }

  update(): void {
    const v = this.value - this.pending;
    const n = this.visibleCount();
    this.label.text(v > 0 ? formatNum(v) : '').at(this.pos.x, this.pos.y, (Math.floor(Math.max(0, n - 1) / 4) + 1) * 0.035 + 0.35);
  }

  draw(): void {
    const n = this.visibleCount();
    for (let i = 0; i < n; i++) {
      const s = this.slot(i);
      this.ctx.batch.add('coin', s.x, s.y, s.z, i * 0.7);
    }
  }
}

export interface CounterHooks {
  onSale: (counter: Counter, count: number, amount: number) => void;
  onStock?: (counter: Counter, c: Carrier) => void;
}

let counterGeo: THREE.BufferGeometry | null = null;
const ghostMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false });

/** 판매대: 진열 → 손님 결제(계산 존에 사람이 있어야 진행) → 돈더미 */
export class Counter {
  display = 0;
  unlocked = false;
  /** 레일로 오는 중인 고기 */
  reservedIn = 0;
  readonly inputZone: Zone;
  readonly cashierZone: Zone;
  readonly pile: CoinPile;
  readonly queue: Customer[] = [];
  private obj: THREE.Group;
  private body: THREE.Mesh;
  private collider: ReturnType<Ctx['world']['add']> | null = null;
  private serveTimer = 0;
  private inFlight = 0;
  private label: Label;

  constructor(
    private ctx: Ctx,
    readonly index: number,
    readonly pos: Point,
    private hooks: CounterHooks,
  ) {
    const { x, y } = pos;
    this.inputZone = new Zone(ctx, { x: x - COUNTER.zoneGap, y }, 96, 110, '#8ecae6', 'in');
    this.cashierZone = new Zone(ctx, { x: x + COUNTER.zoneGap, y }, 96, 100, '#7bd389', 'cash');
    this.pile = new CoinPile(ctx, { x: x + COUNTER.pileOffset.x, y: y + COUNTER.pileOffset.y });
    this.obj = new THREE.Group();
    this.obj.position.set(x * S, 0, y * S);
    this.body = new THREE.Mesh((counterGeo ??= counterGeometry()), MAT.vc);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.obj.add(this.body);
    ctx.scene.add(this.obj);
    this.label = new Label(ctx.labels, 'count-pill');
    this.setLocked();
  }

  private setLocked(): void {
    this.unlocked = false;
    this.body.material = ghostMat;
    this.inputZone.setVisible(false);
    this.cashierZone.setVisible(false);
  }

  unlock(animate: boolean): void {
    this.unlocked = true;
    this.body.material = MAT.vc;
    this.inputZone.setVisible(true);
    this.cashierZone.setVisible(true);
    this.collider ??= this.ctx.world.add(this.pos.x, this.pos.y + 6, 180, 64);
    if (animate) this.ctx.tw.add(0.55, (k) => this.obj.scale.setScalar(Math.max(0.001, k)), Ease.outBack);
  }

  get space(): number {
    return COUNTER.counterMax - this.display - this.reservedIn;
  }

  get queueFull(): boolean {
    return this.queue.length >= CUSTOMERS.queueMax;
  }

  queuePos(i: number): Point {
    return { x: this.pos.x, y: this.pos.y + CUSTOMERS.queueStartY + i * CUSTOMERS.queueSpacing };
  }

  join(c: Customer): void {
    this.queue.push(c);
    c.goTo(this.queuePos(this.queue.length - 1));
  }

  /** 진열대 위 i 번째 칸(월드) */
  slot(i: number): V3 {
    const col = i % 5;
    const layer = Math.floor(i / 5);
    return { x: this.pos.x * S - 0.6 + col * 0.3, y: 0.79 + layer * ITEM_H, z: this.pos.y * S - 0.05 };
  }

  // ── 레일 연결(RailSink) ──
  get freeSpace(): number {
    return this.space;
  }
  get dropPoint(): Point {
    return this.inputZone.center;
  }
  dropTop(): V3 {
    return this.slot(this.display);
  }

  receive(): void {
    this.reservedIn = Math.max(0, this.reservedIn - 1);
    this.display = Math.min(COUNTER.counterMax, this.display + 1);
  }

  target(): TransferTarget {
    return {
      zone: this.inputZone,
      enabled: () => this.unlocked,
      tryTransfer: (c) => {
        if (c.stack.type !== 'cooked' || c.stack.empty || this.space <= 0) return false;
        const item = c.stack.remove();
        if (!item) return false;
        const s = this.slot(this.display);
        this.display++;
        this.inFlight++;
        this.ctx.fly.fly('cooked', item, s, { dur: 0.24, h: 0.6, onArrive: () => (this.inFlight = Math.max(0, this.inFlight - 1)) });
        if (c.isPlayer) sound.drop();
        this.hooks.onStock?.(this, c);
        return true;
      },
    };
  }

  /** @param pricePer 구운 고기 1개 판매가 */
  update(dt: number, cashierPresent: boolean, pricePer: number): void {
    if (!this.unlocked) return;
    for (let i = 0; i < this.queue.length; i++) {
      const c = this.queue[i];
      c.isFront = i === 0;
      c.goTo(this.queuePos(i));
    }
    const front = this.queue[0];
    if (front && front.arrived) {
      const serving = cashierPresent && this.display > 0;
      if (!serving) front.patience -= dt;
      if (front.patience <= 0) {
        front.leave(false);
        this.queue.shift();
        sound.angry();
      } else if (serving) {
        this.serveTimer += dt;
        if (this.serveTimer >= COUNTER.serveInterval) {
          this.serveTimer = 0;
          this.display--;
          front.got++;
          front.stack.add('cooked', this.slot(this.display));
          if (front.got >= front.want) this.pay(front, pricePer);
        }
      }
    } else this.serveTimer = 0;
    this.label.text(this.display > 0 ? `${this.display}` : '').at(this.pos.x, this.pos.y, 1.35);
    this.pile.update();
  }

  private pay(c: Customer, pricePer: number): void {
    const amount = c.want * pricePer;
    this.queue.shift();
    c.leave(true);
    this.pile.addIncoming(amount);
    const n = Math.min(6, c.want * 2);
    const per = amount / n;
    for (let i = 0; i < n; i++) {
      this.ctx.tw.delay(i * 0.05, () =>
        this.ctx.fly.fly('coin', { x: c.x * S, y: 1.0, z: c.y * S }, this.pile.topPoint(), { dur: 0.35, h: 0.8, onArrive: () => this.pile.arrived(per) }),
      );
    }
    sound.sell();
    this.hooks.onSale(this, c.want, amount);
  }

  draw(): void {
    if (!this.unlocked) return;
    const vis = Math.max(0, this.display - this.inFlight);
    for (let i = 0; i < vis; i++) {
      const s = this.slot(i);
      this.ctx.batch.add('cooked', s.x, s.y, s.z, 0, 0.9);
    }
    this.pile.draw();
  }
}
