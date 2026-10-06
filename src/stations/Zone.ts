import * as THREE from 'three';
import type { Point, Rect } from '../config/balance';
import { zoneTexture, type ZoneIcon } from '../engine/models';
import { S } from '../engine/Renderer';
import type { Ctx } from '../game/Ctx';
import { centered, inRect } from '../utils/math';

const texCache = new Map<string, THREE.Texture>();
const geoCache = new Map<string, THREE.PlaneGeometry>();

function tex(w: number, h: number, color: string, active: boolean, icon: ZoneIcon): THREE.Texture {
  const key = `${w}x${h}_${color}_${active}_${icon}`;
  let t = texCache.get(key);
  if (!t) {
    t = zoneTexture(w, h, color, active, icon);
    texCache.set(key, t);
  }
  return t;
}

/** 바닥에 깔리는 상호작용 영역(점선 데칼). 좌표는 px */
export class Zone {
  readonly rect: Rect;
  private m: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private texes: [THREE.Texture, THREE.Texture];
  private active = false;
  private visible = true;

  constructor(
    ctx: Ctx,
    readonly center: Point,
    w: number,
    h: number,
    color = '#ffffff',
    icon: ZoneIcon = null,
  ) {
    this.rect = centered(center, w, h);
    this.texes = [tex(w, h, color, false, icon), tex(w, h, color, true, icon)];
    const gk = `${w}x${h}`;
    let g = geoCache.get(gk);
    if (!g) {
      g = new THREE.PlaneGeometry((w + 12) * S, (h + 12) * S);
      g.rotateX(-Math.PI / 2);
      geoCache.set(gk, g);
    }
    this.mat = new THREE.MeshBasicMaterial({ map: this.texes[0], transparent: true, depthWrite: false });
    this.m = new THREE.Mesh(g, this.mat);
    this.m.position.set(center.x * S, 0.012, center.y * S);
    this.m.renderOrder = 1;
    ctx.scene.add(this.m);
  }

  contains(x: number, y: number): boolean {
    return this.visible && inRect(x, y, this.rect);
  }

  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.mat.map = this.texes[on ? 1 : 0];
    this.mat.needsUpdate = true;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.m.visible = v;
  }
}
