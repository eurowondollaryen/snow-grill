/**
 * 능력치 업그레이드 테이블 (GAME_SPEC 3.8 / 5.4).
 * Phaser 의존성 없음 — Vitest에서 그대로 테스트한다.
 */
import { AXE, COUNTER, PLAYER, STATION } from './balance';

export type UpgradeKey =
  | 'damage'
  | 'axeCount'
  | 'axeSpeed'
  | 'carry'
  | 'moveSpeed'
  | 'butcherSpeed'
  | 'grillSpeed'
  | 'price';

export interface UpgradeDef {
  key: UpgradeKey;
  label: string;
  maxLevel: number;
  baseCost: number;
  /** 지정 시 공식 대신 이 표를 사용 (index = 현재 레벨 - 1) */
  fixedCosts?: number[];
}

export const COST_GROWTH = 1.3;

export const UPGRADES: UpgradeDef[] = [
  { key: 'damage', label: '도끼 공격력', maxLevel: 20, baseCost: 15 },
  { key: 'axeCount', label: '도끼 개수', maxLevel: 4, baseCost: 120, fixedCosts: [120, 500, 1500] },
  { key: 'axeSpeed', label: '도끼 회전 속도', maxLevel: 10, baseCost: 25 },
  { key: 'carry', label: '운반량', maxLevel: 15, baseCost: 20 },
  { key: 'moveSpeed', label: '이동 속도', maxLevel: 10, baseCost: 20 },
  { key: 'butcherSpeed', label: '정육 속도', maxLevel: 10, baseCost: 30 },
  { key: 'grillSpeed', label: '굽기 속도', maxLevel: 10, baseCost: 30 },
  { key: 'price', label: '고기 가격', maxLevel: 15, baseCost: 40 },
];

export const UPGRADE_KEYS: UpgradeKey[] = UPGRADES.map((u) => u.key);

export type UpgradeLevels = Record<UpgradeKey, number>;

export function defaultLevels(): UpgradeLevels {
  const out = {} as UpgradeLevels;
  for (const k of UPGRADE_KEYS) out[k] = 1;
  return out;
}

export function getUpgradeDef(key: UpgradeKey): UpgradeDef {
  const def = UPGRADES.find((u) => u.key === key);
  if (!def) throw new Error(`unknown upgrade: ${key}`);
  return def;
}

/**
 * 현재 레벨에서 다음 레벨로 올리는 비용.
 * cost(level) = round(baseCost × COST_GROWTH^(level-1)), 최대 레벨이면 null.
 */
export function upgradeCost(def: UpgradeDef, level: number): number | null {
  if (level >= def.maxLevel) return null;
  if (def.fixedCosts) {
    const c = def.fixedCosts[level - 1];
    return c === undefined ? null : c;
  }
  return Math.round(def.baseCost * Math.pow(COST_GROWTH, level - 1));
}

export interface Stats {
  moveSpeed: number;
  carryCapacity: number;
  axeDamage: number;
  axeCount: number;
  axeRadius: number;
  axeSpeed: number;
  butcherTime: number;
  grillTime: number;
  meatPrice: number;
}

export function processTime(base: number, level: number): number {
  return Math.max(STATION.minProcessTime, base * Math.pow(1 - STATION.speedReductionPerLevel, level - 1));
}

export function meatPriceFor(level: number): number {
  return COUNTER.basePrice + COUNTER.pricePerLevel * (level - 1);
}

export function getStats(lv: UpgradeLevels): Stats {
  const axeCount = Math.max(1, Math.min(4, lv.axeCount));
  return {
    moveSpeed: PLAYER.moveSpeed * Math.pow(1 + PLAYER.moveSpeedPerLevel, lv.moveSpeed - 1),
    carryCapacity: PLAYER.carryCapacity + PLAYER.carryPerLevel * (lv.carry - 1),
    axeDamage: AXE.damage * Math.pow(AXE.damageMult, lv.damage - 1),
    axeCount,
    axeRadius: AXE.radius + AXE.radiusPerExtra * (axeCount - 1),
    axeSpeed: AXE.speed + AXE.speedPerLevel * (lv.axeSpeed - 1),
    butcherTime: processTime(STATION.butcherTime, lv.butcherSpeed),
    grillTime: processTime(STATION.grillTime, lv.grillSpeed),
    meatPrice: meatPriceFor(lv.price),
  };
}

/** UI용: 해당 업그레이드의 현재 값 문자열 (priceMult: 지역·★ 판매 배율) */
export function describeStat(key: UpgradeKey, s: Stats, priceMult = 1): string {
  switch (key) {
    case 'damage':
      return `${Math.round(s.axeDamage)}`;
    case 'axeCount':
      return `${s.axeCount}자루`;
    case 'axeSpeed':
      return `${s.axeSpeed.toFixed(2)}회/초`;
    case 'carry':
      return `${s.carryCapacity}개`;
    case 'moveSpeed':
      return `${Math.round(s.moveSpeed)}`;
    case 'butcherSpeed':
      return `${s.butcherTime.toFixed(2)}초`;
    case 'grillSpeed':
      return `${s.grillTime.toFixed(2)}초`;
    case 'price':
      return `${Math.round(s.meatPrice * priceMult).toLocaleString('ko-KR')}코인`;
  }
}
