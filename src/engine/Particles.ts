import * as THREE from 'three';
import { softTexture } from './models';

interface Particle {
  sp: THREE.Sprite;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  t: number;
  life: number;
  s0: number;
  s1: number;
  a0: number;
}

export interface BurstOpts {
  count: number;
  color: number | number[];
  speed: [number, number];
  up?: [number, number];
  life: [number, number];
  size: [number, number];
  gravity?: number;
  additive?: boolean;
  alpha?: number;
  spread?: number;
}

/** 스프라이트 기반 파티클(폭발/불꽃/연기/눈) — 풀링 */
export class Particles {
  private pool: THREE.Sprite[] = [];
  private live: Particle[] = [];
  private tex = softTexture();
  private snow: THREE.Points;
  private snowVel: Float32Array;

  constructor(private scene: THREE.Scene) {
    // 카메라 주변에 내리는 눈
    const n = 700;
    const pos = new Float32Array(n * 3);
    this.snowVel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = Math.random() * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 26;
      this.snowVel[i] = 0.5 + Math.random() * 0.9;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, map: this.tex, transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    this.snow.frustumCulled = false;
    scene.add(this.snow);
  }

  burst(x: number, y: number, z: number, o: BurstOpts): void {
    for (let i = 0; i < o.count; i++) {
      if (this.live.length > 500) return;
      const sp = this.pool.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false }));
      const mat = sp.material;
      const col = Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color;
      mat.color.setHex(col);
      mat.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      mat.opacity = o.alpha ?? 1;
      const spread = o.spread ?? 0;
      sp.position.set(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread);
      sp.visible = true;
      this.scene.add(sp);
      const a = Math.random() * Math.PI * 2;
      const v = o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]);
      const up = o.up ? o.up[0] + Math.random() * (o.up[1] - o.up[0]) : 0;
      this.live.push({
        sp,
        vx: Math.cos(a) * v,
        vz: Math.sin(a) * v,
        vy: up,
        g: o.gravity ?? 0,
        t: 0,
        life: o.life[0] + Math.random() * (o.life[1] - o.life[0]),
        s0: o.size[0],
        s1: o.size[1],
        a0: o.alpha ?? 1,
      });
    }
  }

  update(dt: number, cx: number, cz: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        p.sp.visible = false;
        this.scene.remove(p.sp);
        this.pool.push(p.sp);
        this.live.splice(i, 1);
        continue;
      }
      p.vy -= p.g * dt;
      p.sp.position.x += p.vx * dt;
      p.sp.position.y = Math.max(0.02, p.sp.position.y + p.vy * dt);
      p.sp.position.z += p.vz * dt;
      const s = p.s0 + (p.s1 - p.s0) * k;
      p.sp.scale.set(s, s, s);
      p.sp.material.opacity = p.a0 * (1 - k);
    }
    // 눈: 카메라 중심 주변으로 감싸며 떨어짐
    const pos = this.snow.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.snowVel.length; i++) {
      let y = arr[i * 3 + 1] - this.snowVel[i] * dt;
      if (y < 0) y += 12;
      arr[i * 3 + 1] = y;
      arr[i * 3] += Math.sin(y + i) * 0.15 * dt;
    }
    pos.needsUpdate = true;
    this.snow.position.set(cx, 0, cz);
  }
}

/** 연속 방출기(그릴 불꽃, 모닥불 등) */
export class Emitter3D {
  active = true;
  private acc = 0;

  constructor(
    private ps: Particles,
    private x: number,
    private y: number,
    private z: number,
    private rate: number,
    private opts: BurstOpts,
  ) {}

  update(dt: number): void {
    if (!this.active) return;
    this.acc += dt * this.rate;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.ps.burst(this.x, this.y, this.z, { ...this.opts, count: 1 });
    }
  }
}
