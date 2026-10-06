import * as THREE from 'three';
import { CUSTOMERS, type Point } from '../config/balance';
import { Label } from '../engine/Labels';
import { MAT, personGeometry } from '../engine/models';
import { S } from '../engine/Renderer';
import type { Ctx } from '../game/Ctx';
import { randInt } from '../utils/math';
import { ItemStack } from './ItemStack';

export enum CustomerState {
  Enter,
  Queue,
  Leave,
  Gone,
}

export const CUSTOMER_COATS = [0x4f86c6, 0xe07a5f, 0x81b29a, 0xf2cc8f, 0x9d6fc4, 0x5fb3b3];
const geos: THREE.BufferGeometry[] = [];
const coatGeo = (i: number): THREE.BufferGeometry => {
  if (!geos[i]) {
    const c = new THREE.Color(CUSTOMER_COATS[i]);
    geos[i] = personGeometry({
      coat: CUSTOMER_COATS[i],
      hat: c.clone().multiplyScalar(0.6).getHex(),
      scarf: c.clone().lerp(new THREE.Color(0xffffff), 0.5).getHex(),
    });
  }
  return geos[i];
};

/** 손님: 입구 → 줄 서기 → 구매 → 퇴장 */
export class Customer {
  private obj: THREE.Mesh;
  stack: ItemStack;
  private bubble: Label;
  state = CustomerState.Gone;
  x = 0;
  y = 0;
  private target: Point = { x: 0, y: 0 };
  want = 1;
  got = 0;
  patience: number = CUSTOMERS.patience;
  isFront = false;
  private walkT = 0;
  private yaw = 0;
  private bubbleKey = '';

  constructor(private ctx: Ctx) {
    this.obj = new THREE.Mesh(coatGeo(0), MAT.vc);
    this.obj.castShadow = true;
    this.obj.visible = false;
    ctx.scene.add(this.obj);
    this.stack = new ItemStack(CUSTOMERS.maxWant, { scale: 0.8, back: -0.25, base: 0.32 });
    this.bubble = new Label(ctx.labels, 'bubble').show(false);
  }

  get active(): boolean {
    return this.state !== CustomerState.Gone;
  }

  get arrived(): boolean {
    return this.state === CustomerState.Queue && Math.abs(this.x - this.target.x) < 3 && Math.abs(this.y - this.target.y) < 3;
  }

  spawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.want = randInt(CUSTOMERS.minWant, CUSTOMERS.maxWant);
    this.got = 0;
    this.patience = CUSTOMERS.patience;
    this.isFront = false;
    this.state = CustomerState.Enter;
    this.stack.clear();
    this.obj.geometry = coatGeo(randInt(0, CUSTOMER_COATS.length - 1));
    this.obj.visible = true;
    this.bubble.show(true);
    this.bubbleKey = '';
  }

  goTo(p: Point): void {
    this.target = p;
    if (this.state === CustomerState.Enter) this.state = CustomerState.Queue;
  }

  leave(happy: boolean): void {
    this.state = CustomerState.Leave;
    this.isFront = false;
    this.target = { x: CUSTOMERS.entrance.x, y: CUSTOMERS.entrance.y };
    this.bubble.show(false);
    this.ctx.labels.float(this.x, this.y, 1.3, happy ? '❤️' : '💢', 'mood', 1.4, 0.8);
  }

  update(dt: number): void {
    if (this.state === CustomerState.Gone) return;
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    const moving = d > 2;
    if (moving) {
      const k = Math.min(1, (CUSTOMERS.speed * dt) / d);
      this.x += dx * k;
      this.y += dy * k;
      const want = Math.atan2(dx, dy);
      let a = want - this.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      this.yaw += a * Math.min(1, dt * 10);
    } else if (this.state === CustomerState.Queue) {
      // 줄에서는 판매대(위쪽)를 바라봄
      let a = Math.PI - this.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      this.yaw += a * Math.min(1, dt * 8);
    }
    this.walkT += dt * (moving ? 14 : 2);
    this.obj.position.set(this.x * S, moving ? Math.abs(Math.sin(this.walkT)) * 0.05 : 0, this.y * S);
    this.obj.rotation.set(0, this.yaw, moving ? Math.sin(this.walkT) * 0.08 : 0);
    this.stack.update(dt, this.x * S, this.y * S, Math.sin(this.yaw), Math.cos(this.yaw));

    if (this.state === CustomerState.Leave) {
      if (d < 4) {
        this.state = CustomerState.Gone;
        this.obj.visible = false;
        this.stack.clear();
      }
      return;
    }
    // 줄이 겹쳐 보이지 않도록 말풍선은 맨 앞 손님만
    this.bubble.show(this.isFront);
    const showPat = this.isFront && this.arrived;
    const r = Math.max(0, this.patience / CUSTOMERS.patience);
    const key = `${this.got}/${this.want}|${showPat ? Math.round(r * 30) : -1}`;
    if (key !== this.bubbleKey) {
      this.bubbleKey = key;
      const txt = this.got > 0 ? `${this.got}/${this.want}` : `×${this.want}`;
      const col = r > 0.5 ? '#7bd389' : r > 0.25 ? '#ffd166' : '#e63946';
      const bar = showPat ? `<i class="pat"><b style="width:${Math.round(r * 100)}%;background:${col}"></b></i>` : '';
      this.bubble.html(`<span class="ico">🍖</span>${txt}${bar}`);
    }
    this.bubble.at(this.x, this.y, 1.45);
  }

  draw(): void {
    if (this.state !== CustomerState.Gone) this.stack.draw(this.ctx.batch);
  }
}
