import * as THREE from 'three';
import { RAIL, type ItemType, type Point } from '../config/balance';
import type { ItemBatch } from '../engine/ItemBatch';
import { MAT, beltTexture, railFrameGeometry } from '../engine/models';
import { S } from '../engine/Renderer';
import { Ease } from '../engine/Tween';
import type { Ctx, V3 } from '../game/Ctx';

/** 레일로 실어 보낼 수 있는 출발지 */
export interface RailSource {
  unlocked: boolean;
  output: number;
  outputPoint: Point;
  takeOutput(): V3 | null;
}

/** 레일이 실어다 줄 도착지 */
export interface RailSink {
  unlocked: boolean;
  /** 받을 수 있는 칸(예약 포함) */
  readonly freeSpace: number;
  reservedIn: number;
  dropPoint: Point;
  dropTop(): V3;
  receive(): void;
}

interface Moving {
  path: V3[];
  seg: number;
  t: number;
  sink: RailSink;
}

const BELT_Y = 0.3;

/**
 * 컨베이어 레일: 출발지(출력 더미)에서 1개씩 집어 벨트를 타고 도착지(입력)에 넣는다.
 * 벨트는 lane(y) 을 따라 가로로 놓이고, 양 끝은 각 시설 존 앞으로 내려온다.
 */
export class Rail {
  unlocked = false;
  private items: Moving[] = [];
  private timer = 0;
  private rr = 0;
  private obj: THREE.Group;
  private belt: THREE.Texture;
  private ghost: THREE.Material;

  constructor(
    private ctx: Ctx,
    private type: ItemType,
    private lane: number,
    private sources: () => RailSource[],
    private sinks: () => RailSink[],
  ) {
    this.obj = new THREE.Group();
    const len = (RAIL.x1 - RAIL.x0) * S;
    this.belt = beltTexture();
    this.belt.repeat.set(len / 0.5, 1);
    const beltMat = new THREE.MeshLambertMaterial({ map: this.belt });
    const beltGeo = new THREE.BoxGeometry(len, 0.05, 0.38);
    const beltMesh = new THREE.Mesh(beltGeo, beltMat);
    beltMesh.position.y = BELT_Y - 0.03;
    beltMesh.receiveShadow = true;
    const frame = new THREE.Mesh(railFrameGeometry(len), MAT.vc);
    frame.castShadow = true;
    this.obj.add(beltMesh, frame);
    this.obj.position.set(((RAIL.x0 + RAIL.x1) / 2) * S, 0, lane * S);
    this.ghost = new THREE.MeshLambertMaterial({ color: 0x9aa3b5, transparent: true, opacity: 0.25, depthWrite: false });
    this.setGhost(true);
    ctx.scene.add(this.obj);
  }

  private setGhost(on: boolean): void {
    this.obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.userData.mat ??= o.material;
        o.material = on ? this.ghost : o.userData.mat;
      }
    });
  }

  unlock(animate: boolean): void {
    this.unlocked = true;
    this.setGhost(false);
    if (animate) this.ctx.tw.add(0.6, (k) => this.obj.scale.set(Math.max(0.001, k), 1, 1), Ease.outBack);
  }

  update(dt: number): void {
    if (!this.unlocked) return;
    this.belt.offset.x -= dt * (RAIL.speed * S) / 0.5;
    this.timer += dt;
    if (this.timer >= RAIL.interval && this.items.length < RAIL.maxOnBelt) {
      this.timer = 0;
      this.dispatch();
    }
    const speed = RAIL.speed * S;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      let move = speed * dt;
      while (move > 0 && it.seg < it.path.length - 1) {
        const a = it.path[it.seg];
        const b = it.path[it.seg + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 0.0001;
        const left = (1 - it.t) * len;
        if (move >= left) {
          move -= left;
          it.seg++;
          it.t = 0;
        } else {
          it.t += move / len;
          move = 0;
        }
      }
      if (it.seg >= it.path.length - 1) {
        it.sink.receive();
        this.items.splice(i, 1);
      }
    }
  }

  private dispatch(): void {
    const srcs = this.sources().filter((s) => s.unlocked && s.output > 0);
    const sinks = this.sinks().filter((s) => s.unlocked && s.freeSpace > 0);
    if (srcs.length === 0 || sinks.length === 0) return;
    const src = srcs[this.rr++ % srcs.length];
    let sink = sinks[0];
    for (const s of sinks) if (s.freeSpace > sink.freeSpace) sink = s;
    const from = src.takeOutput();
    if (!from) return;
    sink.reservedIn++;
    const ly = this.lane * S;
    const sx = src.outputPoint.x * S;
    const dx = sink.dropPoint.x * S;
    const end = sink.dropTop();
    this.items.push({
      path: [from, { x: sx, y: BELT_Y + 0.04, z: ly }, { x: dx, y: BELT_Y + 0.04, z: ly }, { x: end.x, y: end.y + 0.25, z: end.z }, end],
      seg: 0,
      t: 0,
      sink,
    });
  }

  draw(batch: ItemBatch): void {
    for (const it of this.items) {
      const a = it.path[it.seg];
      const b = it.path[Math.min(it.seg + 1, it.path.length - 1)];
      const hop = it.seg === 0 || it.seg >= 2 ? Math.sin(Math.PI * it.t) * 0.35 : 0;
      batch.add(this.type, a.x + (b.x - a.x) * it.t, a.y + (b.y - a.y) * it.t + hop, a.z + (b.z - a.z) * it.t, 0, 0.9);
    }
  }
}
