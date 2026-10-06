import * as THREE from 'three';
import type { Avatar } from '../config/avatar';
import { MAT, faceCapGeometry, personGeometry } from './models';

let capGeo: THREE.BufferGeometry | null = null;

/** 얼굴 사진 data URL → 텍스처 */
export function faceTexture(url: string): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * 커스터마이징된 주인공 모델(몸 + 선택적 사진 얼굴).
 * 반환 그룹의 userData.dispose() 로 정리한다.
 */
export function buildAvatarModel(av: Avatar, face: THREE.Texture | null): THREE.Group {
  const g = new THREE.Group();
  const usePhoto = av.photo && !!face;
  const geo = personGeometry({
    coat: av.coat,
    hat: av.hat,
    scarf: av.scarf,
    skin: av.skin,
    hair: av.hair,
    hatStyle: av.hatStyle,
    noFace: usePhoto,
  });
  const body = new THREE.Mesh(geo, MAT.vc);
  body.castShadow = true;
  g.add(body);
  let capMat: THREE.MeshLambertMaterial | null = null;
  if (usePhoto) {
    capMat = new THREE.MeshLambertMaterial({ map: face, transparent: true, alphaTest: 0.03 });
    const cap = new THREE.Mesh((capGeo ??= faceCapGeometry()), capMat);
    g.add(cap);
  }
  g.userData.dispose = () => {
    geo.dispose();
    capMat?.dispose();
  };
  return g;
}
