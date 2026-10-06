import * as THREE from 'three';
import {
  COMBO,
  COUNTER,
  FX,
  HUNT_ZONES,
  LAYOUT,
  PLAYER,
  RAIL,
  SAVE,
  UNLOCKS,
  UNLOCK_TRACKS,
  WORKERS,
  WORLD,
  type Point,
  type UnlockDef,
  type UnlockId,
  type UnlockTrack,
} from '../config/balance';
import { AxeRing } from '../entities/Axe';
import type { Bear } from '../entities/Bear';
import { FlySystem } from '../entities/Fly';
import { PickupSystem, type Collector } from '../entities/Pickup';
import { Player } from '../entities/Player';
import { CashierWorker, HunterWorker, type Worker, type WorkerWorld } from '../entities/Worker';
import { ItemBatch } from '../engine/ItemBatch';
import { Label, LabelLayer } from '../engine/Labels';
import {
  MAT,
  campfireGeometry,
  fenceGeometry,
  forgeFire,
  forgeGeometry,
  gateLockedGeometry,
  groundTexture,
  hireBoardGeometry,
  rockGeometry,
  sledGeometry,
  tentGeometry,
  treeGeometry,
} from '../engine/models';
import { Emitter3D, Particles } from '../engine/Particles';
import { StaticWorld } from '../engine/Physics';
import { Renderer, S } from '../engine/Renderer';
import { Ease, Tweens } from '../engine/Tween';
import { BuyZone } from '../stations/BuyZone';
import { Counter } from '../stations/Counter';
import { Rail } from '../stations/Rail';
import { Station } from '../stations/Station';
import { Zone } from '../stations/Zone';
import { offlineReward } from '../systems/EconomySystem';
import { GameState } from '../systems/GameState';
import { inputState } from '../systems/InputState';
import { MissionTracker, type Mission } from '../systems/MissionSystem';
import { clearSave, getStorage, loadSave, writeSave, type SaveData, type StorageLike } from '../systems/SaveSystem';
import { sound } from '../systems/SoundSystem';
import { TransferSystem, type Carrier } from '../systems/TransferSystem';
import { Tutorial, type TutorialFlags } from '../systems/Tutorial';
import { dist2, formatNum } from '../utils/math';
import type { Ctx } from './Ctx';
import type { Avatar } from '../config/avatar';
import { faceTexture } from '../engine/avatarModel';
import { clearFace, loadFace, saveFace } from '../systems/FaceStore';
import { CustomerFlow, Spawner } from './Spawner';

export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';

/** 메인 게임(3D). 순수 로직(GameState/Save/Mission/Tutorial)을 그대로 쓰고 렌더링만 Three.js */
export class Game {
  readonly state: GameState;
  readonly ctx: Ctx;
  player!: Player;
  private axes!: AxeRing;
  spawner!: Spawner;
  pickups = new PickupSystem();
  private transfer = new TransferSystem();
  butchers: Station[] = [];
  grills: Station[] = [];
  counters: Counter[] = [];
  rails: Partial<Record<'rail1' | 'rail2', Rail>> = {};
  buyZones!: Record<UnlockTrack, BuyZone>;
  workers: Worker[] = [];
  private customers!: CustomerFlow;
  tutorial!: Tutorial;
  missions!: MissionTracker;
  forgeOpen = false;
  private forgeUnlocked = false;
  private forgeObj!: THREE.Group;
  private forgeZone!: Zone;
  private sled!: THREE.Mesh;
  private sledGhost!: THREE.Material;
  private gateB: { mesh: THREE.Object3D; rect: ReturnType<StaticWorld['add']> } | null = null;
  private veil: THREE.Object3D[] = [];
  private veilLabel!: Label;
  private marker!: THREE.Mesh;
  private storage: StorageLike | null;
  private saveDisabled = false;
  now = 0;
  private saveTimer = 0;
  private pileTimer = 0;
  private hintTimer = 0;
  private combo = 0;
  private lastKillAt = -99;
  private lastZone: Zone | null = null;
  private emitters: Emitter3D[] = [];
  private world!: WorkerWorld;
  private keys = new Set<string>();
  private flags: TutorialFlags = { bearKilled: false, butcherIn: false, grillIn: false, counterIn: false, sold: false, coinsCollected: false };
  /** 타이틀 화면 동안은 입력/진행 없이 배경만 */
  paused = true;
  private offline = 0;
  private offlineElapsed = 0;
  private faceTex: THREE.Texture | null = null;

  constructor(readonly r: Renderer, hudRoot: HTMLElement) {
    this.storage = getStorage();
    const now = Date.now();
    const { data } = loadSave(this.storage, now);
    this.offlineElapsed = now - data.lastSeen;
    this.state = new GameState(data);
    sound.enabled = data.sound;

    const theme = this.state.theme;
    r.setTheme(theme.bg);
    const labels = new LabelLayer(hudRoot);
    this.ctx = {
      r,
      scene: r.scene,
      batch: new ItemBatch(r.scene),
      labels,
      fx: new Particles(r.scene),
      tw: new Tweens(),
      fly: new FlySystem(),
      world: new StaticWorld({ w: WORLD.width, h: WORLD.height }),
    };
    this.spawner = new Spawner(this.ctx, theme);
    this.spawner.onBoss = () => this.onBossSpawn();

    this.buildWorld();
    this.buildFacilities();

    const stats = this.state.stats;
    const faceUrl = loadFace();
    this.faceTex = faceUrl ? faceTexture(faceUrl) : null;
    this.player = new Player(this.ctx, PLAYER.start.x, PLAYER.start.y, stats.carryCapacity, data.avatar, this.faceTex);
    this.player.magnetRadius = PLAYER.magnetRadius * this.state.magnetMult;
    this.player.onCollect = () => sound.pickup();
    this.player.stack.restore(data.carry.type, data.carry.count);
    this.axes = new AxeRing(this.ctx, this.player);
    this.axes.configure(stats.axeCount, stats.axeRadius, stats.axeSpeed, stats.axeDamage);

    this.customers = new CustomerFlow(this.ctx, this.counters);
    this.buyZones = {
      facility: new BuyZone(this.ctx, this.state, 'facility'),
      staff: new BuyZone(this.ctx, this.state, 'staff'),
      stage: new BuyZone(this.ctx, this.state, 'stage'),
    };

    for (const u of UNLOCKS) if (data.unlockedIds.includes(u.id)) this.applyUnlock(u.id, false);
    this.butchers.forEach((s, i) => s.restore(data.butchers[i].input, data.butchers[i].output));
    this.grills.forEach((s, i) => s.restore(data.grills[i].input, data.grills[i].output));
    this.counters.forEach((c, i) => {
      c.display = c.unlocked ? data.displays[i] : 0;
      if (data.piles[i] > 0) {
        c.pile.addIncoming(data.piles[i]);
        c.pile.arrived(data.piles[i]);
      }
    });
    for (const t of UNLOCK_TRACKS) this.buyZones[t].show(this.state.current(t), false);
    r.snapTo(this.player.x, this.player.y);
    this.spawner.init();

    this.world = { butchers: this.butchers, counters: this.counters, bears: this.spawner.bears, pickups: this.pickups, now: 0 };
    this.tutorial = new Tutorial({
      state: this.state,
      player: this.player,
      butcher: this.butchers[0],
      grill: this.grills[0],
      counter: this.counters[0],
      staffZone: this.buyZones.staff,
      flags: this.flags,
      nearestBear: () => this.nearestBear(),
      nearestPickup: () => this.pickups.nearest(this.player.x, this.player.y),
      boss: () => {
        const b = this.spawner.boss;
        return b ? { x: b.x, y: b.y } : null;
      },
    });
    this.missions = new MissionTracker(data.mission, data.stage, (m) => this.onMissionDone(m));

    this.state.on('unlock', (def: UnlockDef) => this.onUnlock(def));
    this.state.on('stats', (_s: unknown, key: string | null) => {
      this.applyStats();
      if (key) this.missions.track('upgrade', 1);
    });

    // 키보드
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    // 저장
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.save();
        sound.suspend();
      } else sound.resume();
    });
    window.addEventListener('pagehide', () => this.save());

    this.offline = offlineReward(this.offlineElapsed, data.incomePerMin, this.state.hasStaff);
    this.save();
  }

  /** 타이틀 이후 시작 */
  start(): void {
    this.paused = false;
    this.state.emit('mission', null);
    this.ctx.tw.delay(0.3, () => this.state.toast(`지역 ${this.state.stage} · ${this.state.stageName}`));
    if (this.offline > 0) this.ctx.tw.delay(0.6, () => this.state.emit('offline', this.offline, this.offlineElapsed));
    if (this.state.isUnlocked('voyage')) this.ctx.tw.delay(0.8, () => this.state.emit('stageClear'));
  }

  // ───────────────────────── 월드 ─────────────────────────
  private buildWorld(): void {
    const sc = this.r.scene;
    const W = WORLD.width;
    const th = this.state.theme;
    const ground = (x0: number, y0: number, x1: number, y1: number, colors: [number, number], key: string) => {
      const t = groundTexture(colors[0], colors[1], key);
      t.repeat.set(((x1 - x0) * S) / 3, ((y1 - y0) * S) / 3);
      const m = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * S, (y1 - y0) * S), new THREE.MeshLambertMaterial({ map: t }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(((x0 + x1) / 2) * S, 0, ((y0 + y1) / 2) * S);
      m.receiveShadow = true;
      sc.add(m);
    };
    // 바깥 설원(월드 경계 너머)
    ground(-3000, -3000, W + 3000, WORLD.height + 3000, th.ground.huntB, `${th.id}_out`);
    sc.children[sc.children.length - 1].position.y = -0.01;
    ground(0, 0, W, WORLD.fenceBY, th.ground.huntB, `${th.id}_B`);
    ground(0, WORLD.fenceBY, W, WORLD.fenceAY, th.ground.hunt, `${th.id}_A`);
    ground(0, WORLD.fenceAY, W, WORLD.height, th.ground.camp, `${th.id}_camp`);

    // 울타리 + 충돌
    const gateL = WORLD.gateX - WORLD.gateWidth / 2;
    const gateR = WORLD.gateX + WORLD.gateWidth / 2;
    for (const fy of [WORLD.fenceBY, WORLD.fenceAY]) {
      for (const [x0, x1] of [
        [0, gateL],
        [gateR, W],
      ]) {
        const f = new THREE.Mesh(fenceGeometry((x1 - x0) * S), MAT.vc);
        f.position.set(x0 * S, 0, fy * S);
        f.castShadow = true;
        sc.add(f);
        this.ctx.world.add((x0 + x1) / 2, fy, x1 - x0, WORLD.fenceThickness);
      }
    }
    // 바깥 둘레 울타리(시각용)
    for (const [x, y, len, rot] of [
      [0, 0, W, 0],
      [0, 0, WORLD.height, Math.PI / 2],
      [W, 0, WORLD.height, Math.PI / 2],
    ] as [number, number, number, number][]) {
      const f = new THREE.Mesh(fenceGeometry(len * S), MAT.vc);
      f.position.set(x * S, 0, y * S);
      f.rotation.y = -rot;
      f.castShadow = true;
      sc.add(f);
    }
    // 보석 사냥터 잠긴 문 + 가림막
    const gate = new THREE.Mesh(gateLockedGeometry(WORLD.gateWidth * S), MAT.vc);
    gate.position.set(WORLD.gateX * S, 0, WORLD.fenceBY * S);
    gate.castShadow = true;
    sc.add(gate);
    this.gateB = { mesh: gate, rect: this.ctx.world.add(WORLD.gateX, WORLD.fenceBY, WORLD.gateWidth, WORLD.fenceThickness) };
    const veil = new THREE.Mesh(
      new THREE.PlaneGeometry(W * S, (WORLD.fenceBY - 20) * S),
      new THREE.MeshBasicMaterial({ color: th.veil, transparent: true, opacity: 0.38, depthWrite: false }),
    );
    veil.rotation.x = -Math.PI / 2;
    veil.position.set((W / 2) * S, 0.03, ((WORLD.fenceBY - 20) / 2) * S);
    sc.add(veil);
    this.veil = [veil];
    this.veilLabel = new Label(this.ctx.labels, 'sign big').html(`🔒 보석 사냥터<small>${th.bears.polar.name}이 보석💎을 떨어뜨려요</small>`);
    this.veilLabel.at(W / 2, WORLD.fenceBY / 2, 0.3);

    // 표지
    new Label(this.ctx.labels, 'sign').text('▲ 사냥터 A').at(WORLD.gateX, WORLD.fenceAY - 70, 0.05);
    new Label(this.ctx.labels, 'sign').text('캠프').at(WORLD.gateX, WORLD.fenceAY + 70, 0.05);
    new Label(this.ctx.labels, 'sign').text('손님 입구 ▶').at(WORLD.width - 120, WORLD.height - 50, 0.05);

    // 장식: 나무·바위(인스턴싱)
    let seed = 1234;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const trees: [number, number, number][] = [];
    const rocks: [number, number, number][] = [];
    for (let y = 100; y < WORLD.fenceAY - 40; y += 115) {
      trees.push([20 + rnd() * 25, y + rnd() * 30, 0.85 + rnd() * 0.3]);
      trees.push([W - 20 - rnd() * 25, y + rnd() * 30, 0.85 + rnd() * 0.3]);
    }
    for (const z of [HUNT_ZONES.A, HUNT_ZONES.B]) {
      for (let i = 0; i < 6; i++) rocks.push([z.x + 120 + rnd() * (z.w - 240), z.y + 80 + rnd() * (z.h - 140), 0.7 + rnd() * 0.6]);
      for (let i = 0; i < 4; i++) trees.push([z.x + 100 + rnd() * (z.w - 200), z.y + 60 + rnd() * (z.h - 120), 0.8 + rnd() * 0.3]);
    }
    for (let y = WORLD.fenceAY + 80; y < WORLD.height; y += 140) {
      trees.push([15 + rnd() * 15, y, 0.8 + rnd() * 0.2]);
      if (y < 2380) trees.push([W - 15 - rnd() * 15, y, 0.8 + rnd() * 0.2]);
    }
    // 월드 밖 숲
    for (let i = 0; i < 160; i++) {
      const side = i % 3;
      const x = side === 0 ? -100 - rnd() * 900 : side === 1 ? W + 100 + rnd() * 900 : -300 + rnd() * (W + 600);
      const y = side === 2 ? -100 - rnd() * 700 : -400 + rnd() * (WORLD.height + 800);
      trees.push([x, y, 1 + rnd() * 0.6]);
    }
    const inst = (geo: THREE.BufferGeometry, list: [number, number, number][]) => {
      const im = new THREE.InstancedMesh(geo, MAT.vc, list.length);
      const m = new THREE.Matrix4();
      list.forEach(([x, y, s], i) => {
        m.compose(new THREE.Vector3(x * S, 0, y * S), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(s, s, s));
        im.setMatrixAt(i, m);
      });
      im.castShadow = true;
      sc.add(im);
    };
    inst(treeGeometry(), trees);
    inst(rockGeometry(), rocks);
    const add = (geo: THREE.BufferGeometry, x: number, y: number, rot = 0, s = 1) => {
      const m = new THREE.Mesh(geo, MAT.vc);
      m.position.set(x * S, 0, y * S);
      m.rotation.y = rot;
      m.scale.setScalar(s);
      m.castShadow = true;
      sc.add(m);
      return m;
    };
    add(tentGeometry(), 1310, 1490, 0.3);
    add(tentGeometry(), 95, 1470, -0.3, 0.85);
    const fire = LAYOUT.campfire;
    add(campfireGeometry(), fire.x, fire.y);
    this.emitters.push(
      new Emitter3D(this.ctx.fx, fire.x * S, 0.15, fire.y * S, 30, {
        count: 1,
        color: [0xffd166, 0xff8c1a, 0xff5a1f],
        speed: [0.02, 0.15],
        up: [0.8, 1.5],
        life: [0.35, 0.65],
        size: [0.4, 0.04],
        additive: true,
        spread: 0.3,
      }),
    );
    const fireLight = new THREE.PointLight(0xff8a3d, 3, 4, 1.5);
    fireLight.position.set(fire.x * S, 0.6, fire.y * S);
    sc.add(fireLight);

    // 목표 마커
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    sc.add(this.marker);
  }

  private buildFacilities(): void {
    const hooks = {
      onInput: (s: Station, c: Carrier) => {
        if (!c.isPlayer) return;
        if (s.kind === 'butcher') this.flags.butcherIn = true;
        else this.flags.grillIn = true;
      },
    };
    LAYOUT.butchers.forEach((p) => this.butchers.push(new Station(this.ctx, 'butcher', p, 'raw', 'cut', hooks)));
    LAYOUT.grills.forEach((p) => this.grills.push(new Station(this.ctx, 'grill', p, 'cut', 'cooked', hooks)));
    this.butchers[0].unlock(false);
    this.grills[0].unlock(false);
    LAYOUT.counters.forEach((p, i) =>
      this.counters.push(
        new Counter(this.ctx, i, p, {
          onSale: (_c, count, amount) => {
            this.state.recordSale(count, amount);
            this.flags.sold = true;
            this.missions.track('sell', count);
          },
          onStock: (_c, c) => {
            if (c.isPlayer) this.flags.counterIn = true;
          },
        }),
      ),
    );
    this.counters[0].unlock(false);
    for (const s of [...this.butchers, ...this.grills]) this.transfer.add(...s.targets());
    for (const c of this.counters) this.transfer.add(c.target());

    // 레일
    this.rails.rail1 = new Rail(this.ctx, 'cut', RAIL.lane1, () => this.butchers, () => this.grills);
    this.rails.rail2 = new Rail(this.ctx, 'cooked', RAIL.lane2, () => this.grills, () => this.counters);

    const sc = this.r.scene;
    // 대장간
    const f = LAYOUT.forge;
    this.forgeObj = new THREE.Group();
    const fm = new THREE.Mesh(forgeGeometry(), MAT.vc);
    fm.castShadow = true;
    this.forgeObj.add(fm, forgeFire());
    this.forgeObj.position.set(f.x * S, 0, f.y * S);
    this.forgeObj.traverse((o) => {
      if (o instanceof THREE.Mesh) o.userData.mat = o.material;
    });
    this.setGhost(this.forgeObj, true);
    sc.add(this.forgeObj);
    const fz = LAYOUT.forgeZone;
    this.forgeZone = new Zone(this.ctx, { x: fz.x, y: fz.y }, fz.w, fz.h, '#ff9f1c', 'up');
    this.forgeZone.setVisible(false);
    new Label(this.ctx.labels, 'sign tag').text('🔨 대장간').at(f.x, f.y, 2.1);

    // 고용 게시판
    const hb = LAYOUT.hireBoard;
    const board = new THREE.Mesh(hireBoardGeometry(), MAT.vc);
    board.position.set(hb.x * S, 0, hb.y * S);
    board.castShadow = true;
    sc.add(board);
    this.ctx.world.add(hb.x, hb.y, 100, 24);
    new Label(this.ctx.labels, 'sign tag').text('👷 직원 고용').at(hb.x, hb.y, 1.6);

    // 다음 지역 썰매
    const v = LAYOUT.voyage;
    this.sled = new THREE.Mesh(sledGeometry(), MAT.vc);
    this.sled.position.set(v.x * S, 0, (v.y - 90) * S);
    this.sled.castShadow = true;
    this.sledGhost = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false });
    this.sled.material = this.sledGhost;
    sc.add(this.sled);
    new Label(this.ctx.labels, 'sign tag').text('🛷 다음 지역').at(v.x, v.y - 90, 1.0);
  }

  private setGhost(o: THREE.Object3D, on: boolean): void {
    const ghost = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false });
    o.traverse((c) => {
      if (c instanceof THREE.Mesh) c.material = on ? ghost : c.userData.mat;
    });
  }

  // ───────────────────────── 해금 ─────────────────────────
  private applyUnlock(id: UnlockId, animate: boolean): Point {
    const hire = LAYOUT.hireZone;
    const start = (fallback: Point) => (animate ? hire : fallback);
    switch (id) {
      case 'grill2':
        this.grills[1].unlock(animate);
        return this.grills[1].pos;
      case 'grill3':
        this.grills[2].unlock(animate);
        return this.grills[2].pos;
      case 'butcher2':
        this.butchers[1].unlock(animate);
        return this.butchers[1].pos;
      case 'forge':
        this.forgeUnlocked = true;
        this.setGhost(this.forgeObj, false);
        this.forgeZone.setVisible(true);
        this.ctx.world.add(LAYOUT.forge.x - 25, LAYOUT.forge.y, 140, 90);
        if (animate) this.ctx.tw.add(0.55, (k) => this.forgeObj.scale.setScalar(Math.max(0.001, k)), Ease.outBack);
        return LAYOUT.forge;
      case 'cashier':
        this.hireCashier(0, start(this.counters[0].cashierZone.center));
        if (this.counters[1].unlocked) this.hireCashier(1, start(this.counters[1].cashierZone.center));
        return hire;
      case 'counter2':
        this.counters[1].unlock(animate);
        if (this.state.isUnlocked('cashier')) this.hireCashier(1, animate ? hire : this.counters[1].cashierZone.center);
        return this.counters[1].pos;
      case 'rail1':
      case 'rail2':
        this.rails[id]!.unlock(animate);
        return { x: WORLD.gateX, y: id === 'rail1' ? RAIL.lane1 : RAIL.lane2 };
      case 'hunter1':
      case 'hunter2': {
        const p = start({ x: WORLD.gateX + (id === 'hunter2' ? 120 : 0), y: WORLD.fenceAY - 160 });
        const h = new HunterWorker(this.ctx, p.x, p.y);
        const s = this.state.stats;
        h.axes.configure(s.axeCount, s.axeRadius, s.axeSpeed, s.axeDamage * WORKERS.hunterAxeFactor);
        this.workers.push(h);
        return hire;
      }
      case 'huntB':
        if (this.gateB) {
          this.r.scene.remove(this.gateB.mesh);
          this.ctx.world.remove(this.gateB.rect);
          this.gateB = null;
        }
        for (const o of this.veil) this.r.scene.remove(o);
        this.veil = [];
        this.veilLabel.show(false);
        if (animate) this.spawner.openB(false);
        else this.spawner.huntBOpen = true;
        return { x: WORLD.gateX, y: WORLD.fenceBY };
      case 'voyage':
        if (animate) this.ctx.tw.delay(1.1, () => this.state.emit('stageClear'));
        return LAYOUT.voyage;
    }
  }

  private hireCashier(counterIndex: number, at: Point): void {
    if (this.workers.some((w) => w instanceof CashierWorker && w.counterIndex === counterIndex)) return;
    this.workers.push(new CashierWorker(this.ctx, counterIndex, at.x, at.y));
  }

  private onUnlock(def: UnlockDef): void {
    this.buyZones[def.track].show(null, false);
    const at = this.applyUnlock(def.id, true);
    sound.unlockFanfare();
    this.confetti(at.x, at.y);
    this.r.zoomPulse(FX.unlockZoom);
    if (def.track !== 'stage') this.state.toast(`${def.label} 해금!`);
    this.pushPlayerOut();
    this.ctx.tw.delay(0.7, () => {
      for (const t of UNLOCK_TRACKS) {
        const next = this.state.current(t);
        if (this.buyZones[t].def !== next) this.buyZones[t].show(next, true);
      }
    });
    this.save();
  }

  private confetti(x: number, y: number, n = 70): void {
    this.ctx.fx.burst(x * S, 0.8, y * S, {
      count: n,
      color: [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2, 0xffffff],
      speed: [1.2, 3.2],
      up: [3, 6],
      gravity: 9,
      life: [0.9, 1.5],
      size: [0.16, 0.1],
    });
  }

  private pushPlayerOut(): void {
    if (this.ctx.world.overlaps(this.player.x, this.player.y, PLAYER.bodyRadius)) {
      const p = this.ctx.world.resolve(this.player.x, this.player.y, PLAYER.bodyRadius);
      this.player.teleport(p.x, p.y);
    }
  }

  private applyStats(): void {
    const s = this.state.stats;
    this.player.stack.capacity = s.carryCapacity;
    this.player.magnetRadius = PLAYER.magnetRadius * this.state.magnetMult;
    this.axes.configure(s.axeCount, s.axeRadius, s.axeSpeed, s.axeDamage);
    for (const w of this.workers)
      if (w instanceof HunterWorker) w.axes.configure(s.axeCount, s.axeRadius, s.axeSpeed, s.axeDamage * WORKERS.hunterAxeFactor);
  }

  // ───────────────────────── 전투 ─────────────────────────
  private nearestBear(): Point | null {
    let best: Bear | null = null;
    let bd = Infinity;
    for (const b of this.spawner.bears) {
      if (!b.alive || b.zone !== HUNT_ZONES.A) continue;
      const d = dist2(b.x, b.y, this.player.x, this.player.y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  private onHit(bear: Bear, dmg: number, fx: number, fy: number, byPlayer: boolean): void {
    const killed = bear.damage(dmg, fx, fy);
    const v = this.r.toScreen(bear.x, bear.y, 0.5);
    if (v.onScreen) {
      sound.hit();
      this.ctx.labels.float(bear.x + (Math.random() - 0.5) * 30, bear.y, 1.1 * (bear.isBoss ? 2 : 1), `${Math.round(dmg)}`, 'dmg');
      this.ctx.fx.burst(bear.x * S, 0.5, bear.y * S, { count: 4, color: 0xffffff, speed: [1, 2.5], up: [1, 2], gravity: 6, life: [0.2, 0.35], size: [0.12, 0.02] });
    }
    if (!killed) return;
    this.state.data.lifetime.kills++;
    this.missions.track('kill', 1);
    let bonus = 0;
    if (byPlayer) {
      this.combo = this.now - this.lastKillAt <= COMBO.window ? this.combo + 1 : 1;
      this.lastKillAt = this.now;
      bonus = Math.min(COMBO.maxBonus, Math.floor(this.combo / COMBO.bonusEvery));
      if (this.combo >= 2) this.state.emit('combo', this.combo, bonus);
      this.missions.track('combo', this.combo);
    }
    if (bear.def.drop + (bear.def.drop > 0 ? bonus : 0) > 0) this.pickups.spawnBurst('raw', bear.x, bear.y, bear.def.drop + (bear.def.drop > 0 ? bonus : 0), bear.zone);
    if (bear.def.gems > 0) this.pickups.spawnBurst('gem', bear.x, bear.y, bear.def.gems, bear.zone);
    this.ctx.fx.burst(bear.x * S, 0.4, bear.y * S, { count: 14, color: 0xffffff, speed: [0.8, 2], up: [0.5, 1.5], life: [0.4, 0.6], size: [0.35, 0.05], alpha: 0.9 });
    this.ctx.fx.burst(bear.x * S, 0.6, bear.y * S, {
      count: 10 + Math.min(this.combo, 20),
      color: [0xffd166, 0xffffff, 0xff8c42],
      speed: [2, 4.5],
      up: [1, 3],
      gravity: 5,
      life: [0.3, 0.45],
      size: [0.18, 0.02],
      additive: true,
    });
    if (v.onScreen) sound.kill(byPlayer ? this.combo : 1);
    if (byPlayer) {
      this.flags.bearKilled = true;
      this.r.shake(FX.killShake.duration, FX.killShake.intensity);
    }
    if (bear.isBoss) this.onBossKilled(bear);
  }

  private onBossSpawn(): void {
    sound.angry();
    this.state.toast(`⚠ ${this.state.theme.bears.boss.name} 출현! 잡으면 고기 대량`);
    this.state.emit('boss', this.spawner.boss);
  }

  private onBossKilled(bear: Bear): void {
    this.state.data.lifetime.bosses++;
    this.missions.track('boss', 1);
    this.r.shake(280, 0.012);
    this.confetti(bear.x, bear.y, 50);
    sound.unlockFanfare();
    this.state.toast(`${this.state.theme.bears.boss.name} 처치!`);
    this.state.emit('boss', null);
  }

  private onMissionDone(m: Mission): void {
    this.state.addCoins(m.reward);
    sound.unlockFanfare();
    this.state.toast(`미션 완료! +${formatNum(m.reward)} 코인`);
    this.state.emit('mission', m);
    this.save();
  }

  // ───────────────────────── 루프 ─────────────────────────
  update(dt: number): void {
    const tw = this.ctx.tw;
    tw.update(dt);
    if (this.paused) {
      this.r.update(dt, this.player.x, this.player.y, { w: WORLD.width, h: WORLD.height });
      this.render(dt);
      return;
    }
    this.now += dt;
    this.world.now = this.transfer.now;
    const s = this.state.stats;

    let ix = 0;
    let iy = 0;
    const k = this.keys;
    if (k.has('arrowleft') || k.has('a')) ix -= 1;
    if (k.has('arrowright') || k.has('d')) ix += 1;
    if (k.has('arrowup') || k.has('w')) iy -= 1;
    if (k.has('arrowdown') || k.has('s')) iy += 1;
    if (ix === 0 && iy === 0 && inputState.joyActive) {
      ix = inputState.joyX;
      iy = inputState.joyY;
    }
    this.player.update(dt, ix, iy, s.moveSpeed);

    const bears = this.spawner.bears;
    this.axes.setVisible(!this.player.inCamp);
    this.axes.update(dt, bears, this.now, (b, dmg, fx, fy) => this.onHit(b, dmg, fx, fy, true), () => {
      if (this.nearestBearDist() < 260) sound.swing();
    });
    for (const b of bears) b.pushFrom(this.player.x, this.player.y, PLAYER.bodyRadius + b.radius);
    this.spawner.update(dt);

    for (const w of this.workers) {
      w.update(dt, this.world);
      if (w instanceof HunterWorker) w.axes.update(dt, bears, this.now, (b, dmg, fx, fy) => this.onHit(b, dmg, fx, fy, false));
    }

    const collectors: Collector[] = [this.player];
    const carriers: Carrier[] = [this.player];
    for (const w of this.workers) {
      if (w instanceof HunterWorker) {
        collectors.push(w);
        carriers.push(w);
      }
    }
    this.pickups.update(dt, collectors, {
      x: this.player.x,
      y: this.player.y,
      magnetRadius: this.player.magnetRadius,
      onGem: (gx, gy) => {
        this.ctx.fly.fly('gem', { x: gx * S, y: 0.15, z: gy * S }, () => ({ x: this.player.x * S, y: 1.1, z: this.player.y * S }), {
          dur: 0.35,
          h: 0.9,
          onArrive: () => this.state.addGems(1),
        });
        sound.coin();
      },
    });
    this.transfer.update(dt, carriers);

    for (const b of this.butchers) b.update(dt, s.butcherTime);
    for (const g of this.grills) g.update(dt, s.grillTime);
    for (const r of Object.values(this.rails)) r!.update(dt);
    const cashiers = this.workers.filter((w): w is CashierWorker => w instanceof CashierWorker);
    for (const c of this.counters) {
      const present = c.cashierZone.contains(this.player.x, this.player.y) || cashiers.some((w) => w.counterIndex === c.index && w.isAtPost(this.world));
      c.update(dt, present, this.state.meatPrice);
    }
    this.customers.update(dt);
    this.collectPiles(dt);
    for (const t of UNLOCK_TRACKS) this.buyZones[t].update(dt, this.player.x, this.player.y);
    this.updateForge();
    this.updateSled();
    this.highlightZones();
    this.wrongTypeHint(dt);
    for (const e of this.emitters) e.update(dt);

    this.state.income.tick(dt);
    this.tutorial.update();

    this.saveTimer += dt;
    if (this.saveTimer >= SAVE.autosaveInterval) {
      this.saveTimer = 0;
      this.save();
    }
    this.r.update(dt, this.player.x, this.player.y, { w: WORLD.width, h: WORLD.height });
    this.render(dt);
  }

  private render(dt: number): void {
    const b = this.ctx.batch;
    b.begin();
    this.player.draw();
    for (const w of this.workers) w.draw();
    for (const s of this.butchers) s.draw();
    for (const s of this.grills) s.draw();
    for (const c of this.counters) c.draw();
    for (const r of Object.values(this.rails)) r!.draw(b);
    this.customers.draw();
    this.pickups.draw(b);
    this.ctx.fly.update(dt, b);
    b.end();
    // 목표 마커
    const t = this.paused ? null : this.tutorial.objective;
    this.marker.visible = !!t;
    if (t) {
      this.marker.position.set(t.x * S, 1.6 + Math.abs(Math.sin(this.now * 4)) * 0.3, t.y * S);
      this.marker.rotation.y += dt * 3;
    }
    this.ctx.fx.update(dt, this.r.camera.position.x, this.r.camera.position.z - 6);
    this.ctx.labels.update(dt, this.r);
    this.r.render();
  }

  private nearestBearDist(): number {
    let bd = Infinity;
    for (const b of this.spawner.bears) if (b.alive) bd = Math.min(bd, dist2(b.x, b.y, this.player.x, this.player.y));
    return Math.sqrt(bd);
  }

  private collectPiles(dt: number): void {
    this.pileTimer += dt;
    if (this.pileTimer < COUNTER.pileCollectInterval) return;
    this.pileTimer = 0;
    const r2 = COUNTER.pileRadius * COUNTER.pileRadius * this.state.magnetMult;
    for (const c of this.counters) {
      const pile = c.pile;
      if (pile.value <= 0 || dist2(this.player.x, this.player.y, pile.pos.x, pile.pos.y) > r2) continue;
      const got = pile.take(Math.max(1, Math.ceil(pile.value / COUNTER.pileChunkDivisor)));
      if (got <= 0) continue;
      const from = pile.topPoint();
      this.ctx.fly.fly('coin', from, () => ({ x: this.player.x * S, y: 1.1, z: this.player.y * S }), { dur: 0.3, h: 0.6, s1: 0.7 });
      this.state.addCoins(got);
      this.missions.track('earn', got);
      sound.coin();
      this.flags.coinsCollected = true;
    }
  }

  private updateForge(): void {
    const inside = this.forgeUnlocked && this.forgeZone.contains(this.player.x, this.player.y);
    this.forgeZone.setActive(inside);
    if (inside !== this.forgeOpen) {
      this.forgeOpen = inside;
      this.state.emit('forge', inside);
      this.r.followOffsetY = inside ? -260 : 0;
    }
  }

  private updateSled(): void {
    const ready = !!this.state.current('stage');
    const want = ready ? MAT.vc : this.sledGhost;
    if (this.sled.material !== want) this.sled.material = want;
    this.sled.position.y = ready ? Math.abs(Math.sin(this.now * 3)) * 0.12 : 0;
  }

  private highlightZones(): void {
    const t = this.transfer.zoneAt(this.player.x, this.player.y);
    let z: Zone | null = t ? t.zone : null;
    if (!z) for (const c of this.counters) if (c.unlocked && c.cashierZone.contains(this.player.x, this.player.y)) z = c.cashierZone;
    if (z !== this.lastZone) {
      this.lastZone?.setActive(false);
      z?.setActive(true);
      this.lastZone = z;
    }
  }

  private wrongTypeHint(dt: number): void {
    this.hintTimer -= dt;
    if (this.hintTimer > 0) return;
    const st = this.player.stack;
    if (st.empty) return;
    for (const s of [...this.butchers, ...this.grills]) {
      if (!s.unlocked || s.output <= 0 || st.type === s.outputType) continue;
      if (s.outputZone.contains(this.player.x, this.player.y)) {
        this.state.toast('한 번에 한 종류만 들 수 있어요!');
        sound.deny();
        this.hintTimer = 3;
        return;
      }
    }
  }

  // ───────────────────────── 저장 ─────────────────────────
  buildSave(): SaveData {
    const d = this.state.data;
    d.lastSeen = Date.now();
    d.incomePerMin = this.state.income.perMin;
    d.butchers = this.butchers.map((s) => ({ input: s.input + s.reservedIn, output: s.output }));
    d.grills = this.grills.map((s) => ({ input: s.input + s.reservedIn, output: s.output }));
    d.displays = this.counters.map((c) => c.display + c.reservedIn);
    d.piles = this.counters.map((c) => Math.floor(c.pile.value));
    d.carry = { type: this.player.stack.type, count: this.player.stack.count };
    d.mission = this.missions.save;
    d.sound = sound.enabled;
    return d;
  }

  save(): void {
    if (this.saveDisabled) return;
    writeSave(this.storage, this.buildSave());
  }

  /** 다음 지역: 새 세이브를 쓰고 페이지를 다시 시작(가장 깔끔한 초기화) */
  startNextStage(): void {
    if (this.saveDisabled) return;
    const next = this.state.nextStageSave();
    this.saveDisabled = true;
    writeSave(this.storage, next);
    document.body.classList.add('fade-out');
    setTimeout(() => window.location.reload(), 450);
  }

  /** 캐릭터 꾸미기 저장: face 는 undefined=유지, null=삭제, string=새 사진 */
  applyAvatar(av: Avatar, face: string | null | undefined): void {
    if (face !== undefined) {
      this.faceTex?.dispose();
      this.faceTex = face ? faceTexture(face) : null;
      if (face) {
        if (!saveFace(face)) this.state.toast('사진이 너무 커서 저장하지 못했어요');
      } else clearFace();
    }
    this.state.data.avatar = { ...av, photo: av.photo && !!this.faceTex, created: true };
    this.player.setAvatar(this.state.data.avatar, this.faceTex);
    this.state.emit('avatar', this.state.data.avatar);
    this.save();
  }

  get faceUrl(): string | null {
    return loadFace();
  }

  resetProgress(): void {
    this.saveDisabled = true;
    clearSave(this.storage);
    clearFace();
    window.location.reload();
  }

  debugCoins(n: number): void {
    this.state.addCoins(n);
  }

  get debugInfo(): string {
    return `bears ${this.spawner.bears.length} · floor ${this.pickups.count} · fly ${this.ctx.fly.count} · cust ${this.customers.activeCount} · draw ${this.r.gl.info.render.calls}`;
  }
}
