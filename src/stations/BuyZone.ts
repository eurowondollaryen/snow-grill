import * as THREE from 'three';
import { BUYZONE, type UnlockDef, type UnlockTrack } from '../config/balance';
import { Label } from '../engine/Labels';
import { zoneTexture } from '../engine/models';
import { S } from '../engine/Renderer';
import { Ease } from '../engine/Tween';
import type { Ctx } from '../game/Ctx';
import { buyZoneRate } from '../systems/EconomySystem';
import type { GameState } from '../systems/GameState';
import { sound } from '../systems/SoundSystem';
import { formatNum, inRect } from '../utils/math';

const COLORS: Record<UnlockTrack, string> = { facility: '#ffd166', staff: '#7bd389', stage: '#ff6bd6' };

/** 코인 투입식 해금 존. 위에 서 있으면 지갑에서 코인이 빨려 들어간다. */
export class BuyZone {
  def: UnlockDef | null = null;
  private m: THREE.Mesh;
  private mats: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  private card: Label;
  private title: HTMLElement;
  private price: HTMLElement;
  private bar: HTMLElement;
  private acc = 0;
  private fxT = 0;
  inside = false;
  private needExit = false;
  private shownKey = '';

  constructor(
    private ctx: Ctx,
    private state: GameState,
    readonly track: UnlockTrack,
  ) {
    const g = new THREE.PlaneGeometry((BUYZONE.w + 12) * S, (BUYZONE.h + 12) * S);
    g.rotateX(-Math.PI / 2);
    const col = COLORS[track];
    this.mats = [
      new THREE.MeshBasicMaterial({ map: zoneTexture(BUYZONE.w, BUYZONE.h, col, false, null), transparent: true, depthWrite: false }),
      new THREE.MeshBasicMaterial({ map: zoneTexture(BUYZONE.w, BUYZONE.h, col, true, null), transparent: true, depthWrite: false }),
    ];
    this.m = new THREE.Mesh(g, this.mats[0]);
    this.m.renderOrder = 2;
    this.m.visible = false;
    ctx.scene.add(this.m);
    this.card = new Label(ctx.labels, `buy-card t-${track}`).show(false);
    this.card.anchorY = -50;
    this.card.html('<div class="t"></div><div class="p"><i class="coin"></i><span></span></div><div class="bar"><b></b></div>');
    this.title = this.card.el.querySelector('.t')!;
    this.price = this.card.el.querySelector('.p span')!;
    this.bar = this.card.el.querySelector('.bar b')!;
  }

  show(def: UnlockDef | null, animate: boolean): void {
    this.def = def;
    this.acc = 0;
    this.needExit = true;
    this.shownKey = '';
    if (!def) {
      this.m.visible = false;
      this.card.show(false);
      return;
    }
    this.m.visible = true;
    this.m.position.set(def.pos.x * S, 0.014, def.pos.y * S);
    this.card.show(true).at(def.pos.x, def.pos.y, 0.05);
    this.title.textContent = def.label;
    this.refresh();
    if (animate) {
      this.ctx.tw.add(0.45, (k) => this.m.scale.setScalar(Math.max(0.001, k)), Ease.outBack, undefined, 0.15);
      this.card.el.classList.remove('pop');
      void this.card.el.offsetWidth;
      this.card.el.classList.add('pop');
    }
  }

  private refresh(): void {
    const def = this.def;
    if (!def) return;
    const full = this.state.priceOf(def);
    const paid = this.state.paid(this.track);
    const key = `${full - paid}|${this.inside}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.price.textContent = formatNum(full - paid);
    this.bar.style.width = `${Math.round((paid / full) * 100)}%`;
  }

  contains(x: number, y: number): boolean {
    if (!this.def) return false;
    return inRect(x, y, { x: this.def.pos.x - BUYZONE.w / 2, y: this.def.pos.y - BUYZONE.h / 2, w: BUYZONE.w, h: BUYZONE.h });
  }

  update(dt: number, px: number, py: number): void {
    const def = this.def;
    if (!def) return;
    const inside = this.contains(px, py);
    if (inside !== this.inside) {
      this.inside = inside;
      this.acc = 0;
      this.m.material = this.mats[inside ? 1 : 0];
    }
    const affordable = this.state.coins >= this.state.remaining(this.track);
    this.card.el.classList.toggle('ready', affordable && !inside);
    this.refresh();
    if (!inside) {
      this.needExit = false;
      return;
    }
    if (this.needExit || this.state.coins <= 0) return;
    this.acc += buyZoneRate(this.state.priceOf(def)) * dt;
    const want = Math.floor(this.acc);
    if (want <= 0) return;
    this.acc -= want;
    const paid = this.state.payTowardUnlock(this.track, want);
    if (paid > 0) {
      this.fxT += dt;
      if (this.fxT >= BUYZONE.coinFxInterval) {
        this.fxT = 0;
        this.ctx.fly.fly('coin', { x: px * S, y: 1.1, z: py * S }, { x: def.pos.x * S, y: 0.05, z: def.pos.y * S }, { dur: 0.28, h: 0.6, s1: 0.6 });
        sound.pay();
      }
    }
  }

  get center(): { x: number; y: number } | null {
    return this.def ? this.def.pos : null;
  }
}
