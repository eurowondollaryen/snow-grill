/**
 * 보석 상점: 사냥터 B(보석 사냥터)에서 모은 보석으로 사는 **영구** 강화.
 * 지역을 넘어가도 유지된다. Phaser/Three 의존성 없음.
 */
import type { Stats } from './upgrades';
import { stageMult } from './stages';

export type PerkKey = 'axe' | 'pack' | 'boots' | 'regulars' | 'magnet' | 'vanguard';

export interface PerkDef {
  key: PerkKey;
  icon: string;
  label: string;
  desc: string;
  maxLevel: number;
  baseCost: number;
}

export const PERK_GROWTH = 1.5;

export const PERKS: PerkDef[] = [
  { key: 'axe', icon: '🪓', label: '황금 도끼', desc: '도끼 공격력 +15%', maxLevel: 10, baseCost: 4 },
  { key: 'regulars', icon: '💰', label: '단골 손님', desc: '판매 수입 +10%', maxLevel: 10, baseCost: 6 },
  { key: 'pack', icon: '🎒', label: '큰 배낭', desc: '운반량 +3', maxLevel: 10, baseCost: 4 },
  { key: 'boots', icon: '👢', label: '설피 장화', desc: '이동 속도 +5%', maxLevel: 10, baseCost: 4 },
  { key: 'magnet', icon: '🧲', label: '자석 장갑', desc: '줍기 범위 +12%', maxLevel: 5, baseCost: 5 },
  { key: 'vanguard', icon: '🛷', label: '선발대 자금', desc: '새 지역 시작 코인', maxLevel: 5, baseCost: 8 },
];

export type PerkLevels = Record<PerkKey, number>;

export function defaultPerks(): PerkLevels {
  return { axe: 0, pack: 0, boots: 0, regulars: 0, magnet: 0, vanguard: 0 };
}

/** 현재 레벨에서 다음 레벨로 올리는 보석 비용(최대면 null) */
export function perkCost(def: PerkDef, level: number): number | null {
  if (level >= def.maxLevel) return null;
  return Math.round(def.baseCost * Math.pow(PERK_GROWTH, level));
}

export function applyPerks(s: Stats, p: PerkLevels): Stats {
  return {
    ...s,
    axeDamage: s.axeDamage * (1 + 0.15 * p.axe),
    carryCapacity: s.carryCapacity + 3 * p.pack,
    moveSpeed: s.moveSpeed * (1 + 0.05 * p.boots),
  };
}

export const perkIncomeMult = (p: PerkLevels): number => 1 + 0.1 * p.regulars;
export const perkMagnetMult = (p: PerkLevels): number => 1 + 0.12 * p.magnet;

/** 선발대 자금: 새 지역 시작 코인 */
export function vanguardCoins(level: number, stage: number): number {
  return Math.round(level * 60 * stageMult(stage));
}
