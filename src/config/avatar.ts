/**
 * 주인공 커스터마이징 데이터. 얼굴 사진은 용량 때문에 별도 키(FaceStore)에 저장한다.
 * Phaser/Three 의존성 없음.
 */
export type HatStyle = 'beanie' | 'fur' | 'none';

export interface Avatar {
  name: string;
  skin: number;
  hair: number;
  coat: number;
  scarf: number;
  hat: number;
  hatStyle: HatStyle;
  /** 사진 얼굴 사용 여부 */
  photo: boolean;
  /** 사진에 툰 필터 적용 */
  toon: boolean;
  /** 처음 만들기 화면을 거쳤는지 */
  created: boolean;
}

export const NAME_MAX = 10;

export const DEFAULT_AVATAR: Avatar = {
  name: '사냥꾼',
  skin: 0xf3cba5,
  hair: 0x4a3020,
  coat: 0xd94a3a,
  scarf: 0xf2c14e,
  hat: 0x2e5aa8,
  hatStyle: 'beanie',
  photo: false,
  toon: true,
  created: false,
};

export const PALETTE = {
  skin: [0xffe0c4, 0xf3cba5, 0xe3b08a, 0xc98e66, 0xa8714d, 0x7a4e33],
  hair: [0x1f1a17, 0x4a3020, 0x8a5a2b, 0xd9a35b, 0xe8e0d0, 0xc0392b, 0x5e6ad2],
  cloth: [0xd94a3a, 0xf08a24, 0xf2c14e, 0x3f8f5a, 0x2a9d8f, 0x2e5aa8, 0x7b4fb5, 0xef476f, 0x3a3046, 0xf6f1e9],
};

const HAT_STYLES: HatStyle[] = ['beanie', 'fur', 'none'];

const color = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 0xffffff ? Math.floor(v) : d);

/** 이름 정리: 앞뒤 공백 제거, 제어문자 제거, 길이 제한. 비면 기본 이름 */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_AVATAR.name;
  // eslint-disable-next-line no-control-regex
  const s = Array.from(raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim()).slice(0, NAME_MAX).join('');
  return s || DEFAULT_AVATAR.name;
}

export function sanitizeAvatar(raw: unknown): Avatar {
  const d = DEFAULT_AVATAR;
  if (!raw || typeof raw !== 'object') return { ...d };
  const r = raw as Record<string, unknown>;
  return {
    name: cleanName(r.name),
    skin: color(r.skin, d.skin),
    hair: color(r.hair, d.hair),
    coat: color(r.coat, d.coat),
    scarf: color(r.scarf, d.scarf),
    hat: color(r.hat, d.hat),
    hatStyle: HAT_STYLES.includes(r.hatStyle as HatStyle) ? (r.hatStyle as HatStyle) : d.hatStyle,
    photo: r.photo === true,
    toon: r.toon !== false,
    created: r.created === true,
  };
}
