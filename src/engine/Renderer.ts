import * as THREE from 'three';

/** 게임 좌표(px) → 3D 월드 단위 */
export const S = 0.01;
export const wx = (x: number): number => x * S;
export const wz = (y: number): number => y * S;

const PITCH = THREE.MathUtils.degToRad(54);
const FOV = 42;
/** 화면에 최소한 이만큼의 월드 폭(단위)이 보이도록 카메라 거리를 맞춘다 */
const MIN_VIEW_W = 7.8;
const MIN_VIEW_H = 11.5;

export interface ScreenPoint {
  x: number;
  y: number;
  onScreen: boolean;
}

/** Three.js 렌더러 + 추적 카메라 + 조명/그림자 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private target = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private distance = 18;
  private shakeT = 0;
  private shakeDur = 0;
  private shakeI = 0;
  zoom = 1;
  private zoomTarget = 1;
  /** 카메라 추적 오프셋(px, 화면 위쪽으로 밀기) */
  followOffsetY = 0;
  width = 1;
  height = 1;
  private tmp = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(readonly container: HTMLElement) {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.gl = new THREE.WebGLRenderer({ antialias: !mobile || window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.75 : 2));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    container.appendChild(this.gl.domElement);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 120);
    this.hemi = new THREE.HemisphereLight(0xeaf4ff, 0xb9c6d6, 1.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3e0, 2.1);
    this.sun.castShadow = true;
    const size = mobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -13;
    sc.right = 13;
    sc.top = 13;
    sc.bottom = -13;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.setTheme('#cfe3ef');

    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setTheme(bg: string): void {
    const c = new THREE.Color(bg);
    this.scene.background = c;
    this.scene.fog = new THREE.Fog(c, 26, 55);
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.gl.setSize(w, h);
    this.camera.aspect = w / h;
    // 세로/가로 어느 쪽이든 최소 영역이 보이도록 거리 계산
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const dW = MIN_VIEW_W / (2 * t * this.camera.aspect);
    const dH = MIN_VIEW_H / (2 * t);
    this.distance = THREE.MathUtils.clamp(Math.max(dW, dH), 12, 26);
    this.camera.updateProjectionMatrix();
  }

  /** 즉시 위치 이동(시작 시) */
  snapTo(px: number, py: number): void {
    this.target.set(wx(px), 0, wz(py));
    this.place();
  }

  shake(durationMs: number, intensity: number): void {
    if (this.shakeT <= 0 || intensity >= this.shakeI) this.shakeI = intensity;
    this.shakeDur = durationMs / 1000;
    this.shakeT = this.shakeDur;
  }

  zoomPulse(amount: number): void {
    this.zoomTarget = amount;
    setTimeout(() => (this.zoomTarget = 1), 380);
  }

  update(dt: number, px: number, py: number, bounds: { w: number; h: number }): void {
    // 월드 밖이 너무 보이지 않도록 추적 대상 제한
    const halfW = Math.max(0, bounds.w * S / 2 - 3.2);
    const cx = THREE.MathUtils.clamp(wx(px), bounds.w * S / 2 - halfW, bounds.w * S / 2 + halfW);
    const cz = THREE.MathUtils.clamp(wz(py) - this.followOffsetY * S, 2.5, bounds.h * S - 2.5);
    this.desired.set(cx, 0, cz);
    this.target.lerp(this.desired, 1 - Math.exp(-8 * dt));
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-10 * dt));
    if (this.shakeT > 0) this.shakeT -= dt;
    this.place();
  }

  private place(): void {
    const d = this.distance / this.zoom;
    const c = this.camera;
    c.position.set(this.target.x, this.target.y + Math.sin(PITCH) * d, this.target.z + Math.cos(PITCH) * d);
    if (this.shakeT > 0) {
      const k = (this.shakeT / this.shakeDur) * this.shakeI * 28;
      c.position.x += (Math.random() - 0.5) * k;
      c.position.y += (Math.random() - 0.5) * k;
    }
    c.lookAt(this.target.x, this.target.y, this.target.z);
    this.sun.position.set(this.target.x - 7, 16, this.target.z + 5);
    this.sun.target.position.copy(this.target);
  }

  render(): void {
    this.gl.render(this.scene, this.camera);
  }

  /** 월드(px, 높이 h 단위) → 화면 CSS 픽셀 */
  toScreen(px: number, py: number, h = 0): ScreenPoint {
    this.tmp.set(wx(px), h, wz(py)).project(this.camera);
    const x = (this.tmp.x * 0.5 + 0.5) * this.width;
    const y = (-this.tmp.y * 0.5 + 0.5) * this.height;
    const onScreen = this.tmp.z < 1 && x > -40 && x < this.width + 40 && y > -40 && y < this.height + 40;
    return { x, y, onScreen };
  }

  /** 화면에 보이는 지면 영역(px) — 스폰 위치 판정용 */
  viewRect(): { x: number; y: number; right: number; bottom: number } {
    const pts: THREE.Vector3[] = [];
    for (const [sx, sy] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      this.ray.setFromCamera(new THREE.Vector2(sx, sy), this.camera);
      const p = new THREE.Vector3();
      if (this.ray.ray.intersectPlane(this.ground, p)) pts.push(p);
    }
    if (pts.length === 0) return { x: 0, y: 0, right: 0, bottom: 0 };
    const xs = pts.map((p) => p.x / S);
    const ys = pts.map((p) => p.z / S);
    return { x: Math.min(...xs), y: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }
}
