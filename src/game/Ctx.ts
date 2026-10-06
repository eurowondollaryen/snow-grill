import type * as THREE from 'three';
import type { ItemBatch } from '../engine/ItemBatch';
import type { LabelLayer } from '../engine/Labels';
import type { Particles } from '../engine/Particles';
import type { StaticWorld } from '../engine/Physics';
import type { Renderer } from '../engine/Renderer';
import type { Tweens } from '../engine/Tween';
import type { FlySystem } from '../entities/Fly';

/** 엔티티들이 공유하는 엔진 핸들 */
export interface Ctx {
  r: Renderer;
  scene: THREE.Scene;
  batch: ItemBatch;
  labels: LabelLayer;
  fx: Particles;
  tw: Tweens;
  fly: FlySystem;
  world: StaticWorld;
}

export interface V3 {
  x: number;
  y: number;
  z: number;
}
