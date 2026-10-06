/**
 * 로우폴리 3D 모델 라이브러리. 외부 에셋 없이 기본 도형을 조합하고,
 * 부위별 색은 버텍스 컬러로 구워 모델당 1 드로우콜로 만든다.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];

interface Part {
  g: THREE.BufferGeometry;
  c: number;
  p?: V3;
  r?: V3;
  s?: V3;
}

const P = (g: THREE.BufferGeometry, c: number, p?: V3, r?: V3, s?: V3): Part => ({ g, c, p, r, s });

/** 부위들을 하나의 버텍스 컬러 지오메트리로 굽기 */
export function bake(parts: Part[]): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const geos = parts.map((pt) => {
    const g = (pt.g.index ? pt.g.toNonIndexed() : pt.g.clone()) as THREE.BufferGeometry;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    q.setFromEuler(new THREE.Euler(...(pt.r ?? [0, 0, 0])));
    m.compose(new THREE.Vector3(...(pt.p ?? [0, 0, 0])), q, new THREE.Vector3(...(pt.s ?? [1, 1, 1])));
    g.applyMatrix4(m);
    const col = new THREE.Color(pt.c);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const out = mergeGeometries(geos, false)!;
  out.computeBoundingSphere();
  return out;
}

// ───────── 기본 도형(공유) ─────────
const sphere = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r: number, h: number, seg = 10) => new THREE.ConeGeometry(r, h, seg);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);

export const MAT = {
  vc: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ color: 0xff8a2a }),
  glowSoft: new THREE.MeshBasicMaterial({ color: 0xffc35a }),
};

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material = MAT.vc, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}

// ───────── 사람 ─────────
export interface PersonLook {
  coat: number;
  hat: number;
  scarf?: number;
  apron?: boolean;
  fur?: boolean;
  skin?: number;
  hair?: number;
  hatStyle?: 'beanie' | 'fur' | 'none';
  /** 사진 얼굴을 덮을 때는 그려진 눈·볼을 생략 */
  noFace?: boolean;
}

const SKIN = 0xf3cba5;
const DARK = 0x2b2b3a;

const shade = (c: number, f: number) => {
  const col = new THREE.Color(c);
  return f >= 0 ? col.lerp(new THREE.Color(0xffffff), f).getHex() : col.multiplyScalar(1 + f).getHex();
};

export function personGeometry(o: PersonLook): THREE.BufferGeometry {
  const skin = o.skin ?? SKIN;
  const parts: Part[] = [
    P(cyl(0.07, 0.075, 0.24, 8), 0x3a3046, [-0.09, 0.12, 0]),
    P(cyl(0.07, 0.075, 0.24, 8), 0x3a3046, [0.09, 0.12, 0]),
    P(sphere(0.085, 8, 6), 0x2a2232, [-0.09, 0.03, 0.03], undefined, [1, 0.6, 1.3]),
    P(sphere(0.085, 8, 6), 0x2a2232, [0.09, 0.03, 0.03], undefined, [1, 0.6, 1.3]),
    P(cyl(0.17, 0.23, 0.44, 14), o.coat, [0, 0.44, 0]),
    P(sphere(0.17, 14, 8), o.coat, [0, 0.64, 0], undefined, [1, 0.45, 1]),
    P(capsule(0.065, 0.2), shade(o.coat, -0.15), [-0.25, 0.44, 0.02], [0, 0, 0.28]),
    P(capsule(0.065, 0.2), shade(o.coat, -0.15), [0.25, 0.44, 0.02], [0, 0, -0.28]),
    P(sphere(0.065, 8, 6), skin, [-0.29, 0.29, 0.04]),
    P(sphere(0.065, 8, 6), skin, [0.29, 0.29, 0.04]),
    P(new THREE.TorusGeometry(0.15, 0.055, 6, 14), o.scarf ?? 0xf6f1e9, [0, 0.66, 0], [Math.PI / 2, 0, 0]),
    P(sphere(0.21, 16, 12), skin, [0, 0.86, 0]),
  ];
  if (!o.noFace)
    parts.push(
      P(sphere(0.045, 8, 6), 0xf29e8e, [-0.12, 0.82, 0.16]),
      P(sphere(0.045, 8, 6), 0xf29e8e, [0.12, 0.82, 0.16]),
      P(sphere(0.03, 8, 6), DARK, [-0.075, 0.88, 0.19]),
      P(sphere(0.03, 8, 6), DARK, [0.075, 0.88, 0.19]),
      P(sphere(0.022, 6, 4), 0xffffff, [-0.065, 0.895, 0.215]),
      P(sphere(0.022, 6, 4), 0xffffff, [0.085, 0.895, 0.215]),
    );
  if (o.apron) parts.push(P(box(0.26, 0.28, 0.03), 0xffffff, [0, 0.4, 0.2], [-0.12, 0, 0]));
  parts.push(P(sphere(0.035, 6, 4), shade(o.coat, -0.4), [0, 0.5, 0.215]), P(sphere(0.035, 6, 4), shade(o.coat, -0.4), [0, 0.38, 0.225]));
  const style = o.hatStyle ?? (o.fur ? 'fur' : 'beanie');
  // 사진 얼굴일 때는 모자를 살짝 올려 눈썹이 가려지지 않게
  const lift = o.noFace ? 0.04 : 0;
  const hair = o.hair ?? 0x4a3020;
  if (style === 'fur') {
    parts.push(P(cyl(0.22, 0.23, 0.12, 14), 0xe9dccf, [0, 0.96 + lift, 0]), P(cyl(0.18, 0.21, 0.16, 14), o.hat, [0, 1.06 + lift, 0]));
  } else if (style === 'beanie') {
    parts.push(
      P(new THREE.SphereGeometry(0.215, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), o.hat, [0, 0.89 + lift, 0]),
      P(cyl(0.218, 0.218, 0.07, 16), shade(o.hat, 0.35), [0, 0.9 + lift, 0]),
      P(sphere(0.065, 8, 6), 0xffffff, [0, 1.12 + lift, 0]),
    );
  } else {
    // 모자 없음: 머리카락(정수리 + 뒷머리)
    parts.push(
      P(new THREE.SphereGeometry(0.224, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), hair, [0, 0.865, -0.004]),
      P(sphere(0.2, 12, 8), hair, [0, 0.83, -0.07], undefined, [1.05, 1, 0.8]),
    );
  }
  return bake(parts);
}

/** 사진 얼굴을 입힐 머리 앞면 곡면(텍스처 UV 0..1 이 얼굴 원 전체) */
export function faceCapGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.2145, 28, 18, Math.PI / 2 - 0.92, 1.84, Math.PI / 2 - 0.62, 1.5);
  g.translate(0, 0.86, 0);
  return g;
}

// ───────── 곰 ─────────
export function bearGeometry(fur: number, belly: number, crown = false): THREE.BufferGeometry {
  const dark = shade(fur, -0.25);
  const parts: Part[] = [
    P(sphere(0.42, 16, 12), fur, [0, 0.44, -0.05], undefined, [0.86, 0.78, 1.12]),
    P(sphere(0.3, 12, 8), shade(fur, 0.12), [0, 0.6, -0.12], undefined, [0.8, 0.5, 1]),
    P(sphere(0.22, 12, 8), belly, [0, 0.36, 0.22], undefined, [0.9, 0.9, 0.7]),
    P(cyl(0.1, 0.12, 0.3, 8), dark, [-0.21, 0.15, 0.26]),
    P(cyl(0.1, 0.12, 0.3, 8), dark, [0.21, 0.15, 0.26]),
    P(cyl(0.1, 0.12, 0.3, 8), dark, [-0.21, 0.15, -0.3]),
    P(cyl(0.1, 0.12, 0.3, 8), dark, [0.21, 0.15, -0.3]),
    P(sphere(0.075, 8, 6), dark, [0, 0.52, -0.52]),
    P(sphere(0.28, 16, 12), fur, [0, 0.66, 0.44]),
    P(sphere(0.095, 10, 8), fur, [-0.18, 0.9, 0.38]),
    P(sphere(0.095, 10, 8), fur, [0.18, 0.9, 0.38]),
    P(sphere(0.05, 8, 6), belly, [-0.18, 0.9, 0.44]),
    P(sphere(0.05, 8, 6), belly, [0.18, 0.9, 0.44]),
    P(sphere(0.13, 12, 8), belly, [0, 0.6, 0.66], undefined, [1.05, 0.8, 1]),
    P(sphere(0.055, 8, 6), DARK, [0, 0.64, 0.78], undefined, [1.2, 0.85, 1]),
    P(sphere(0.038, 8, 6), DARK, [-0.11, 0.74, 0.66]),
    P(sphere(0.038, 8, 6), DARK, [0.11, 0.74, 0.66]),
    P(sphere(0.014, 6, 4), 0xffffff, [-0.1, 0.755, 0.695]),
    P(sphere(0.014, 6, 4), 0xffffff, [0.12, 0.755, 0.695]),
    P(sphere(0.05, 8, 6), 0xf29e8e, [-0.17, 0.6, 0.62]),
    P(sphere(0.05, 8, 6), 0xf29e8e, [0.17, 0.6, 0.62]),
  ];
  if (crown) {
    const gold = 0xffc93c;
    parts.push(P(cyl(0.17, 0.17, 0.09, 12), gold, [0, 0.95, 0.42]));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(P(cone(0.045, 0.14, 6), gold, [Math.cos(a) * 0.15, 1.05, 0.42 + Math.sin(a) * 0.15]));
    }
    parts.push(P(sphere(0.04, 8, 6), 0xe63946, [0, 0.96, 0.6]));
    parts.push(P(box(0.12, 0.025, 0.02), DARK, [-0.1, 0.8, 0.68], [0, 0, -0.4]), P(box(0.12, 0.025, 0.02), DARK, [0.1, 0.8, 0.68], [0, 0, 0.4]));
  }
  return bake(parts);
}

// ───────── 도끼(바깥쪽 +X 방향으로 누운 형태) ─────────
export function axeGeometry(): THREE.BufferGeometry {
  return bake([
    P(cyl(0.028, 0.03, 0.5, 8), 0x8a5a2b, [0.25, 0, 0], [0, 0, Math.PI / 2]),
    P(box(0.07, 0.07, 0.07), 0x5e3b1b, [0.03, 0, 0]),
    P(box(0.08, 0.05, 0.12), 0x6b7785, [0.48, 0, 0]),
    P(box(0.06, 0.035, 0.26), 0xb8c4d0, [0.53, 0, 0.12]),
    P(box(0.03, 0.036, 0.28), 0xeef3f8, [0.57, 0, 0.14]),
  ]);
}

// ───────── 아이템(인스턴싱용, 바닥 기준 y=0) ─────────
export const ITEM_H = 0.075; // 쌓을 때 한 칸 높이

export function itemGeometry(kind: 'raw' | 'cut' | 'cooked' | 'coin' | 'gem'): THREE.BufferGeometry {
  switch (kind) {
    case 'raw':
      return bake([
        P(sphere(0.15, 12, 8), 0xc8323c, [0, 0.04, 0], undefined, [1.1, 0.33, 0.78]),
        P(sphere(0.05, 8, 6), 0xf3b7b0, [-0.05, 0.07, 0.02], undefined, [1.6, 0.3, 0.5]),
        P(cyl(0.022, 0.022, 0.13, 6), 0xfdf6ec, [0.17, 0.045, 0], [0, 0, Math.PI / 2]),
        P(sphere(0.035, 6, 4), 0xfdf6ec, [0.235, 0.045, 0.02]),
        P(sphere(0.035, 6, 4), 0xfdf6ec, [0.235, 0.045, -0.02]),
      ]);
    case 'cut':
      return bake([
        P(box(0.3, 0.075, 0.2), 0xe86a6f, [0, 0.0375, 0]),
        P(box(0.3, 0.078, 0.045), 0xfff1e6, [0, 0.038, -0.085]),
        P(box(0.12, 0.004, 0.02), 0xf7a5a5, [0.02, 0.077, 0.03]),
      ]);
    case 'cooked':
      return bake([
        P(box(0.3, 0.08, 0.2), 0x9c5427, [0, 0.04, 0]),
        P(box(0.3, 0.02, 0.2), 0x7a3d1a, [0, 0.005, 0]),
        P(box(0.02, 0.006, 0.22), 0x3a1c0a, [-0.08, 0.082, 0], [0, 0.45, 0]),
        P(box(0.02, 0.006, 0.22), 0x3a1c0a, [0, 0.082, 0], [0, 0.45, 0]),
        P(box(0.02, 0.006, 0.22), 0x3a1c0a, [0.08, 0.082, 0], [0, 0.45, 0]),
      ]);
    case 'coin':
      return bake([P(cyl(0.1, 0.1, 0.035, 16), 0xe0a21a, [0, 0.0175, 0]), P(cyl(0.075, 0.075, 0.037, 16), 0xffd04a, [0, 0.0185, 0])]);
    case 'gem':
      return bake([P(new THREE.OctahedronGeometry(0.11, 0), 0x5ee7ff, [0, 0.14, 0], undefined, [1, 1.35, 1])]);
  }
}

// ───────── 시설 ─────────
const WOOD = 0xb07a43;
const WOOD_D = 0x8b5a2b;
const WOOD_DD = 0x6b4423;

export function butcherGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    P(box(1.42, 0.12, 0.82), WOOD, [0, 0.72, 0]),
    P(box(1.38, 0.5, 0.06), WOOD_D, [0, 0.43, 0.37]),
    P(box(0.6, 0.06, 0.46), 0xe7c9a0, [0, 0.81, 0]),
    P(box(0.3, 0.02, 0.15), 0xc9d3dd, [0.04, 0.85, 0.02]),
    P(box(0.13, 0.035, 0.05), DARK, [0.25, 0.85, 0.02]),
  ];
  for (const [x, z] of [
    [-0.62, -0.32],
    [0.62, -0.32],
    [-0.62, 0.32],
    [0.62, 0.32],
  ])
    parts.push(P(box(0.1, 0.68, 0.1), WOOD_DD, [x, 0.34, z]));
  return bake(parts);
}

export function grillGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    P(box(1.36, 0.5, 0.78), 0x3d3f4b, [0, 0.5, 0]),
    P(box(1.44, 0.08, 0.86), 0x5d6072, [0, 0.77, 0]),
    P(box(1.24, 0.04, 0.66), 0x1d1d24, [0, 0.79, 0]),
    P(box(0.34, 0.06, 0.04), 0xa0a4b8, [0, 0.55, 0.41]),
  ];
  for (let i = -5; i <= 5; i++) parts.push(P(box(0.025, 0.03, 0.66), 0x2a2a33, [i * 0.11, 0.86, 0]));
  for (const [x, z] of [
    [-0.58, -0.3],
    [0.58, -0.3],
    [-0.58, 0.3],
    [0.58, 0.3],
  ])
    parts.push(P(cyl(0.04, 0.04, 0.3, 6), 0x2e2e38, [x, 0.15, z]));
  return bake(parts);
}

/** 그릴 숯불(발광) */
export function grillCoals(): THREE.Mesh {
  const m = new THREE.Mesh(box(1.2, 0.04, 0.62), MAT.glow);
  m.position.y = 0.81;
  return m;
}

export function counterGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [P(box(1.8, 0.66, 0.72), WOOD_DD, [0, 0.33, 0]), P(box(1.92, 0.1, 0.84), 0xc28e57, [0, 0.71, 0]), P(box(1.92, 0.03, 0.84), 0xdcae78, [0, 0.77, 0])];
  for (let i = 0; i < 6; i++) parts.push(P(box(0.29, 0.5, 0.02), i % 2 ? 0xd94a3a : 0xf6f1e9, [-0.725 + i * 0.29, 0.34, 0.37]));
  return bake(parts);
}

export function forgeGeometry(): THREE.BufferGeometry {
  return bake([
    P(box(0.95, 1.05, 0.9), 0x6d6f7d, [-0.3, 0.52, 0]),
    P(box(1.0, 0.1, 0.95), 0x8a8c9a, [-0.3, 1.08, 0]),
    P(box(0.34, 0.7, 0.34), 0x5a5c68, [-0.4, 1.45, -0.15]),
    P(box(0.52, 0.42, 0.04), 0x2a1a14, [-0.3, 0.42, 0.45]),
    P(box(0.22, 0.24, 0.24), 0x2f3340, [0.55, 0.12, 0.12]),
    P(box(0.5, 0.14, 0.24), 0x454a5c, [0.55, 0.3, 0.12]),
    P(box(0.18, 0.12, 0.18), 0x454a5c, [0.85, 0.32, 0.12]),
  ]);
}

export function forgeFire(): THREE.Mesh {
  const m = new THREE.Mesh(box(0.42, 0.3, 0.02), MAT.glow);
  m.position.set(-0.3, 0.42, 0.47);
  return m;
}

export function hireBoardGeometry(): THREE.BufferGeometry {
  return bake([
    P(cyl(0.05, 0.05, 1.2, 8), WOOD_DD, [-0.4, 0.6, 0]),
    P(cyl(0.05, 0.05, 1.2, 8), WOOD_DD, [0.4, 0.6, 0]),
    P(box(1.05, 0.62, 0.06), WOOD, [0, 1.0, 0.03]),
    P(box(1.05, 0.06, 0.1), 0xffffff, [0, 1.33, 0.03]),
    P(box(0.28, 0.22, 0.01), 0xf6f1e9, [-0.25, 1.0, 0.07]),
    P(box(0.32, 0.3, 0.01), 0xf6f1e9, [0.2, 0.98, 0.07]),
    P(sphere(0.03, 6, 4), 0xd94a3a, [-0.25, 1.1, 0.08]),
    P(sphere(0.03, 6, 4), 0xd94a3a, [0.2, 1.12, 0.08]),
  ]);
}

export function sledGeometry(): THREE.BufferGeometry {
  return bake([
    P(box(1.5, 0.05, 0.06), WOOD_DD, [0, 0.03, 0.3]),
    P(box(1.5, 0.05, 0.06), WOOD_DD, [0, 0.03, -0.3]),
    P(cyl(0.1, 0.1, 0.06, 10, ), WOOD_DD, [0.76, 0.12, 0.3], [Math.PI / 2, 0, 0]),
    P(cyl(0.1, 0.1, 0.06, 10), WOOD_DD, [0.76, 0.12, -0.3], [Math.PI / 2, 0, 0]),
    P(box(1.3, 0.12, 0.7), WOOD, [0, 0.2, 0]),
    P(box(0.8, 0.35, 0.6), 0xd94a3a, [-0.15, 0.42, 0]),
    P(box(0.82, 0.08, 0.62), 0xf6f1e9, [-0.15, 0.62, 0]),
    P(cone(0.12, 0.3, 4), 0xffd166, [0.5, 0.45, 0], [0, 0, -Math.PI / 2]),
  ]);
}

// ───────── 환경 ─────────
export function treeGeometry(): THREE.BufferGeometry {
  return bake([
    P(cyl(0.08, 0.11, 0.4, 7), 0x5e3b1b, [0, 0.2, 0]),
    P(cone(0.62, 0.75, 8), 0x2f6b4f, [0, 0.72, 0]),
    P(cone(0.42, 0.25, 8), 0xf4f8ff, [0, 0.98, 0]),
    P(cone(0.48, 0.62, 8), 0x357a59, [0, 1.15, 0]),
    P(cone(0.32, 0.2, 8), 0xf4f8ff, [0, 1.36, 0]),
    P(cone(0.32, 0.55, 8), 0x3d8a63, [0, 1.55, 0]),
    P(cone(0.16, 0.2, 8), 0xffffff, [0, 1.75, 0]),
  ]);
}

export function rockGeometry(): THREE.BufferGeometry {
  return bake([
    P(new THREE.DodecahedronGeometry(0.32, 0), 0x8a93a6, [0, 0.16, 0], [0.3, 0.6, 0], [1.3, 0.7, 1]),
    P(sphere(0.3, 10, 6), 0xffffff, [0, 0.3, 0], undefined, [1.15, 0.25, 0.85]),
  ]);
}

export function tentGeometry(): THREE.BufferGeometry {
  return bake([
    P(cone(0.95, 1.2, 4), 0xd96c4f, [0, 0.6, 0], [0, Math.PI / 4, 0]),
    P(cone(0.32, 0.3, 4), 0xffffff, [0, 1.07, 0], [0, Math.PI / 4, 0]),
    P(box(0.4, 0.55, 0.02), 0x3a2219, [0, 0.28, 0.66]),
  ]);
}

export function campfireGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    P(cyl(0.06, 0.06, 0.6, 7), WOOD_DD, [0, 0.07, 0], [0, 0.6, Math.PI / 2]),
    P(cyl(0.06, 0.06, 0.6, 7), WOOD_D, [0, 0.12, 0], [0, -0.6, Math.PI / 2]),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(P(new THREE.DodecahedronGeometry(0.08, 0), 0x7a7f8f, [Math.cos(a) * 0.38, 0.05, Math.sin(a) * 0.38]));
  }
  return bake(parts);
}

/** x 방향으로 길이 len 인 울타리 한 줄 */
export function fenceGeometry(len: number): THREE.BufferGeometry {
  const parts: Part[] = [P(box(len, 0.06, 0.05), 0x7a4f2a, [len / 2, 0.22, 0]), P(box(len, 0.06, 0.05), 0x7a4f2a, [len / 2, 0.36, 0])];
  const n = Math.max(1, Math.round(len / 0.6));
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * len;
    parts.push(P(box(0.1, 0.46, 0.1), 0x9c6a3c, [x, 0.23, 0]), P(box(0.12, 0.05, 0.12), 0xffffff, [x, 0.48, 0]));
  }
  return bake(parts);
}

export function gateLockedGeometry(w: number): THREE.BufferGeometry {
  return bake([
    P(box(w, 0.5, 0.08), 0x5e3b1b, [0, 0.27, 0]),
    P(box(w * 1.05, 0.06, 0.1), 0x4a2f15, [0, 0.27, 0.02], [0, 0, 0.22]),
    P(box(w * 1.05, 0.06, 0.1), 0x4a2f15, [0, 0.27, 0.02], [0, 0, -0.22]),
    P(box(0.22, 0.2, 0.08), 0xe0b13a, [0, 0.26, 0.07]),
    P(new THREE.TorusGeometry(0.07, 0.02, 6, 12, Math.PI), 0xe0b13a, [0, 0.36, 0.07]),
  ]);
}

/** 컨베이어 벨트 무늬 텍스처(오프셋을 움직여 흐르는 연출) */
export function beltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2f3240';
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#4a4f63';
  for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 6, 32);
  g.fillStyle = '#ffd166';
  g.beginPath();
  g.moveTo(40, 10);
  g.lineTo(50, 16);
  g.lineTo(40, 22);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 컨베이어 프레임(벨트 제외): x 방향 길이 len */
export function railFrameGeometry(len: number): THREE.BufferGeometry {
  const parts: Part[] = [P(box(len, 0.08, 0.06), 0x9aa3b5, [0, 0.2, 0.22]), P(box(len, 0.08, 0.06), 0x9aa3b5, [0, 0.2, -0.22])];
  const n = Math.max(1, Math.round(len / 0.9));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (i / n) * len;
    parts.push(P(box(0.06, 0.18, 0.06), 0x5d6375, [x, 0.08, 0.2]), P(box(0.06, 0.18, 0.06), 0x5d6375, [x, 0.08, -0.2]));
  }
  return bake(parts);
}

// ───────── 캔버스 텍스처 유틸 ─────────
export function softTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function groundTexture(base: number, speck: number, seed: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex(base);
  g.fillRect(0, 0, 256, 256);
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 160; i++) {
    g.globalAlpha = 0.12 + rnd() * 0.3;
    g.fillStyle = hex(speck);
    g.beginPath();
    g.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 0.6;
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 50; i++) {
    g.beginPath();
    g.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export type ZoneIcon = 'in' | 'out' | 'cash' | 'up' | null;

/** 바닥 존 데칼(점선 둥근 사각형 + 아이콘) */
export function zoneTexture(wPx: number, hPx: number, color: string, active: boolean, icon: ZoneIcon): THREE.CanvasTexture {
  const k = 2;
  const c = document.createElement('canvas');
  c.width = Math.round(wPx * k);
  c.height = Math.round(hPx * k);
  const g = c.getContext('2d')!;
  const pad = 6 * k;
  const w = c.width - pad * 2;
  const h = c.height - pad * 2;
  const r = 16 * k;
  g.beginPath();
  g.roundRect(pad, pad, w, h, r);
  g.fillStyle = color;
  g.globalAlpha = active ? 0.42 : 0.2;
  g.fill();
  g.globalAlpha = active ? 1 : 0.85;
  g.lineWidth = 5 * k;
  g.setLineDash([14 * k, 9 * k]);
  g.strokeStyle = color;
  g.stroke();
  g.setLineDash([]);
  if (icon) {
    g.globalAlpha = active ? 1 : 0.8;
    g.fillStyle = '#ffffff';
    const cx = c.width / 2;
    const cy = c.height / 2;
    const s = Math.min(w, h) * 0.22;
    g.beginPath();
    if (icon === 'in') {
      g.rect(cx - s * 0.22, cy - s, s * 0.44, s);
      g.moveTo(cx - s * 0.7, cy);
      g.lineTo(cx + s * 0.7, cy);
      g.lineTo(cx, cy + s * 0.9);
    } else if (icon === 'out' || icon === 'up') {
      g.rect(cx - s * 0.22, cy, s * 0.44, s);
      g.moveTo(cx - s * 0.7, cy);
      g.lineTo(cx + s * 0.7, cy);
      g.lineTo(cx, cy - s * 0.9);
    } else if (icon === 'cash') {
      g.roundRect(cx - s, cy - s * 0.6, s * 2, s * 1.2, s * 0.2);
    }
    g.closePath();
    g.fill();
    if (icon === 'cash') {
      g.fillStyle = color;
      g.beginPath();
      g.arc(cx, cy, s * 0.38, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
