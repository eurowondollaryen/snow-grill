/**
 * localStorage 저장/불러오기. 키에 버전을 포함하고, 손상·구버전 데이터는 정리해서 읽는다.
 */
import { LAYOUT, LEGACY_ID_MAP, LEGACY_UNLOCK_ORDER, SAVE, STATION, COUNTER, UNLOCKS, type ItemType, type UnlockId, type UnlockTrack } from '../config/balance';
import { stageMult } from '../config/stages';
import { PERKS, defaultPerks, type PerkLevels } from '../config/perks';
import { UPGRADES, defaultLevels, type UpgradeLevels } from '../config/upgrades';
import type { MissionSave } from './MissionSystem';
import { DEFAULT_AVATAR, sanitizeAvatar, type Avatar } from '../config/avatar';

export interface StationSave {
  input: number;
  output: number;
}

export interface SaveData {
  v: number;
  coins: number;
  levels: UpgradeLevels;
  unlockedIds: UnlockId[]; // 완료된 해금
  partial: Record<UnlockTrack, number>; // 갈래별 현재 구매 존에 낸 금액
  tutorialStep: number;
  totalSold: number;
  incomePerMin: number;
  lastSeen: number;
  sound: boolean;
  butchers: StationSave[];
  grills: StationSave[];
  displays: number[];
  piles: number[];
  carry: { type: ItemType | null; count: number };
  /** 현재 지역(1부터) */
  stage: number;
  /** 지역 정복 보상 ★ — 영구 수입 보너스 */
  stars: number;
  /** 이번 지역을 시작한 시각(ms) */
  stageStartedAt: number;
  mission: MissionSave;
  lifetime: { kills: number; bosses: number; sold: number };
  /** 보석(영구 재화) */
  gems: number;
  /** 보석 상점 영구 강화 */
  perks: PerkLevels;
  /** 주인공 커스터마이징(이름·색·모자) */
  avatar: Avatar;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultSave(now = Date.now()): SaveData {
  return {
    v: SAVE.version,
    coins: 0,
    levels: defaultLevels(),
    unlockedIds: [],
    partial: { facility: 0, staff: 0, stage: 0 },
    tutorialStep: 0,
    totalSold: 0,
    incomePerMin: 0,
    lastSeen: now,
    sound: true,
    butchers: LAYOUT.butchers.map(() => ({ input: 0, output: 0 })),
    grills: LAYOUT.grills.map(() => ({ input: 0, output: 0 })),
    displays: LAYOUT.counters.map(() => 0),
    piles: LAYOUT.counters.map(() => 0),
    carry: { type: null, count: 0 },
    stage: 1,
    stars: 0,
    stageStartedAt: now,
    mission: { index: 0, progress: 0 },
    lifetime: { kills: 0, bosses: 0, sold: 0 },
    gems: 0,
    perks: defaultPerks(),
    avatar: { ...DEFAULT_AVATAR },
  };
}

const num = (v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};

const int = (v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  Math.floor(num(v, fallback, min, max));

function stations(raw: unknown, len: number): StationSave[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: len }, (_, i) => {
    const s = (arr[i] ?? {}) as Partial<StationSave>;
    return {
      input: int(s.input, 0, 0, STATION.inputMax),
      output: int(s.output, 0, 0, STATION.outputMax),
    };
  });
}

/** 알 수 없는 입력을 안전한 SaveData로 정리 */
export function sanitize(raw: unknown, now = Date.now()): SaveData {
  const d = defaultSave(now);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;

  const levels = defaultLevels();
  const rl = (r.levels ?? {}) as Record<string, unknown>;
  for (const u of UPGRADES) levels[u.key] = int(rl[u.key], 1, 1, u.maxLevel);

  // 해금: 신형(id 목록) 또는 구형(단일 순서 개수 + partialPaid)
  const validIds = new Set(UNLOCKS.map((u) => u.id));
  let unlockedIds: UnlockId[] = [];
  const partial: Record<UnlockTrack, number> = { facility: 0, staff: 0, stage: 0 };
  const stage = int(r.stage, 1, 1, 9999);
  if (Array.isArray(r.unlockedIds)) {
    unlockedIds = (r.unlockedIds as unknown[])
      .map((x) => (typeof x === 'string' && LEGACY_ID_MAP[x]) || x)
      .filter((x): x is UnlockId => typeof x === 'string' && validIds.has(x as UnlockId));
    const rp = (r.partial ?? {}) as Record<string, unknown>;
    partial.facility = int(rp.facility, 0);
    partial.staff = int(rp.staff, 0);
    partial.stage = int(rp.stage, 0);
  } else if (typeof r.unlocked === 'number') {
    const n = int(r.unlocked, 0, 0, LEGACY_UNLOCK_ORDER.length);
    unlockedIds = LEGACY_UNLOCK_ORDER.slice(0, n);
    const cur = UNLOCKS.find((u) => u.id === LEGACY_UNLOCK_ORDER[n]);
    if (cur) partial[cur.track] = int(r.partialPaid, 0);
  }
  unlockedIds = [...new Set(unlockedIds)];
  // 갈래별 다음 해금 가격 미만으로 제한
  for (const track of ['facility', 'staff', 'stage'] as UnlockTrack[]) {
    const next = UNLOCKS.find((u) => u.track === track && !unlockedIds.includes(u.id));
    partial[track] = next ? Math.min(partial[track], Math.round(next.price * stageMult(stage)) - 1) : 0;
  }
  const mRaw = (r.mission ?? {}) as Record<string, unknown>;
  const perks = defaultPerks();
  const pRaw = (r.perks ?? {}) as Record<string, unknown>;
  for (const d of PERKS) perks[d.key] = int(pRaw[d.key], 0, 0, d.maxLevel);
  const lRaw = (r.lifetime ?? {}) as Record<string, unknown>;
  const carryRaw = (r.carry ?? {}) as Record<string, unknown>;
  const carryType = carryRaw.type === 'raw' || carryRaw.type === 'cut' || carryRaw.type === 'cooked' ? carryRaw.type : null;
  const displaysRaw = Array.isArray(r.displays) ? r.displays : [];
  const pilesRaw = Array.isArray(r.piles) ? r.piles : [];

  return {
    v: SAVE.version,
    coins: int(r.coins, 0),
    levels,
    unlockedIds,
    partial,
    tutorialStep: int(r.tutorialStep, 0, 0, 999),
    totalSold: int(r.totalSold, 0),
    incomePerMin: num(r.incomePerMin, 0, 0, 1e9),
    lastSeen: int(r.lastSeen, now, 0),
    sound: typeof r.sound === 'boolean' ? r.sound : true,
    butchers: stations(r.butchers, LAYOUT.butchers.length),
    grills: stations(r.grills, LAYOUT.grills.length),
    displays: LAYOUT.counters.map((_, i) => int(displaysRaw[i], 0, 0, COUNTER.counterMax)),
    piles: LAYOUT.counters.map((_, i) => int(pilesRaw[i], 0)),
    carry: carryType ? { type: carryType, count: int(carryRaw.count, 0, 0, 999) } : { type: null, count: 0 },
    stage,
    stars: int(r.stars, 0, 0, 9999),
    stageStartedAt: int(r.stageStartedAt, now, 0),
    mission: { index: int(mRaw.index, 0, 0, 1e6), progress: num(mRaw.progress, 0, 0, 1e15) },
    lifetime: { kills: int(lRaw.kills, 0), bosses: int(lRaw.bosses, 0), sold: int(lRaw.sold, int(r.totalSold, 0)) },
    gems: int(r.gems, 0),
    perks,
    avatar: sanitizeAvatar(r.avatar),
  };
}

export function getStorage(): StorageLike | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__snowgrill_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadSave(storage: StorageLike | null, now = Date.now()): { data: SaveData; fresh: boolean } {
  if (!storage) return { data: defaultSave(now), fresh: true };
  try {
    const raw = storage.getItem(SAVE.key);
    if (!raw) return { data: defaultSave(now), fresh: true };
    return { data: sanitize(JSON.parse(raw), now), fresh: false };
  } catch {
    return { data: defaultSave(now), fresh: true };
  }
}

export function writeSave(storage: StorageLike | null, data: SaveData): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE.key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SAVE.key);
  } catch {
    /* ignore */
  }
}
