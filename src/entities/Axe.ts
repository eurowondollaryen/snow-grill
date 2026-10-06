import * as THREE from 'three';
import { AXE } from '../config/balance';
import { MAT, axeGeometry } from '../engine/models';
import { S } from '../engine/Renderer';
import type { Ctx } from '../game/Ctx';
import { dist2 } from '../utils/math';
import type { Bear } from './Bear';

let nextUid = 1;
const GEO = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => (g ??= axeGeometry());
})();

/** 소유자 주위를 원형 궤도로 도는 도끼 묶음(좌표 px) */
export class AxeRing {
  private axes: { m: THREE.Mesh; uid: number; x: number; y: number }[] = [];
  private angle = 0;
  private revs = 0;
  count = 0;
  radius = AXE.radius;
  speed = AXE.speed;
  damage = AXE.damage;
  visible = true;
  private vis = 1;

  constructor(
    private ctx: Ctx,
    private owner: { x: number; y: number },
    private scale = 1,
  ) {}

  configure(count: number, radius: number, speed: number, damage: number): void {
    this.radius = radius;
    this.speed = speed;
    this.damage = damage;
    if (count === this.count) return;
    for (const a of this.axes) this.ctx.scene.remove(a.m);
    this.axes = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(GEO(), MAT.vc);
      m.castShadow = true;
      this.ctx.scene.add(m);
      this.axes.push({ m, uid: nextUid++, x: this.owner.x, y: this.owner.y });
    }
    this.count = count;
  }

  setVisible(v: boolean): void {
    this.visible = v;
  }

  update(dt: number, bears: Bear[], now: number, onHit: (b: Bear, dmg: number, fx: number, fy: number) => void, onRev?: () => void): void {
    this.angle += dt * this.speed * Math.PI * 2;
    const r = Math.floor(this.angle / (Math.PI * 2));
    if (r !== this.revs) {
      this.revs = r;
      if (this.visible) onRev?.();
    }
    this.vis += ((this.visible ? 1 : 0) - this.vis) * Math.min(1, dt * 12);
    const n = this.axes.length;
    for (let i = 0; i < n; i++) {
      const a = this.axes[i];
      const ang = this.angle + (i / n) * Math.PI * 2;
      a.x = this.owner.x + Math.cos(ang) * this.radius;
      a.y = this.owner.y + Math.sin(ang) * this.radius;
      a.m.visible = this.vis > 0.02;
      // 손잡이 끝이 주인 쪽, 날이 궤도 반경에 오도록 배치
      const off = this.radius * S - 0.53 * 1.5 * this.scale;
      a.m.position.set(this.owner.x * S + Math.cos(ang) * off, 0.42, this.owner.y * S + Math.sin(ang) * off);
      a.m.rotation.set(0, -ang, -0.25);
      a.m.scale.setScalar(this.scale * 1.5 * this.vis);
      if (!this.visible) continue;
      for (const b of bears) {
        if (!b.alive) continue;
        const rr = b.radius + AXE.hitRadius;
        if (dist2(a.x, a.y, b.x, b.y) > rr * rr) continue;
        if (!b.canBeHitBy(a.uid, now)) continue;
        b.markHit(a.uid, now);
        onHit(b, this.damage, this.owner.x, this.owner.y);
      }
    }
  }

  destroy(): void {
    for (const a of this.axes) this.ctx.scene.remove(a.m);
    this.axes = [];
  }
}
