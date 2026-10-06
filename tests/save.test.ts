import { describe, expect, it } from 'vitest';
import { SAVE, UNLOCKS } from '../src/config/balance';
import { defaultSave, loadSave, sanitize, writeSave, type StorageLike } from '../src/systems/SaveSystem';

class MemStorage implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('SaveSystem', () => {
  it('round-trips data', () => {
    const st = new MemStorage();
    const d = defaultSave();
    d.coins = 123; d.unlockedIds = ['cashier', 'grill2']; d.partial.staff = 20; d.levels.damage = 5; d.carry = { type: 'cut', count: 4 };
    writeSave(st, d);
    const { data, fresh } = loadSave(st);
    expect(fresh).toBe(false);
    expect(data.coins).toBe(123);
    expect(data.unlockedIds).toEqual(['cashier', 'grill2']);
    expect(data.partial.staff).toBe(20);
    expect(data.levels.damage).toBe(5);
    expect(data.carry).toEqual({ type: 'cut', count: 4 });
  });

  it('survives corrupt JSON', () => {
    const st = new MemStorage();
    st.setItem(SAVE.key, '{oops');
    expect(loadSave(st).fresh).toBe(true);
  });

  it('clamps invalid values', () => {
    const d = sanitize({ coins: -5, unlockedIds: ['grill2', 'nope', 'grill2'], levels: { damage: 999, carry: 'x' }, partial: { facility: 1e9 } });
    expect(d.coins).toBe(0);
    expect(d.unlockedIds).toEqual(['grill2']);
    expect(d.levels.damage).toBe(20);
    expect(d.levels.carry).toBe(1);
    expect(d.partial.facility).toBe(UNLOCKS.find((u) => u.id === 'forge')!.price - 1); // 다음 해금 가격 미만으로 제한
  });

  it('migrates v1.0 single-order saves', () => {
    // 구버전: grill2, butcher2, forge 해금 + cashier(4번째)에 100 지불
    const d = sanitize({ unlocked: 3, partialPaid: 100 });
    expect(d.unlockedIds).toEqual(['grill2', 'butcher2', 'forge']);
    expect(d.partial.staff).toBe(UNLOCKS.find((u) => u.id === 'cashier')!.price - 1); // 다음 해금 가격 미만으로 제한
    expect(d.partial.facility).toBe(0);
  });
});
