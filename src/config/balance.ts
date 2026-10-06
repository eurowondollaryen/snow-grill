/**
 * 모든 밸런스 수치와 레이아웃 좌표.
 * 게임 코드에서는 숫자를 하드코딩하지 않고 이 파일에서 가져온다. (GAME_SPEC 1.2 / 5장)
 */

export type ItemType = 'raw' | 'cut' | 'cooked';
export type BearKind = 'baby' | 'brown' | 'polar' | 'boss';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

// ───────────────────────── 화면 / 월드 ─────────────────────────
export const GAME = {
  width: 720,
  height: 1280,
  maxDt: 0.1, // 탭 복귀 등으로 프레임이 튀어도 이 이상은 진행하지 않음
};

export const WORLD = {
  width: 1440,
  height: 2560,
  campTop: 1400, // 이 y 아래가 캠프(도끼 숨김)
  fenceBY: 700, // 사냥터 B / A 경계
  fenceAY: 1400, // 사냥터 A / 캠프 경계
  fenceThickness: 26,
  gateX: 720,
  gateWidth: 200,
};

export const HUNT_ZONES: Record<'A' | 'B', Rect> = {
  B: { x: 60, y: 60, w: 1320, h: 600 },
  A: { x: 60, y: 750, w: 1320, h: 610 },
};

// ───────────────────────── 플레이어 / 도끼 (5.1) ─────────────────────────
export const PLAYER = {
  start: { x: 540, y: 1490 } as Point,
  bodyRadius: 18,
  moveSpeed: 260,
  moveSpeedPerLevel: 0.06, // +6%/lv (복리)
  carryCapacity: 12,
  carryPerLevel: 3,
  magnetRadius: 130,
  stackSpacing: 7,
};

export const AXE = {
  damage: 16,
  damageMult: 1.2,
  count: 1,
  radius: 80,
  radiusPerExtra: 8,
  speed: 1.4, // 회전/초
  speedPerLevel: 0.15,
  hitCooldown: 0.25,
  hitRadius: 26,
  knockback: 14,
};

// ───────────────────────── 곰 (3.3) ─────────────────────────
export interface BearDef {
  hp: number;
  speed: number;
  drop: number;
  /** 보석 드롭(사냥터 B 전용 재화) */
  gems: number;
  radius: number;
  fleeOnHit: boolean;
  scale: number;
}

export const BEARS: Record<BearKind, BearDef> = {
  baby: { hp: 30, speed: 38, drop: 2, gems: 0, radius: 22, fleeOnHit: false, scale: 0.75 },
  brown: { hp: 80, speed: 52, drop: 5, gems: 0, radius: 30, fleeOnHit: true, scale: 1.0 },
  polar: { hp: 220, speed: 44, drop: 0, gems: 3, radius: 40, fleeOnHit: false, scale: 1.3 },
  boss: { hp: 650, speed: 30, drop: 36, gems: 3, radius: 62, fleeOnHit: false, scale: 2 },
};

/** 보스 곰: 사냥터 A에 주기적으로 등장 */
export const BOSS = {
  firstDelay: 40,
  interval: 75,
};

export const BEAR_AI = {
  fleeSpeed: 170,
  fleeTime: 0.8,
  idleMin: 0.6,
  idleMax: 2.2,
  wanderDistMin: 80,
  wanderDistMax: 260,
  knockbackDecay: 10,
};

export const SPAWN = {
  respawnInterval: 0.9,
  packSize: 3, // 한 번에 무리 지어 등장
  packSpread: 70,
  maxA: 26,
  maxB: 14,
  initialA: 24,
  initialB: 12,
  brownChance: 0.35,
  offscreenTries: 12,
};

// ───────────────────────── 줍기 (3.4) ─────────────────────────
export const PICKUP = {
  despawnTime: 60,
  blinkBefore: 5,
  maxFloor: 180,
  scatterMin: 30,
  scatterMax: 80,
  dropDuration: 0.45,
  flyDuration: 0.32,
};

// ───────────────────────── 가공 시설 (3.5 / 5.2) ─────────────────────────
export const STATION = {
  inputMax: 40,
  outputMax: 40,
  transferInterval: 0.05,
  butcherTime: 0.35,
  grillTime: 0.5,
  speedReductionPerLevel: 0.07, // −7%/lv (복리)
  minProcessTime: 0.15,
  bodyW: 150,
  bodyH: 96,
  zoneW: 84,
  zoneH: 110,
  zoneGap: 112, // 시설 중심 ~ 존 중심 x 거리
};

// ───────────────────────── 판매 / 손님 (3.6 / 5.2) ─────────────────────────
export const COUNTER = {
  counterMax: 40,
  basePrice: 8,
  pricePerLevel: 2,
  serveInterval: 0.1,
  bodyW: 190,
  bodyH: 84,
  zoneGap: 145,
  pileOffset: { x: 145, y: 118 } as Point,
  pileRadius: 95,
  pileCollectInterval: 0.035,
  pileChunkDivisor: 12,
};

export const CUSTOMERS = {
  interval: 1.4,
  intervalWithCounter2: 0.9,
  queueMax: 6,
  patience: 30,
  minWant: 2,
  maxWant: 5,
  speed: 190,
  queueStartY: 100, // 판매대 중심에서 첫 슬롯까지
  queueSpacing: 62,
  entrance: { x: 1400, y: 2600 } as Point,
};

// ───────────────────────── 구매 존 (3.7) ─────────────────────────
export const BUYZONE = {
  baseDuration: 1.0, // 1초 안에 빨려 들어감
  minDuration: 1,
  maxDuration: 3,
  w: 150,
  h: 116,
  coinFxInterval: 0.045,
};

// ───────────────────────── 직원 (3.9) ─────────────────────────
export const WORKERS = {
  hunterCapacity: 12,
  hunterSpeed: 220,
  hunterAxeFactor: 0.6,
  hunterMagnet: 100,
  cashierSpeed: 160,
  linger: 0.6, // 마지막 주고받기 이후 존에 머무는 시간
  thinkInterval: 0.5,
};

// ───────────────────────── 레일(컨베이어) ─────────────────────────
export const RAIL = {
  interval: 0.12, // 이 간격마다 1개씩 실어 보냄
  speed: 360, // px/s
  maxOnBelt: 24,
  lane1: 1725, // 정육대 → 그릴
  lane2: 1990, // 그릴 → 판매대
  x0: 150,
  x1: 1120,
};

// ───────────────────────── 보석 ─────────────────────────
export const GEM = {
  magnetBonus: 1.4, // 보석은 자석 범위가 더 넓음
};

// ───────────────────────── 레이아웃 (2장) ─────────────────────────
export const LAYOUT = {
  butchers: [
    { x: 300, y: 1590 },
    { x: 640, y: 1590 },
  ] as Point[],
  grills: [
    { x: 300, y: 1860 },
    { x: 640, y: 1860 },
    { x: 980, y: 1860 },
  ] as Point[],
  counters: [
    { x: 420, y: 2080 },
    { x: 900, y: 2080 },
  ] as Point[],
  forge: { x: 1200, y: 1560 } as Point,
  voyage: { x: 720, y: 2430 } as Point,
  rail1Zone: { x: 1240, y: 1820 } as Point,
  rail2Zone: { x: 1240, y: 2080 } as Point,
  forgeZone: { x: 1200, y: 1690, w: 150, h: 96 } as Rect,
  hireBoard: { x: 150, y: 2330 } as Point,
  hireZone: { x: 150, y: 2440 } as Point,
  huntBZone: { x: 720, y: 800 } as Point,
  campfire: { x: 1210, y: 2330 } as Point,
  // 운반 경로용 가로 통로(시설 사이 빈 공간)
  lanes: [1470, 1725, 1990, 2230],
};

// ───────────────────────── 해금 (5.3) ─────────────────────────
// 시설 / 직원 두 갈래가 동시에 열린다. 각 갈래 안에서는 순서대로 해금.
export type UnlockTrack = 'facility' | 'staff' | 'stage';

export type UnlockId =
  | 'grill2'
  | 'butcher2'
  | 'forge'
  | 'cashier'
  | 'rail1'
  | 'counter2'
  | 'huntB'
  | 'hunter1'
  | 'rail2'
  | 'hunter2'
  | 'grill3'
  | 'voyage';

export interface UnlockDef {
  id: UnlockId;
  track: UnlockTrack;
  label: string;
  price: number;
  pos: Point;
}

export const UNLOCKS: UnlockDef[] = [
  // 시설
  { id: 'grill2', track: 'facility', label: '그릴 2', price: 40, pos: LAYOUT.grills[1] },
  { id: 'forge', track: 'facility', label: '대장간', price: 100, pos: LAYOUT.forge },
  { id: 'huntB', track: 'facility', label: '보석 사냥터', price: 200, pos: LAYOUT.huntBZone },
  { id: 'butcher2', track: 'facility', label: '정육대 2', price: 260, pos: LAYOUT.butchers[1] },
  { id: 'counter2', track: 'facility', label: '판매대 2', price: 450, pos: LAYOUT.counters[1] },
  { id: 'grill3', track: 'facility', label: '그릴 3', price: 1800, pos: LAYOUT.grills[2] },
  // 직원
  { id: 'cashier', track: 'staff', label: '계산원 고용', price: 25, pos: LAYOUT.hireZone },
  { id: 'rail1', track: 'staff', label: '레일: 정육대→그릴', price: 80, pos: LAYOUT.rail1Zone },
  { id: 'hunter1', track: 'staff', label: '사냥꾼 고용', price: 250, pos: LAYOUT.hireZone },
  { id: 'rail2', track: 'staff', label: '레일: 그릴→판매대', price: 450, pos: LAYOUT.rail2Zone },
  { id: 'hunter2', track: 'staff', label: '사냥꾼 2 고용', price: 1200, pos: LAYOUT.hireZone },
  // 시설·직원을 모두 해금하면 열리는 다음 지역 썰매
  { id: 'voyage', track: 'stage', label: '다음 지역으로!', price: 2500, pos: LAYOUT.voyage },
];

export const UNLOCK_TRACKS: UnlockTrack[] = ['facility', 'staff', 'stage'];

export function trackUnlocks(track: UnlockTrack): UnlockDef[] {
  return UNLOCKS.filter((u) => u.track === track);
}

/** v1.0 저장 데이터(단일 순서) 마이그레이션용 */
export const LEGACY_UNLOCK_ORDER: UnlockId[] = ['grill2', 'butcher2', 'forge', 'cashier', 'rail1', 'counter2', 'huntB', 'hunter1', 'rail2', 'grill3'];
/** 구버전 id → 신버전 id (운반꾼 → 레일) */
export const LEGACY_ID_MAP: Record<string, UnlockId> = { carrier1: 'rail1', carrier2: 'rail2' };

// ───────────────────────── 저장 / 오프라인 (3.12) ─────────────────────────
export const SAVE = {
  key: 'snowgrill.save.v1',
  version: 1,
  autosaveInterval: 5,
};

export const OFFLINE = {
  factor: 0.3,
  maxMinutes: 120,
  minMinutes: 1,
};

export const INCOME = {
  bucketSeconds: 30,
  smoothing: 0.35,
};

// ───────────────────────── 연출 ─────────────────────────
/** 끝없는 미션: 목표·보상은 지역 배율이 곱해진다 */
export const MISSION = {
  cycle: ['kill', 'sell', 'combo', 'earn', 'kill', 'boss', 'sell', 'upgrade'] as const,
  kill: { base: 20, perRound: 15, reward: 8 },
  sell: { base: 30, perRound: 25, reward: 6 },
  combo: { base: 5, perRound: 3, max: 40, reward: 25 },
  earn: { base: 300, growth: 1.6, rewardRatio: 0.4 },
  boss: { reward: 350 },
  upgrade: { base: 3, perRound: 2, reward: 60 },
};

export const COMBO = {
  window: 1.8, // 이 시간 안에 다음 처치 시 콤보 유지
  bonusEvery: 5, // 콤보 5마다 처치당 보너스 고기 +1
  maxBonus: 3,
};

export const FX = {
  hitFlash: 0.07,
  killShake: { duration: 110, intensity: 0.006 },
  unlockZoom: 1.08,
  damageTextPool: 24,
};
