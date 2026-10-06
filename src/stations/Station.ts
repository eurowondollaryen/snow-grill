import * as THREE from 'three';
import { STATION, type ItemType, type Point } from '../config/balance';
import { Label } from '../engine/Labels';
import { Emitter3D } from '../engine/Particles';
import { MAT, butcherGeometry, grillCoals, grillGeometry, ITEM_H } from '../engine/models';
import { S } from '../engine/Renderer';
import { Ease } from '../engine/Tween';
import type { Ctx, V3 } from '../game/Ctx';
import { sound } from '../systems/SoundSystem';
import type { Carrier, TransferTarget } from '../systems/TransferSystem';
import { Zone } from './Zone';

export interface StationHooks {
  onInput?: (s: Station, c: Carrier) => void;
}

const PILE_COLS = 2;
const PILE_ROWS = 10;
const TOP_H = 0.86;

let butcherGeo: THREE.BufferGeometry | null = null;
let grillGeo: THREE.BufferGeometry | null = null;

/**
 * 공통 가공 시설: [입력 존] → 입력 버퍼 → 가공 → 출력 더미 → [출력 존]
 * 레일이 들어오는 아이템을 위해 reservedIn(예약)을 관리한다.
 */
export class Station {
  input = 0;
  output = 0;
  progress = 0;
  unlocked = false;
  processing = false;
  /** 레일로 이동 중이라 곧 들어올 개수 */
  reservedIn = 0;
  private inFlight = 0;
  readonly inputZone: Zone;
  readonly outputZone: Zone;
  private obj: THREE.Group;
  private body: THREE.Mesh;
  private collider: ReturnType<Ctx['world']['add']> | null = null;
  private info: Label;
  private bar!: HTMLElement;
  private inTxt!: HTMLElement;
  private outTxt!: HTMLElement;
  private full!: HTMLElement;
  private outPop = 0;
  private flames?: Emitter3D;
  private smoke?: Emitter3D;
  private coals?: THREE.Mesh;

  constructor(
    private ctx: Ctx,
    readonly kind: 'butcher' | 'grill',
    readonly pos: Point,
    readonly inputType: ItemType,
    readonly outputType: ItemType,
    private hooks: StationHooks = {},
  ) {
    const { x, y } = pos;
    this.inputZone = new Zone(ctx, { x: x - STATION.zoneGap, y: y + 6 }, STATION.zoneW, STATION.zoneH, '#8ecae6', 'in');
    this.outputZone = new Zone(ctx, { x: x + STATION.zoneGap, y: y + 6 }, STATION.zoneW, STATION.zoneH, '#ffd166', 'out');
    this.obj = new THREE.Group();
    this.obj.position.set(x * S, 0, y * S);
    const geo = kind === 'butcher' ? (butcherGeo ??= butcherGeometry()) : (grillGeo ??= grillGeometry());
    this.body = new THREE.Mesh(geo, MAT.vc);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.obj.add(this.body);
    if (kind === 'grill') {
      this.coals = grillCoals();
      this.obj.add(this.coals);
      const fx = x * S;
      const fz = y * S;
      this.flames = new Emitter3D(ctx.fx, fx, 0.9, fz, 26, {
        count: 1,
        color: [0xffd166, 0xff8c1a, 0xff5a1f],
        speed: [0.05, 0.25],
        up: [0.9, 1.6],
        life: [0.3, 0.55],
        size: [0.32, 0.02],
        additive: true,
        spread: 1.0,
      });
      this.smoke = new Emitter3D(ctx.fx, fx, 1.1, fz, 6, {
        count: 1,
        color: 0xb8c0c8,
        speed: [0.05, 0.2],
        up: [0.6, 1.0],
        life: [1.0, 1.6],
        size: [0.25, 0.9],
        alpha: 0.45,
        spread: 0.8,
      });
    }
    ctx.scene.add(this.obj);

    this.info = new Label(ctx.labels, 'station-info');
    this.info.html(
      `<div class="cnts"><span class="in"></span><span class="out"></span></div><div class="pbar"><b></b></div><div class="full">FULL</div>`,
    );
    this.inTxt = this.info.el.querySelector('.in')!;
    this.outTxt = this.info.el.querySelector('.out')!;
    this.bar = this.info.el.querySelector('.pbar b')!;
    this.full = this.info.el.querySelector('.full')!;
    this.full.style.display = 'none';
    this.info.at(x, y, 1.55);
    this.setLocked();
  }

  get fullOutput(): boolean {
    return this.output >= STATION.outputMax;
  }

  /** 들어올 수 있는 칸(레일 예약 포함) */
  get inputSpace(): number {
    return STATION.inputMax - this.input - this.reservedIn;
  }

  // ── 레일 연결(RailSource / RailSink) ──
  get freeSpace(): number {
    return this.inputSpace;
  }
  get dropPoint(): Point {
    return this.inputPoint;
  }
  dropTop(): V3 {
    return this.inputTop();
  }

  get inputPoint(): Point {
    return this.inputZone.center;
  }

  get outputPoint(): Point {
    return this.outputZone.center;
  }

  private setLocked(): void {
    this.unlocked = false;
    this.body.material = ghostMat;
    this.coals && (this.coals.visible = false);
    this.inputZone.setVisible(false);
    this.outputZone.setVisible(false);
    this.info.show(false);
  }

  unlock(animate: boolean): void {
    this.unlocked = true;
    this.body.material = MAT.vc;
    if (this.coals) this.coals.visible = true;
    this.inputZone.setVisible(true);
    this.outputZone.setVisible(true);
    this.info.show(true);
    this.collider ??= this.ctx.world.add(this.pos.x, this.pos.y + 4, STATION.bodyW - 12, STATION.bodyH * 0.7);
    if (animate) this.ctx.tw.add(0.55, (k) => this.obj.scale.setScalar(Math.max(0.001, k)), Ease.outBack);
  }

  restore(input: number, output: number): void {
    this.input = Math.min(STATION.inputMax, input);
    this.output = Math.min(STATION.outputMax, output);
  }

  /** 더미 위치(월드 단위). side: -1 입력 / +1 출력 */
  private pileSlot(side: number, i: number): V3 {
    const n = Math.min(i, PILE_COLS * PILE_ROWS - 1);
    const col = n % PILE_COLS;
    const row = Math.floor(n / PILE_COLS);
    return { x: this.pos.x * S + side * (0.36 + col * 0.13), y: TOP_H + row * ITEM_H, z: this.pos.y * S + (col - 0.5) * 0.12 };
  }

  /** 출력 더미 꼭대기(레일·운반 연출 시작점) */
  outputTop(): V3 {
    return this.pileSlot(1, Math.max(0, this.output - 1));
  }

  inputTop(): V3 {
    return this.pileSlot(-1, this.input);
  }

  /** 레일 등으로 아이템이 도착 */
  receive(): void {
    this.reservedIn = Math.max(0, this.reservedIn - 1);
    this.input = Math.min(STATION.inputMax, this.input + 1);
  }

  /** 출력에서 1개 꺼냄(레일용) */
  takeOutput(): V3 | null {
    if (this.output <= 0) return null;
    const p = this.outputTop();
    this.output--;
    return p;
  }

  targets(): TransferTarget[] {
    const input: TransferTarget = {
      zone: this.inputZone,
      enabled: () => this.unlocked,
      tryTransfer: (c) => {
        if (c.stack.type !== this.inputType || c.stack.empty || this.inputSpace <= 0) return false;
        const item = c.stack.remove();
        if (!item) return false;
        const slot = this.pileSlot(-1, this.input);
        this.input++;
        this.inFlight++;
        this.ctx.fly.fly(item.type, item, slot, { dur: 0.24, h: 0.6, onArrive: () => (this.inFlight = Math.max(0, this.inFlight - 1)) });
        if (c.isPlayer) sound.drop();
        this.hooks.onInput?.(this, c);
        return true;
      },
    };
    const output: TransferTarget = {
      zone: this.outputZone,
      enabled: () => this.unlocked,
      tryTransfer: (c) => {
        if (this.output <= 0 || !c.stack.canAccept(this.outputType)) return false;
        const p = this.takeOutput()!;
        c.stack.add(this.outputType, p);
        if (c.isPlayer) sound.pickup();
        return true;
      },
    };
    return [input, output];
  }

  update(dt: number, processTime: number): void {
    if (!this.unlocked) return;
    this.processing = false;
    if (!this.fullOutput && this.input > 0) {
      this.processing = true;
      this.progress += dt / processTime;
      if (this.progress >= 1) {
        this.progress = 0;
        this.input--;
        this.output++;
        this.outPop = 1;
      }
    } else if (this.input <= 0) this.progress = 0;
    this.outPop = Math.max(0, this.outPop - dt * 6);
    this.flames && (this.flames.active = this.processing);
    this.smoke && (this.smoke.active = this.processing);
    this.flames?.update(dt);
    this.smoke?.update(dt);
    if (this.kind === 'butcher' && this.processing) this.body.position.y = Math.abs(Math.sin(performance.now() / 45)) * 0.015;
    else this.body.position.y = 0;

    this.bar.style.width = `${Math.round(this.progress * 100)}%`;
    this.inTxt.textContent = this.input > 0 ? `${this.input}` : '';
    this.outTxt.textContent = this.output > 0 ? `${this.output}` : '';
    this.full.style.display = this.fullOutput ? '' : 'none';
  }

  draw(): void {
    if (!this.unlocked) return;
    const b = this.ctx.batch;
    const vin = Math.max(0, this.input - this.inFlight);
    for (let i = 0; i < Math.min(vin, PILE_COLS * PILE_ROWS); i++) {
      const p = this.pileSlot(-1, i);
      b.add(this.inputType, p.x, p.y, p.z, 0.2, 0.85);
    }
    for (let i = 0; i < Math.min(this.output, PILE_COLS * PILE_ROWS); i++) {
      const p = this.pileSlot(1, i);
      const pop = i === this.output - 1 ? 1 + 0.3 * Math.sin(this.outPop * Math.PI) : 1;
      b.add(this.outputType, p.x, p.y, p.z, -0.2, 0.85 * pop);
    }
  }
}

const ghostMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false });
