import * as THREE from 'three';
import { MAT, itemGeometry } from './models';

export type ItemKind = 'raw' | 'cut' | 'cooked' | 'coin' | 'gem';
const KINDS: ItemKind[] = ['raw', 'cut', 'cooked', 'coin', 'gem'];

/**
 * 고기·코인·보석을 종류별 InstancedMesh 하나로 그린다.
 * 매 프레임 begin() → add()... → end() 로 다시 채운다(수백 개도 드로우콜 5개).
 */
export class ItemBatch {
  private meshes = new Map<ItemKind, THREE.InstancedMesh>();
  private counts = new Map<ItemKind, number>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(scene: THREE.Scene, max = 1500) {
    for (const k of KINDS) {
      const mat = k === 'gem' ? new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1a6f8a }) : MAT.vc;
      const im = new THREE.InstancedMesh(itemGeometry(k), mat, max);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
      this.meshes.set(k, im);
      this.counts.set(k, 0);
    }
  }

  begin(): void {
    for (const k of KINDS) this.counts.set(k, 0);
  }

  /** x,y,z = 3D 월드 단위 */
  add(kind: ItemKind, x: number, y: number, z: number, rotY = 0, scale = 1, tilt = 0): void {
    const im = this.meshes.get(kind)!;
    const i = this.counts.get(kind)!;
    if (i >= im.instanceMatrix.count) return;
    this.e.set(tilt, rotY, 0);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(scale, scale, scale);
    this.m.compose(this.p, this.q, this.s);
    im.setMatrixAt(i, this.m);
    this.counts.set(kind, i + 1);
  }

  end(): void {
    for (const k of KINDS) {
      const im = this.meshes.get(k)!;
      im.count = this.counts.get(k)!;
      im.instanceMatrix.needsUpdate = true;
    }
  }
}
