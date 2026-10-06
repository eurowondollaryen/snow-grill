import { describe, expect, it } from 'vitest';
import { STAGE, THEMES, incomeMult, stageMult, stageName } from '../src/config/stages';
import { UNLOCKS } from '../src/config/balance';
import { GameState } from '../src/systems/GameState';
import { MissionTracker, makeMission } from '../src/systems/MissionSystem';
import { defaultSave, sanitize } from '../src/systems/SaveSystem';

describe('stages', () => {
  it('cycles themes forever with lap suffixes', () => {
    expect(stageName(1)).toBe(THEMES[0].name);
    expect(stageName(THEMES.length + 1)).toBe(`${THEMES[0].name} II`);
    expect(stageName(THEMES.length * 2 + 2)).toBe(`${THEMES[1].name} III`);
  });

  it('scales costs and income per stage, stars add income', () => {
    expect(stageMult(1)).toBe(1);
    expect(stageMult(3)).toBe(STAGE.growth ** 2);
    expect(incomeMult(1, 2)).toBeCloseTo(1 + 2 * STAGE.starIncome);
  });

  it('unlock and upgrade prices follow the stage multiplier', () => {
    const d = defaultSave();
    d.stage = 2;
    const s = new GameState(d);
    const grill2 = UNLOCKS.find((u) => u.id === 'grill2')!;
    expect(s.priceOf(grill2)).toBe(grill2.price * STAGE.growth);
    expect(s.remaining('facility')).toBe(grill2.price * STAGE.growth);
  });

  it('the next-region sled appears only after every facility and staff unlock', () => {
    const d = defaultSave();
    const s = new GameState(d);
    expect(s.current('stage')).toBeNull();
    d.unlockedIds = UNLOCKS.filter((u) => u.track !== 'stage').map((u) => u.id);
    expect(s.current('stage')?.id).toBe('voyage');
  });

  it('nextStageSave resets the camp but keeps stars and lifetime stats', () => {
    const d = defaultSave();
    d.coins = 999;
    d.stars = 2;
    d.stage = 3;
    d.unlockedIds = ['grill2', 'cashier'];
    d.levels.damage = 7;
    d.tutorialStep = 10;
    d.lifetime.kills = 50;
    const n = new GameState(d).nextStageSave();
    expect(n.stage).toBe(4);
    expect(n.stars).toBe(3);
    expect(n.coins).toBe(0);
    expect(n.unlockedIds).toEqual([]);
    expect(n.levels.damage).toBe(1);
    expect(n.tutorialStep).toBe(10);
    expect(n.lifetime.kills).toBe(50);
    expect(n.mission.index).toBe(0);
  });

  it('old saves load as stage 1 with no stars', () => {
    const d = sanitize({ coins: 10, unlockedIds: ['grill2'] });
    expect(d.stage).toBe(1);
    expect(d.stars).toBe(0);
    expect(d.mission).toEqual({ index: 0, progress: 0 });
  });
});

describe('missions', () => {
  it('are endless and get harder', () => {
    const a = makeMission(0, 1);
    const b = makeMission(8, 1);
    expect(a.type).toBe(b.type);
    expect(b.target).toBeGreaterThan(a.target);
    expect(makeMission(1000, 1).target).toBeGreaterThan(0);
  });

  it('rewards scale with the stage', () => {
    expect(makeMission(0, 2).reward).toBe(makeMission(0, 1).reward * STAGE.growth);
  });

  it('tracks progress and rolls over to the next mission', () => {
    const done: number[] = [];
    const t = new MissionTracker({ index: 0, progress: 0 }, 1, (m) => done.push(m.index));
    const target = t.current.target;
    t.track('sell', 100); // 다른 종류는 무시
    expect(t.progress).toBe(0);
    t.track('kill', target - 1);
    expect(done).toEqual([]);
    t.track('kill', 1);
    expect(done).toEqual([0]);
    expect(t.current.index).toBe(1);
    expect(t.save).toEqual({ index: 1, progress: 0 });
  });

  it('combo missions use the best value, not a sum', () => {
    const t = new MissionTracker({ index: 2, progress: 0 }, 1, () => {});
    expect(t.current.type).toBe('combo');
    t.track('combo', 2);
    t.track('combo', 3);
    expect(t.progress).toBe(3);
  });
});

describe('gems & perks (보석 사냥터)', () => {
  it('polar bears drop gems, not meat', async () => {
    const { BEARS } = await import('../src/config/balance');
    expect(BEARS.polar.gems).toBeGreaterThan(0);
    expect(BEARS.polar.drop).toBe(0);
  });

  it('perks cost gems, apply to stats and survive the next region', async () => {
    const { PERKS } = await import('../src/config/perks');
    const d = defaultSave();
    const s = new GameState(d);
    const base = s.stats.axeDamage;
    const cost = s.perkNextCost('axe')!;
    expect(s.buyPerk('axe')).toBe(false);
    s.addGems(cost);
    expect(s.buyPerk('axe')).toBe(true);
    expect(s.stats.axeDamage).toBeCloseTo(base * 1.15);
    s.addGems(100);
    const n = s.nextStageSave();
    expect(n.perks.axe).toBe(1);
    expect(n.gems).toBe(100);
    expect(PERKS.length).toBeGreaterThan(0);
  });

  it('regulars perk raises income', () => {
    const d = defaultSave();
    d.perks.regulars = 2;
    expect(new GameState(d).incomeMult).toBeCloseTo(1.2);
  });

  it('vanguard perk gives starting coins in the next region', () => {
    const d = defaultSave();
    d.perks.vanguard = 2;
    expect(new GameState(d).nextStageSave().coins).toBeGreaterThan(0);
  });

  it('old carrier unlocks migrate to rails', () => {
    const d = sanitize({ unlockedIds: ['cashier', 'carrier1', 'carrier2'] });
    expect(d.unlockedIds).toEqual(['cashier', 'rail1', 'rail2']);
  });
});
