import { describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, NAME_MAX, cleanName, sanitizeAvatar } from '../src/config/avatar';
import { GameState } from '../src/systems/GameState';
import { defaultSave, sanitize } from '../src/systems/SaveSystem';

describe('avatar', () => {
  it('cleans names: trims, strips markup/control chars, limits length', () => {
    expect(cleanName('  곰돌이  ')).toBe('곰돌이');
    expect(cleanName('<b>해커</b>')).toBe('b해커/b');
    expect(Array.from(cleanName('가나다라마바사아자차카타파하')).length).toBe(NAME_MAX);
    expect(cleanName('   ')).toBe(DEFAULT_AVATAR.name);
    expect(cleanName(42)).toBe(DEFAULT_AVATAR.name);
  });

  it('sanitizes bad values to defaults', () => {
    const a = sanitizeAvatar({ name: '눈사람', coat: -1, skin: 'red', hatStyle: 'crown', photo: 'yes' });
    expect(a.name).toBe('눈사람');
    expect(a.coat).toBe(DEFAULT_AVATAR.coat);
    expect(a.skin).toBe(DEFAULT_AVATAR.skin);
    expect(a.hatStyle).toBe(DEFAULT_AVATAR.hatStyle);
    expect(a.photo).toBe(false);
  });

  it('is saved with the game and kept when moving to the next region', () => {
    const d = defaultSave();
    d.avatar = { ...d.avatar, name: '설원왕', coat: 0x123456, hatStyle: 'none', photo: true, created: true };
    const loaded = sanitize(JSON.parse(JSON.stringify(d)));
    expect(loaded.avatar.name).toBe('설원왕');
    expect(loaded.avatar.hatStyle).toBe('none');
    const next = new GameState(loaded).nextStageSave();
    expect(next.avatar).toEqual(loaded.avatar);
  });

  it('old saves get the default avatar', () => {
    expect(sanitize({ coins: 5 }).avatar).toEqual(DEFAULT_AVATAR);
  });
});
