import { describe, expect, it } from 'vitest';
import { AXE, COUNTER, PLAYER, STATION } from '../src/config/balance';
import { COST_GROWTH, UPGRADES, defaultLevels, getStats, getUpgradeDef, upgradeCost } from '../src/config/upgrades';

describe('upgradeCost', () => {
  it('follows round(baseCost × growth^(level-1))', () => {
    const dmg = getUpgradeDef('damage');
    expect(upgradeCost(dmg, 1)).toBe(dmg.baseCost);
    expect(upgradeCost(dmg, 2)).toBe(Math.round(dmg.baseCost * COST_GROWTH));
    expect(upgradeCost(dmg, 5)).toBe(Math.round(dmg.baseCost * Math.pow(COST_GROWTH, 4)));
  });

  it('returns null at max level', () => {
    for (const u of UPGRADES) expect(upgradeCost(u, u.maxLevel)).toBeNull();
  });

  it('uses the fixed cost table for axe count', () => {
    const ax = getUpgradeDef('axeCount');
    expect([1, 2, 3].map((l) => upgradeCost(ax, l))).toEqual(ax.fixedCosts);
    expect(upgradeCost(ax, 4)).toBeNull();
  });

  it('max levels match the spec', () => {
    const m = Object.fromEntries(UPGRADES.map((u) => [u.key, u.maxLevel]));
    expect(m).toEqual({ damage: 20, axeCount: 4, axeSpeed: 10, carry: 15, moveSpeed: 10, butcherSpeed: 10, grillSpeed: 10, price: 15 });
  });
});

describe('getStats', () => {
  it('base stats equal balance defaults', () => {
    const s = getStats(defaultLevels());
    expect(s.moveSpeed).toBe(PLAYER.moveSpeed);
    expect(s.carryCapacity).toBe(PLAYER.carryCapacity);
    expect(s.axeDamage).toBe(AXE.damage);
    expect(s.axeCount).toBe(1);
    expect(s.axeRadius).toBe(AXE.radius);
    expect(s.axeSpeed).toBe(AXE.speed);
    expect(s.butcherTime).toBeCloseTo(STATION.butcherTime);
    expect(s.grillTime).toBeCloseTo(STATION.grillTime);
    expect(s.meatPrice).toBe(COUNTER.basePrice);
  });

  it('applies per-level effects', () => {
    const lv = defaultLevels();
    lv.carry = 3; lv.damage = 2; lv.axeCount = 3; lv.axeSpeed = 2; lv.moveSpeed = 2; lv.butcherSpeed = 2; lv.price = 4;
    const s = getStats(lv);
    expect(s.carryCapacity).toBe(PLAYER.carryCapacity + 2 * PLAYER.carryPerLevel);
    expect(s.axeDamage).toBeCloseTo(AXE.damage * AXE.damageMult);
    expect(s.axeCount).toBe(3);
    expect(s.axeRadius).toBe(AXE.radius + 2 * AXE.radiusPerExtra);
    expect(s.axeSpeed).toBeCloseTo(AXE.speed + AXE.speedPerLevel);
    expect(s.moveSpeed).toBeCloseTo(PLAYER.moveSpeed * (1 + PLAYER.moveSpeedPerLevel));
    expect(s.butcherTime).toBeCloseTo(Math.max(STATION.minProcessTime, STATION.butcherTime * (1 - STATION.speedReductionPerLevel)));
    expect(s.meatPrice).toBe(COUNTER.basePrice + 3 * COUNTER.pricePerLevel);
  });

  it('process time never drops below the floor', () => {
    const lv = defaultLevels();
    lv.grillSpeed = 10;
    expect(getStats(lv).grillTime).toBeGreaterThanOrEqual(STATION.minProcessTime);
  });
});
