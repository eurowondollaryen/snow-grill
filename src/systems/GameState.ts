/**
 * 진행 상태(코인·업그레이드·해금·튜토리얼)를 보관하는 단일 객체.
 * GameScene / UIScene 이 공유하고, 변경은 이벤트로 알린다. Phaser 의존성 없음.
 */
import { UNLOCKS, type UnlockDef, type UnlockTrack } from '../config/balance';
import { getStats, getUpgradeDef, upgradeCost, type Stats, type UpgradeKey } from '../config/upgrades';
import { Emitter } from '../utils/Emitter';
import { IncomeTracker } from './EconomySystem';
import { incomeMult, stageMult, stageName, themeFor, type Theme } from '../config/stages';
import { defaultSave, type SaveData } from './SaveSystem';
import { PERKS, applyPerks, perkCost, perkIncomeMult, perkMagnetMult, vanguardCoins, type PerkKey } from '../config/perks';

export type StateEvent =
  | 'coins' // (coins, delta)
  | 'stats' // (stats)
  | 'unlock' // (def, index)
  | 'unlockProgress' // (paid, price)
  | 'tutorial' // (step)
  | 'forge' // (open: boolean)
  | 'toast' // (text)
  | 'offline' // (amount)
  | 'sound' // (on)
  | 'combo' // (count, bonus)
  | 'mission' // (completed mission | null) — 진행/완료 갱신
  | 'boss' // (bear | null) 등장/처치
  | 'stageClear' // ()
  | 'gems' // (gems, delta)
  | 'perk' // (key)
  | 'avatar'; // (avatar) 캐릭터 변경

export class GameState {
  readonly events = new Emitter();
  data: SaveData;
  stats: Stats;
  income: IncomeTracker;

  constructor(data: SaveData) {
    this.data = data;
    this.stats = this.computeStats();
    this.income = new IncomeTracker(data.incomePerMin);
  }

  on(e: StateEvent, fn: (...args: any[]) => void): () => void {
    return this.events.on(e, fn);
  }

  emit(e: StateEvent, ...args: unknown[]): void {
    this.events.emit(e, ...args);
  }

  // ── 코인 ──
  get coins(): number {
    return this.data.coins;
  }

  addCoins(n: number): void {
    if (n <= 0) return;
    this.data.coins += Math.floor(n);
    this.emit('coins', this.data.coins, n);
  }

  spendCoins(n: number): boolean {
    n = Math.floor(n);
    if (n <= 0 || this.data.coins < n) return false;
    this.data.coins -= n;
    this.emit('coins', this.data.coins, -n);
    return true;
  }

  recordSale(count: number, amount: number): void {
    this.data.totalSold += count;
    this.data.lifetime.sold += count;
    this.income.record(amount);
  }

  // ── 지역 ──
  get stage(): number {
    return this.data.stage;
  }

  get theme(): Theme {
    return themeFor(this.data.stage);
  }

  get stageName(): string {
    return stageName(this.data.stage);
  }

  /** 가격·비용 배율(지역) */
  get costMult(): number {
    return stageMult(this.data.stage);
  }

  /** 판매 수입 배율(지역 × ★ 보너스 × 보석 강화) */
  get incomeMult(): number {
    return incomeMult(this.data.stage, this.data.stars) * perkIncomeMult(this.data.perks);
  }

  get magnetMult(): number {
    return perkMagnetMult(this.data.perks);
  }

  private computeStats(): Stats {
    return applyPerks(getStats(this.data.levels), this.data.perks);
  }

  // ── 보석 / 영구 강화 ──
  get gems(): number {
    return this.data.gems;
  }

  addGems(n: number): void {
    if (n <= 0) return;
    this.data.gems += Math.floor(n);
    this.emit('gems', this.data.gems, n);
  }

  perkLevel(key: PerkKey): number {
    return this.data.perks[key];
  }

  perkNextCost(key: PerkKey): number | null {
    const def = PERKS.find((p) => p.key === key)!;
    return perkCost(def, this.data.perks[key]);
  }

  buyPerk(key: PerkKey): boolean {
    const cost = this.perkNextCost(key);
    if (cost === null || this.data.gems < cost) return false;
    this.data.gems -= cost;
    this.data.perks[key] += 1;
    this.stats = this.computeStats();
    this.emit('gems', this.data.gems, -cost);
    this.emit('perk', key);
    this.emit('stats', this.stats, null);
    return true;
  }

  /** 구운 고기 1개 실제 판매가 */
  get meatPrice(): number {
    return Math.round(this.stats.meatPrice * this.incomeMult);
  }

  priceOf(def: UnlockDef): number {
    return Math.round(def.price * this.costMult);
  }

  /** 다음 지역 세이브: 진행은 초기화, ★·누적 기록·설정은 유지 */
  nextStageSave(now = Date.now()): SaveData {
    const d = this.data;
    const next = defaultSave(now);
    next.stage = d.stage + 1;
    next.stars = d.stars + 1;
    next.stageStartedAt = now;
    next.tutorialStep = d.tutorialStep;
    next.sound = d.sound;
    next.lifetime = { ...d.lifetime };
    next.gems = d.gems;
    next.perks = { ...d.perks };
    next.avatar = { ...d.avatar };
    next.coins = vanguardCoins(d.perks.vanguard, next.stage);
    return next;
  }

  // ── 업그레이드 ──
  level(key: UpgradeKey): number {
    return this.data.levels[key];
  }

  nextCost(key: UpgradeKey): number | null {
    const c = upgradeCost(getUpgradeDef(key), this.data.levels[key]);
    return c === null ? null : Math.round(c * this.costMult);
  }

  buyUpgrade(key: UpgradeKey): boolean {
    const cost = this.nextCost(key);
    if (cost === null || !this.spendCoins(cost)) return false;
    this.data.levels[key] += 1;
    this.stats = this.computeStats();
    this.emit('stats', this.stats, key);
    return true;
  }

  // ── 해금 (시설 / 직원 두 갈래) ──
  /** 해당 갈래에서 다음으로 열 해금 */
  current(track: UnlockTrack): UnlockDef | null {
    // 다음 지역 썰매는 시설·직원을 모두 해금해야 나타난다
    if (track === 'stage' && (this.current('facility') || this.current('staff'))) return null;
    return UNLOCKS.find((u) => u.track === track && !this.data.unlockedIds.includes(u.id)) ?? null;
  }

  isUnlocked(id: UnlockDef['id']): boolean {
    return this.data.unlockedIds.includes(id);
  }

  get unlockedCount(): number {
    return this.data.unlockedIds.length;
  }

  remaining(track: UnlockTrack): number {
    const u = this.current(track);
    return u ? this.priceOf(u) - this.data.partial[track] : 0;
  }

  paid(track: UnlockTrack): number {
    return this.data.partial[track];
  }

  /** 지갑에서 amount 만큼 해당 갈래의 구매 존에 지불. 실제 지불액 반환. 완료 시 'unlock' 이벤트 */
  payTowardUnlock(track: UnlockTrack, amount: number): number {
    const u = this.current(track);
    if (!u) return 0;
    const price = this.priceOf(u);
    const pay = Math.min(Math.floor(amount), this.data.coins, price - this.data.partial[track]);
    if (pay <= 0) return 0;
    this.data.coins -= pay;
    this.data.partial[track] += pay;
    this.emit('coins', this.data.coins, -pay);
    this.emit('unlockProgress', track, this.data.partial[track], price);
    if (this.data.partial[track] >= price) {
      this.data.unlockedIds.push(u.id);
      this.data.partial[track] = 0;
      this.emit('unlock', u);
    }
    return pay;
  }

  get hasStaff(): boolean {
    return this.isUnlocked('cashier') || this.isUnlocked('rail1') || this.isUnlocked('hunter1');
  }

  // ── 튜토리얼 ──
  setTutorialStep(step: number): void {
    if (this.data.tutorialStep === step) return;
    this.data.tutorialStep = step;
    this.emit('tutorial', step);
  }

  toast(text: string): void {
    this.emit('toast', text);
  }
}
