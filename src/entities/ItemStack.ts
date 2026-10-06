import type { ItemType } from '../config/balance';
import { ITEM_H } from '../engine/models';
import type { ItemBatch } from '../engine/ItemBatch';
import type { V3 } from '../game/Ctx';
import { damp } from '../utils/math';

interface Layer {
  x: number;
  z: number;
  y: number;
  fly?: { t: number; dur: number; sx: number; sy: number; sz: number };
  pop: number;
}

/**
 * 등에 탑처럼 쌓이는 아이템 스택(한 종류만). 좌표는 3D 월드 단위.
 */
export class ItemStack {
  type: ItemType | null = null;
  capacity: number;
  private layers: Layer[] = [];
  private ax = 0;
  private ay = 0;
  private az = 0;
  private rot = 0;
  visible = true;

  constructor(
    capacity: number,
    private opts: { scale?: number; spacing?: number; back?: number; base?: number } = {},
  ) {
    this.capacity = capacity;
  }

  private get spacing(): number {
    return (this.opts.spacing ?? ITEM_H) * (this.opts.scale ?? 1);
  }

  get count(): number {
    return this.layers.length;
  }
  get full(): boolean {
    return this.layers.length >= this.capacity;
  }
  get empty(): boolean {
    return this.layers.length === 0;
  }

  canAccept(type: ItemType): boolean {
    return this.layers.length < this.capacity && (this.layers.length === 0 || this.type === type);
  }

  /** 스택 꼭대기 월드 좌표 */
  top(): V3 {
    return { x: this.ax, y: this.ay + this.layers.length * this.spacing, z: this.az };
  }

  add(type: ItemType, from?: V3): boolean {
    if (!this.canAccept(type)) return false;
    this.type = type;
    const l: Layer = { x: this.ax, z: this.az, y: this.ay + this.layers.length * this.spacing, pop: 0 };
    if (from) l.fly = { t: 0, dur: 0.3, sx: from.x, sy: from.y, sz: from.z };
    this.layers.push(l);
    return true;
  }

  remove(): ({ type: ItemType } & V3) | null {
    const l = this.layers.pop();
    if (!l || !this.type) return null;
    const out = { type: this.type, x: l.x, y: l.y, z: l.z };
    if (this.layers.length === 0) this.type = null;
    return out;
  }

  restore(type: ItemType | null, count: number): void {
    this.layers = [];
    this.type = null;
    if (!type) return;
    for (let i = 0; i < Math.min(count, this.capacity); i++) this.add(type);
  }

  clear(): void {
    this.layers = [];
    this.type = null;
  }

  /** ox, oz: 주인 위치(월드), fx,fz: 바라보는 방향 */
  update(dt: number, ox: number, oz: number, fx: number, fz: number): void {
    const back = this.opts.back ?? 0.26;
    this.ax = ox - fx * back;
    this.az = oz - fz * back;
    this.ay = this.opts.base ?? 0.5;
    this.rot = Math.atan2(fx, fz);
    const k = damp(26, dt);
    for (let i = 0; i < this.layers.length; i++) {
      const l = this.layers[i];
      const tx = i === 0 ? this.ax : this.layers[i - 1].x;
      const tz = i === 0 ? this.az : this.layers[i - 1].z;
      const ty = this.ay + i * this.spacing;
      if (l.fly) {
        l.fly.t += dt;
        const t = Math.min(1, l.fly.t / l.fly.dur);
        l.x = l.fly.sx + (tx - l.fly.sx) * t;
        l.z = l.fly.sz + (tz - l.fly.sz) * t;
        l.y = l.fly.sy + (ty - l.fly.sy) * t + Math.sin(Math.PI * t) * 0.8;
        if (t >= 1) {
          l.fly = undefined;
          l.pop = 1;
        }
      } else {
        // 아래 층을 살짝 늦게 따라가며 흔들림
        l.x += (tx - l.x) * (i === 0 ? 1 : k);
        l.z += (tz - l.z) * (i === 0 ? 1 : k);
        l.y = ty;
        if (l.pop > 0) l.pop = Math.max(0, l.pop - dt * 6);
      }
    }
  }

  draw(batch: ItemBatch): void {
    if (!this.visible || !this.type) return;
    const s = this.opts.scale ?? 1;
    for (const l of this.layers) batch.add(this.type, l.x, l.y, l.z, this.rot, s * (1 + 0.35 * Math.sin(l.pop * Math.PI)));
  }
}
