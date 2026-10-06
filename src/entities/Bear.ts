import * as THREE from 'three';
import { AXE, BEAR_AI, BEARS, FX, type BearDef, type BearKind, type Rect } from '../config/balance';
import type { Theme } from '../config/stages';
import { Label } from '../engine/Labels';
import { bearGeometry } from '../engine/models';
import { S } from '../engine/Renderer';
import { Ease } from '../engine/Tween';
import type { Ctx } from '../game/Ctx';
import { clamp, damp, rand } from '../utils/math';

export enum BearState {
  Idle,
  Wander,
  Flee,
  Dead,
}

const MODEL_SCALE: Record<BearKind, number> = { baby: 0.62, brown: 0.95, polar: 1.25, boss: 2.0 };
const geoCache = new Map<string, THREE.BufferGeometry>();
const barBg = new THREE.SpriteMaterial({ color: 0x1d3557, transparent: true, opacity: 0.7, depthTest: false });
const barFill = new THREE.SpriteMaterial({ color: 0xff4d5e, depthTest: false });

function geo(theme: Theme, kind: BearKind): THREE.BufferGeometry {
  const key = `${theme.id}_${kind}`;
  let g = geoCache.get(key);
  if (!g) {
    const look = theme.bears[kind];
    g = bearGeometry(look.fur, look.belly, kind === 'boss');
    geoCache.set(key, g);
  }
  return g;
}

/** 사냥터 안을 배회하는 곰(좌표 px). 플레이어를 공격하지 않는다. */
export class Bear {
  readonly def: BearDef;
  readonly radius: number;
  hp: number;
  x: number;
  y: number;
  state = BearState.Idle;
  alive = true;
  removed = false;
  private obj: THREE.Mesh;
  private mat: THREE.MeshLambertMaterial;
  private bg: THREE.Sprite;
  private fill: THREE.Sprite;
  private label?: Label;
  private timer = rand(BEAR_AI.idleMin, BEAR_AI.idleMax);
  private tx = 0;
  private ty = 0;
  private kx = 0;
  private ky = 0;
  private flash = 0;
  private walkT = Math.random() * 10;
  private hits = new Map<number, number>();
  private fleeDx = 0;
  private fleeDy = 0;
  private yaw = Math.random() * Math.PI * 2;
  private spawnK = 0;
  private scale: number;

  constructor(
    private ctx: Ctx,
    readonly kind: BearKind,
    readonly zone: Rect,
    x: number,
    y: number,
    theme: Theme,
    labelText?: string,
  ) {
    this.def = BEARS[kind];
    this.radius = this.def.radius;
    this.hp = this.def.hp;
    this.x = x;
    this.y = y;
    this.scale = MODEL_SCALE[kind];
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: false });
    this.obj = new THREE.Mesh(geo(theme, kind), this.mat);
    this.obj.castShadow = true;
    this.obj.scale.setScalar(0.001);
    ctx.scene.add(this.obj);
    this.bg = new THREE.Sprite(barBg);
    this.fill = new THREE.Sprite(barFill);
    this.fill.center.set(0, 0.5);
    this.bg.renderOrder = 10;
    this.fill.renderOrder = 11;
    this.bg.visible = this.fill.visible = false;
    ctx.scene.add(this.bg, this.fill);
    if (labelText) this.label = new Label(ctx.labels, 'boss-name').text(labelText);
  }

  get isBoss(): boolean {
    return this.kind === 'boss';
  }

  canBeHitBy(uid: number, now: number): boolean {
    const t = this.hits.get(uid);
    return t === undefined || now - t >= AXE.hitCooldown;
  }

  markHit(uid: number, now: number): void {
    this.hits.set(uid, now);
  }

  damage(amount: number, fromX: number, fromY: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flash = FX.hitFlash;
    this.mat.emissive.setHex(0xffffff);
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.kx += (dx / d) * AXE.knockback * BEAR_AI.knockbackDecay;
    this.ky += (dy / d) * AXE.knockback * BEAR_AI.knockbackDecay;
    if (this.def.fleeOnHit) {
      this.state = BearState.Flee;
      this.timer = BEAR_AI.fleeTime;
      this.fleeDx = dx / d;
      this.fleeDy = dy / d;
    }
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private die(): void {
    this.alive = false;
    this.state = BearState.Dead;
    this.bg.visible = this.fill.visible = false;
    this.label?.show(false);
    this.mat.transparent = true;
    const s = this.scale;
    // 팡! 부풀었다가 옆으로 쓰러지며 사라짐
    this.ctx.tw.add(0.08, (k) => this.obj.scale.set(s * (1 + 0.3 * k), s * (1 + 0.15 * k), s * (1 + 0.3 * k)), Ease.outQuad, () => {
      this.mat.emissive.setHex(0x000000);
      this.ctx.tw.add(
        0.4,
        (k) => {
          this.obj.scale.setScalar(s * (1.3 - 0.3 * k));
          this.obj.rotation.z = (Math.PI / 2) * k;
          this.obj.position.y = -0.15 * k;
          this.mat.opacity = 1 - k;
        },
        Ease.inQuad,
        () => this.destroy(),
      );
    });
  }

  pushFrom(px: number, py: number, minDist: number): void {
    if (!this.alive) return;
    const dx = this.x - px;
    const dy = this.y - py;
    const d = Math.hypot(dx, dy);
    if (d >= minDist) return;
    if (d === 0) {
      this.x += minDist;
      return;
    }
    const k = (minDist - d) / d;
    this.x += dx * k * 0.5;
    this.y += dy * k * 0.5;
  }

  update(dt: number): void {
    if (!this.alive) return;
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.mat.emissive.setHex(0x000000);
    }
    let vx = 0;
    let vy = 0;
    this.timer -= dt;
    switch (this.state) {
      case BearState.Idle:
        if (this.timer <= 0) {
          const a = rand(0, Math.PI * 2);
          const r = rand(BEAR_AI.wanderDistMin, BEAR_AI.wanderDistMax);
          this.tx = clamp(this.x + Math.cos(a) * r, this.zone.x + 40, this.zone.x + this.zone.w - 40);
          this.ty = clamp(this.y + Math.sin(a) * r, this.zone.y + 40, this.zone.y + this.zone.h - 20);
          this.state = BearState.Wander;
          this.timer = 6;
        }
        break;
      case BearState.Wander: {
        const dx = this.tx - this.x;
        const dy = this.ty - this.y;
        const d = Math.hypot(dx, dy);
        if (d < 6 || this.timer <= 0) {
          this.state = BearState.Idle;
          this.timer = rand(BEAR_AI.idleMin, BEAR_AI.idleMax);
        } else {
          vx = (dx / d) * this.def.speed;
          vy = (dy / d) * this.def.speed;
        }
        break;
      }
      case BearState.Flee:
        vx = this.fleeDx * BEAR_AI.fleeSpeed;
        vy = this.fleeDy * BEAR_AI.fleeSpeed;
        if (this.timer <= 0) {
          this.state = BearState.Idle;
          this.timer = rand(BEAR_AI.idleMin, BEAR_AI.idleMax);
        }
        break;
    }
    const kd = damp(BEAR_AI.knockbackDecay, dt);
    this.x += (vx + this.kx) * dt;
    this.y += (vy + this.ky) * dt;
    this.kx -= this.kx * kd;
    this.ky -= this.ky * kd;
    this.x = clamp(this.x, this.zone.x + this.radius, this.zone.x + this.zone.w - this.radius);
    this.y = clamp(this.y, this.zone.y + this.radius, this.zone.y + this.zone.h);

    const moving = Math.abs(vx) + Math.abs(vy) > 1;
    if (moving) {
      const want = Math.atan2(vx, vy);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 8);
    }
    this.walkT += dt * (moving ? 9 : 2);
    this.spawnK = Math.min(1, this.spawnK + dt * 3.5);
    const pop = Ease.outBack(this.spawnK);
    const s = this.scale * pop;
    const breathe = moving ? 0 : Math.sin(this.walkT) * 0.02;
    this.obj.scale.set(s * (1 + breathe), s * (1 - breathe), s);
    this.obj.position.set(this.x * S, moving ? Math.abs(Math.sin(this.walkT)) * 0.05 * this.scale : 0, this.y * S);
    this.obj.rotation.set(0, this.yaw, moving ? Math.sin(this.walkT) * 0.07 : 0);

    const damaged = this.hp < this.def.hp || this.isBoss;
    this.bg.visible = this.fill.visible = damaged;
    const topH = 1.12 * this.scale + 0.12;
    if (damaged) {
      const w = this.radius * S * (this.isBoss ? 2.4 : 1.8);
      this.bg.scale.set(w + 0.04, this.isBoss ? 0.11 : 0.08, 1);
      this.bg.position.set(this.x * S, topH, this.y * S);
      this.fill.scale.set(Math.max(0.001, w * (this.hp / this.def.hp)), this.isBoss ? 0.07 : 0.045, 1);
      this.fill.position.set(this.x * S - w / 2, topH, this.y * S);
    }
    this.label?.at(this.x, this.y, topH + 0.12);
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.alive = false;
    this.ctx.scene.remove(this.obj, this.bg, this.fill);
    this.mat.dispose();
    this.label?.destroy();
  }
}
