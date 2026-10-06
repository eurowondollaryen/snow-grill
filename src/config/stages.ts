/**
 * 지역(스테이지) 테마와 스케일링. 5개 테마를 돌고, 이후엔 "II", "III"… 로 무한히 이어진다.
 * Phaser 의존성 없음.
 */
import type { BearKind } from './balance';

export interface BearLook {
  fur: number;
  belly: number;
  name: string;
}

export interface Theme {
  id: string;
  name: string;
  bg: string;
  ground: { huntB: [number, number]; hunt: [number, number]; camp: [number, number] };
  veil: number;
  bears: Record<BearKind, BearLook>;
}

export const THEMES: Theme[] = [
  {
    id: 'snow',
    name: '설원 캠프',
    bg: '#cfe3ef',
    ground: { huntB: [0xdde9f5, 0xb2c6dd], hunt: [0xeaf2f8, 0xc5d6e6], camp: [0xe8e4dc, 0xcdc3b2] },
    veil: 0x6c8db5,
    bears: {
      baby: { fur: 0xb98552, belly: 0xe8c9a0, name: '아기곰' },
      brown: { fur: 0x7b4a2a, belly: 0xd2a679, name: '갈색곰' },
      polar: { fur: 0xf4f7fb, belly: 0xdfe7f0, name: '백곰' },
      boss: { fur: 0x4a2a16, belly: 0xc08a5a, name: '설원의 왕' },
    },
  },
  {
    id: 'forest',
    name: '침엽수림',
    bg: '#cfe0cf',
    ground: { huntB: [0xcfdcc4, 0x9fb58f], hunt: [0xdde8d2, 0xb3c7a1], camp: [0xe3dccb, 0xc5b89c] },
    veil: 0x4f7a55,
    bears: {
      baby: { fur: 0x3d3a42, belly: 0xe9e2d2, name: '아기 반달곰' },
      brown: { fur: 0x8c7660, belly: 0xd8c3a5, name: '회색곰' },
      polar: { fur: 0x5b3a20, belly: 0xb88a5a, name: '큰불곰' },
      boss: { fur: 0x1f1d24, belly: 0xf0e8d8, name: '숲의 군주' },
    },
  },
  {
    id: 'ice',
    name: '얼음 동굴',
    bg: '#c9e2f2',
    ground: { huntB: [0xc6e0f2, 0x8fbbe0], hunt: [0xd8ecf7, 0xa9cde8], camp: [0xdfe6ee, 0xb9c7d6] },
    veil: 0x3d6e99,
    bears: {
      baby: { fur: 0x9ec9e6, belly: 0xe6f4ff, name: '서리곰' },
      brown: { fur: 0x5f8fbf, belly: 0xcfe6fa, name: '빙결곰' },
      polar: { fur: 0xe6f4ff, belly: 0xa9d4f5, name: '수정곰' },
      boss: { fur: 0x2f5f8c, belly: 0x9fd4ff, name: '빙하 거신' },
    },
  },
  {
    id: 'volcano',
    name: '온천 화산',
    bg: '#ead8cc',
    ground: { huntB: [0xd9c0ae, 0xb08a70], hunt: [0xe9dccf, 0xc9ad95], camp: [0xe6d9cc, 0xc4ad96] },
    veil: 0x9a3f22,
    bears: {
      baby: { fur: 0xd98a4a, belly: 0xf6d2a8, name: '불씨곰' },
      brown: { fur: 0xa8432a, belly: 0xf0b48a, name: '화염곰' },
      polar: { fur: 0x4a2418, belly: 0xff8a3d, name: '용암곰' },
      boss: { fur: 0xd8431c, belly: 0xffd166, name: '화산의 분노' },
    },
  },
  {
    id: 'aurora',
    name: '오로라 빙원',
    bg: '#dcd8f0',
    ground: { huntB: [0xd3cdf0, 0xa99fe0], hunt: [0xe4e1f5, 0xc2bbec], camp: [0xe8e4f2, 0xc9c0e0] },
    veil: 0x6a4fb5,
    bears: {
      baby: { fur: 0xc3a8ec, belly: 0xf3eaff, name: '별빛곰' },
      brown: { fur: 0x8a6cc9, belly: 0xe2d6fa, name: '오로라곰' },
      polar: { fur: 0xf6efff, belly: 0xd7c6ff, name: '은하곰' },
      boss: { fur: 0xf2b631, belly: 0xfff1c2, name: '황금곰' },
    },
  },
];

export const STAGE = {
  /** 지역이 오를 때마다 가격·비용·보상이 이만큼 곱해진다 */
  growth: 3,
  /** ★ 하나당 판매 수입 보너스 */
  starIncome: 0.15,
};

const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

export function themeFor(stage: number): Theme {
  return THEMES[(Math.max(1, stage) - 1) % THEMES.length];
}

export function stageName(stage: number): string {
  const lap = Math.floor((Math.max(1, stage) - 1) / THEMES.length);
  return themeFor(stage).name + (ROMAN[lap] ?? ` ${lap + 1}`);
}

export function stageMult(stage: number): number {
  return Math.pow(STAGE.growth, Math.max(1, stage) - 1);
}

export function incomeMult(stage: number, stars: number): number {
  return stageMult(stage) * (1 + STAGE.starIncome * Math.max(0, stars));
}
