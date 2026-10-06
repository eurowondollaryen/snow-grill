import * as THREE from 'three';
import { PLAYER, WORLD } from '../config/balance';
import type { Label } from '../engine/Labels';
import { Label as L } from '../engine/Labels';
import type { Avatar } from '../config/avatar';
import { buildAvatarModel } from '../engine/avatarModel';
import { S } from '../engine/Renderer';
import type { Ctx } from '../game/Ctx';
import { ItemStack } from './ItemStack';
import type { Collector } from './Pickup';

export enum PlayerState {
  Idle,
  Walk,
}

/** 조작 캐릭터 */
export class Player implements Collector {
  x: number;
  y: number;
  obj: THREE.Object3D;
  private body: THREE.Group;
  private nameTag: Label;
  stack: ItemStack;
  magnetRadius: number = PLAYER.magnetRadius;
  state = PlayerState.Idle;
  fx = 0;
  fy = 1;
  transferTimer = 0;
  lastTransfer?: number;
  readonly isPlayer = true;
  private walkT = 0;
  private idleT = 0;
  private label: Label;
  onCollect?: Collector['onCollect'];

  constructor(
    private ctx: Ctx,
    x: number,
    y: number,
    capacity: number,
    avatar: Avatar,
    face: THREE.Texture | null,
  ) {
    this.x = x;
    this.y = y;
    this.obj = new THREE.Group();
    this.body = buildAvatarModel(avatar, face);
    this.body.scale.setScalar(1.22);
    this.obj.add(this.body);
    ctx.scene.add(this.obj);
    this.stack = new ItemStack(capacity);
    this.label = new L(ctx.labels, 'stack-count');
    this.nameTag = new L(ctx.labels, 'name-tag').text(avatar.name);
  }

  /** 꾸미기 결과 적용(모델 교체) */
  setAvatar(avatar: Avatar, face: THREE.Texture | null): void {
    this.obj.remove(this.body);
    this.body.userData.dispose?.();
    this.body = buildAvatarModel(avatar, face);
    this.body.scale.setScalar(1.22);
    this.obj.add(this.body);
    this.nameTag.text(avatar.name);
  }

  get inCamp(): boolean {
    return this.y > WORLD.campTop;
  }

  teleport(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  update(dt: number, ix: number, iy: number, speed: number): void {
    const len = Math.hypot(ix, iy);
    if (len > 0.05) {
      const k = Math.min(1, len);
      const nx = ix / len;
      const ny = iy / len;
      const p = this.ctx.world.resolve(this.x + nx * speed * k * dt, this.y + ny * speed * k * dt, PLAYER.bodyRadius);
      this.x = p.x;
      this.y = p.y;
      this.fx = nx;
      this.fy = ny;
      this.state = PlayerState.Walk;
      this.idleT = 0;
    } else {
      this.state = PlayerState.Idle;
      // 잠시 멈춰 있으면 카메라 쪽으로 돌아 얼굴을 보여줌
      this.idleT += dt;
      if (this.idleT > 0.7) {
        this.fx = 0;
        this.fy = 1;
      }
    }
    const moving = this.state === PlayerState.Walk;
    this.walkT += dt * (moving ? 15 : 3);
    const want = Math.atan2(this.fx, this.fy);
    let d = want - this.obj.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.obj.rotation.y += d * Math.min(1, dt * 14);
    this.obj.position.set(this.x * S, moving ? Math.abs(Math.sin(this.walkT)) * 0.06 : 0, this.y * S);
    this.body.rotation.z = moving ? Math.sin(this.walkT) * 0.08 : 0;
    const sq = moving ? 0 : Math.sin(this.walkT) * 0.015;
    this.body.scale.set(1.22 + sq, 1.22 - sq, 1.22 + sq);

    this.stack.update(dt, this.x * S, this.y * S, this.fx, this.fy);
    const top = this.stack.top();
    const text = this.stack.empty ? '' : this.stack.full ? 'MAX' : `${this.stack.count}/${this.stack.capacity}`;
    this.label.text(text).at(this.x, this.y, Math.max(top.y + 0.25, 1.45));
    this.label.el.classList.toggle('max', this.stack.full);
    this.nameTag.at(this.x, this.y, 1.45);
    this.nameTag.show(this.stack.empty);
  }

  draw(): void {
    this.stack.draw(this.ctx.batch);
  }
}
