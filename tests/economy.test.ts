import { describe, expect, it } from 'vitest';
import { COUNTER, UNLOCKS } from '../src/config/balance';
import { IncomeTracker, buyZoneRate, offlineReward, saleValue } from '../src/systems/EconomySystem';
import { GameState } from '../src/systems/GameState';
import { defaultSave } from '../src/systems/SaveSystem';

describe('saleValue', () => {
  it('uses the base price per cooked meat', () => {
    expect(saleValue(1, 1)).toBe(COUNTER.basePrice);
    expect(saleValue(3, 1)).toBe(3 * COUNTER.basePrice);
  });
  it('price level adds a fixed amount per level', () => {
    expect(saleValue(2, 2)).toBe(2 * (COUNTER.basePrice + COUNTER.pricePerLevel));
    expect(saleValue(1, 15)).toBe(COUNTER.basePrice + 14 * COUNTER.pricePerLevel);
  });
  it('never negative', () => {
    expect(saleValue(-3, 1)).toBe(0);
  });
});

describe('buyZoneRate', () => {
  it('completes any price within 1–3 seconds', () => {
    for (const u of UNLOCKS) {
      const seconds = u.price / buyZoneRate(u.price);
      expect(seconds).toBeGreaterThanOrEqual(1);
      expect(seconds).toBeLessThanOrEqual(3);
    }
  });
});

describe('offlineReward', () => {
  it('is zero without staff', () => {
    expect(offlineReward(3_600_000, 100, false)).toBe(0);
  });
  it('is elapsed minutes × income × 0.3', () => {
    expect(offlineReward(10 * 60_000, 100, true)).toBe(300);
  });
  it('caps at 2 hours', () => {
    expect(offlineReward(10 * 3_600_000, 100, true)).toBe(120 * 100 * 0.3);
  });
  it('ignores under a minute', () => {
    expect(offlineReward(30_000, 100, true)).toBe(0);
  });
});

describe('IncomeTracker', () => {
  it('estimates coins per minute', () => {
    const t = new IncomeTracker();
    t.record(50);
    t.tick(30);
    expect(t.perMin).toBeCloseTo(100);
  });
});

describe('GameState unlock payments', () => {
  it('keeps partial payment and unlocks in order per track', () => {
    const s = new GameState(defaultSave());
    expect(s.current('staff')?.id).toBe('cashier');
    expect(s.current('facility')?.id).toBe('grill2');
    const price = s.current('staff')!.price;
    s.addCoins(price - 5);
    expect(s.payTowardUnlock('staff', 1000)).toBe(price - 5);
    expect(s.paid('staff')).toBe(price - 5);
    expect(s.isUnlocked('cashier')).toBe(false);
    s.addCoins(100);
    let unlocked: string | null = null;
    s.on('unlock', (d) => (unlocked = d.id));
    s.payTowardUnlock('staff', 1000);
    expect(unlocked).toBe('cashier');
    expect(s.coins).toBe(95);
    expect(s.paid('staff')).toBe(0);
    expect(s.current('staff')?.id).toBe('rail1');
    // 다른 갈래는 영향 없음
    expect(s.current('facility')?.id).toBe('grill2');
  });

  it('staff can be hired before any facility', () => {
    for (const u of UNLOCKS.filter((x) => x.track === 'staff').slice(0, 2))
      expect(u.price).toBeLessThan(UNLOCKS.find((x) => x.id === 'counter2')!.price);
  });

  it('buyUpgrade spends coins and raises level', () => {
    const s = new GameState(defaultSave());
    expect(s.buyUpgrade('damage')).toBe(false);
    s.addCoins(s.nextCost('damage')!);
    expect(s.buyUpgrade('damage')).toBe(true);
    expect(s.level('damage')).toBe(2);
    expect(s.coins).toBe(0);
  });
});
