import * as THREE from 'three';
import { NAME_MAX, PALETTE, cleanName, type Avatar, type HatStyle } from '../config/avatar';
import { buildAvatarModel } from '../engine/avatarModel';
import type { Game } from '../game/Game';
import { sound } from '../systems/SoundSystem';
import { canvasFromUrl, defaultView, extractColors, loadPhoto, renderFace, toDataUrl, type CropView } from './photo';

type ColorKey = 'skin' | 'hair' | 'coat' | 'scarf' | 'hat';

const COLOR_ROWS: { key: ColorKey; label: string; palette: number[] }[] = [
  { key: 'skin', label: '피부', palette: PALETTE.skin },
  { key: 'hair', label: '머리', palette: PALETTE.hair },
  { key: 'coat', label: '코트', palette: PALETTE.cloth },
  { key: 'scarf', label: '목도리', palette: PALETTE.cloth },
  { key: 'hat', label: '모자', palette: PALETTE.cloth },
];

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const CROP = 220;

/**
 * 캐릭터 꾸미기: 사진 얼굴 · 색 · 모자 · 이름. 3D 미리보기가 실시간으로 바뀐다.
 * 사진은 이 기기에만 저장된다.
 */
export class AvatarEditor {
  private av: Avatar;
  private wrap!: HTMLElement;
  private src: HTMLCanvasElement | null = null;
  private view: CropView | null = null;
  private photoChanged = false;
  private cropCanvas!: HTMLCanvasElement;
  private preview!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  private model: THREE.Group | null = null;
  private faceCanvas = document.createElement('canvas');
  private faceTex = new THREE.CanvasTexture(this.faceCanvas);
  private raf = 0;
  private dirty = true;
  private faceDirty = true;
  private yaw = 0;
  private dragYaw: number | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch0 = 0;
  private closed = false;

  constructor(
    private game: Game,
    private opts: { first?: boolean; onClose?: () => void } = {},
  ) {
    this.av = { ...game.state.data.avatar };
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.build();
    const url = game.faceUrl;
    if (url && this.av.photo) {
      void canvasFromUrl(url).then((c) => {
        if (this.closed) return;
        this.src = c;
        this.view = { cx: c.width / 2, cy: c.height / 2, r: c.width / 2 };
        this.faceDirty = this.dirty = true;
        this.drawCrop();
        this.syncPhotoUi();
      });
    }
    this.syncPhotoUi();
    this.loop();
  }

  // ───────────────────────── UI ─────────────────────────
  private build(): void {
    this.game.paused = true;
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.innerHTML = `
      <div class="modal avatar-ed">
        <h2>${this.opts.first ? '나만의 캐릭터 만들기' : '캐릭터 꾸미기'}</h2>
        <div class="ed-top">
          <div class="pv"><canvas class="pv-c"></canvas><small>드래그해서 돌려보기</small></div>
          <div class="crop">
            <canvas class="crop-c" width="${CROP}" height="${CROP}"></canvas>
            <div class="crop-empty">사진을 올리면<br>얼굴이 캐릭터에<br>입혀져요</div>
            <input class="zoom" type="range" min="0.25" max="3" step="0.01" value="1" aria-label="확대">
          </div>
        </div>
        <div class="photo-btns">
          <label class="btn-s">🖼️ 사진 선택<input type="file" accept="image/*" class="f-pick" hidden></label>
          <label class="btn-s">🤳 셀카 찍기<input type="file" accept="image/*" capture="user" class="f-cam" hidden></label>
          <button class="btn-s ghost rm">사진 빼기</button>
        </div>
        <div class="photo-opts">
          <label class="chk"><input type="checkbox" class="toon"> 툰 필터(게임 그림체에 맞추기)</label>
          <button class="btn-s ghost auto">🎨 사진에서 색 가져오기</button>
        </div>
        <p class="hint">원 안에 얼굴이 오도록 사진을 끌고, 슬라이더로 크기를 맞춰요. 사진은 이 기기에만 저장돼요.</p>
        <label class="name-row">이름<input class="name" maxlength="${NAME_MAX}" placeholder="캐릭터 이름" autocomplete="off"></label>
        <div class="hat-row"><span>모자</span><div class="seg">
          <button data-h="beanie">비니</button><button data-h="fur">털모자</button><button data-h="none">없음(머리카락)</button>
        </div></div>
        <div class="colors"></div>
        <div class="ed-actions">
          <button class="big ghost cancel">${this.opts.first ? '나중에 할게요' : '취소'}</button>
          <button class="big teal save">완료!</button>
        </div>
      </div>`;
    document.getElementById('hud')!.appendChild(w);
    this.wrap = w;
    const q = <T extends Element>(s: string) => w.querySelector(s) as T;

    // 3D 미리보기
    const pv = q<HTMLCanvasElement>('.pv-c');
    this.preview = new THREE.WebGLRenderer({ canvas: pv, antialias: true, alpha: true });
    this.preview.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.preview.outputColorSpace = THREE.SRGBColorSpace;
    this.preview.setSize(150, 190, false);
    this.camera.aspect = 150 / 190;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 0.95, 2.6);
    this.camera.lookAt(0, 0.62, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c6d6, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(1.5, 2, 2.5);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), new THREE.MeshBasicMaterial({ color: 0x1d3557, transparent: true, opacity: 0.12 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    pv.addEventListener('pointerdown', (e) => {
      this.dragYaw = e.clientX;
      pv.setPointerCapture(e.pointerId);
    });
    pv.addEventListener('pointermove', (e) => {
      if (this.dragYaw === null) return;
      this.yaw += (e.clientX - this.dragYaw) * 0.02;
      this.dragYaw = e.clientX;
    });
    pv.addEventListener('pointerup', () => (this.dragYaw = null));

    // 크롭
    this.cropCanvas = q<HTMLCanvasElement>('.crop-c');
    const zoom = q<HTMLInputElement>('.zoom');
    this.cropCanvas.addEventListener('pointerdown', (e) => {
      this.cropCanvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) this.pinch0 = this.pinchDist();
    });
    this.cropCanvas.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev || !this.view || !this.src) return;
      if (this.pointers.size === 1) {
        const k = (this.view.r * 2) / this.cropCanvas.getBoundingClientRect().width / 0.8;
        this.view.cx -= (e.clientX - prev.x) * k;
        this.view.cy -= (e.clientY - prev.y) * k;
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2 && this.pinch0 > 0) {
        const d = this.pinchDist();
        this.view.r = this.clampR(this.view.r * (this.pinch0 / d));
        this.pinch0 = d;
      }
      this.onCropChange();
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinch0 = 0;
    };
    this.cropCanvas.addEventListener('pointerup', up);
    this.cropCanvas.addEventListener('pointercancel', up);
    this.cropCanvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.view) return;
        e.preventDefault();
        this.view.r = this.clampR(this.view.r * (e.deltaY > 0 ? 1.08 : 0.92));
        this.onCropChange();
      },
      { passive: false },
    );
    zoom.addEventListener('input', () => {
      if (!this.view || !this.src) return;
      const base = Math.min(this.src.width, this.src.height) * 0.4;
      this.view.r = this.clampR(base / Number(zoom.value));
      this.onCropChange(false);
    });

    // 사진 버튼
    const onFile = async (input: HTMLInputElement) => {
      const f = input.files?.[0];
      input.value = '';
      if (!f) return;
      try {
        this.src = await loadPhoto(f);
        this.view = defaultView(this.src);
        this.av.photo = true;
        this.photoChanged = true;
        zoom.value = '1';
        this.autoColors(false);
        this.onCropChange();
        this.syncPhotoUi();
        sound.click();
      } catch {
        alert('사진을 불러오지 못했어요. 다른 사진을 골라 주세요.');
      }
    };
    q<HTMLInputElement>('.f-pick').addEventListener('change', (e) => void onFile(e.target as HTMLInputElement));
    q<HTMLInputElement>('.f-cam').addEventListener('change', (e) => void onFile(e.target as HTMLInputElement));
    q<HTMLButtonElement>('.rm').addEventListener('click', () => {
      this.src = null;
      this.view = null;
      this.av.photo = false;
      this.photoChanged = true;
      this.dirty = true;
      this.drawCrop();
      this.syncPhotoUi();
    });
    const toon = q<HTMLInputElement>('.toon');
    toon.checked = this.av.toon;
    toon.addEventListener('change', () => {
      this.av.toon = toon.checked;
      this.photoChanged = !!this.src;
      this.faceDirty = this.dirty = true;
    });
    q<HTMLButtonElement>('.auto').addEventListener('click', () => this.autoColors(true));

    // 이름
    const name = q<HTMLInputElement>('.name');
    name.value = this.av.name;
    name.addEventListener('input', () => (this.av.name = name.value));
    name.addEventListener('keydown', (e) => e.stopPropagation());

    // 모자
    w.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) =>
      b.addEventListener('click', () => {
        this.av.hatStyle = b.dataset.h as HatStyle;
        this.syncSeg();
        this.dirty = true;
        sound.click();
      }),
    );
    this.syncSeg();

    // 색
    this.renderColors();

    // 완료/취소
    q<HTMLButtonElement>('.save').addEventListener('click', () => this.save());
    q<HTMLButtonElement>('.cancel').addEventListener('click', () => {
      if (this.opts.first) {
        this.av = { ...this.game.state.data.avatar, created: true };
        this.game.applyAvatar(this.av, undefined);
      }
      this.close();
    });
  }

  private pinchDist(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  private clampR(r: number): number {
    if (!this.src) return r;
    const s = Math.min(this.src.width, this.src.height);
    return Math.max(s * 0.08, Math.min(s * 1.2, r));
  }

  private onCropChange(syncSlider = true): void {
    this.photoChanged = true;
    this.faceDirty = this.dirty = true;
    this.drawCrop();
    if (syncSlider && this.view && this.src) {
      const base = Math.min(this.src.width, this.src.height) * 0.4;
      (this.wrap.querySelector('.zoom') as HTMLInputElement).value = String(base / this.view.r);
    }
  }

  private syncPhotoUi(): void {
    const has = !!this.src;
    this.wrap.querySelector('.crop')!.classList.toggle('has', has);
    (this.wrap.querySelector('.rm') as HTMLButtonElement).disabled = !has;
    (this.wrap.querySelector('.auto') as HTMLButtonElement).disabled = !has;
  }

  private syncSeg(): void {
    this.wrap.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.h === this.av.hatStyle));
  }

  private renderColors(): void {
    const box = this.wrap.querySelector('.colors')!;
    box.innerHTML = '';
    for (const row of COLOR_ROWS) {
      const r = document.createElement('div');
      r.className = 'c-row';
      r.innerHTML = `<span>${row.label}</span>`;
      const sw = document.createElement('div');
      sw.className = 'sw';
      for (const c of row.palette) {
        const b = document.createElement('button');
        b.style.background = hex(c);
        b.classList.toggle('on', this.av[row.key] === c);
        b.addEventListener('click', () => this.setColor(row.key, c));
        sw.appendChild(b);
      }
      const custom = document.createElement('input');
      custom.type = 'color';
      custom.value = hex(this.av[row.key]);
      custom.title = '직접 고르기';
      custom.addEventListener('input', () => this.setColor(row.key, parseInt(custom.value.slice(1), 16), false));
      sw.appendChild(custom);
      r.appendChild(sw);
      box.appendChild(r);
    }
  }

  private setColor(key: ColorKey, c: number, rerender = true): void {
    this.av[key] = c;
    this.dirty = true;
    if (rerender) this.renderColors();
  }

  private autoColors(announce: boolean): void {
    if (!this.src || !this.view) return;
    const c = extractColors(this.src, this.view);
    if (c.skin !== null) this.av.skin = c.skin;
    if (c.hair !== null) this.av.hair = c.hair;
    if (c.coat !== null) this.av.coat = c.coat;
    this.dirty = true;
    this.renderColors();
    if (announce) sound.upgrade();
  }

  // ───────────────────────── 그리기 ─────────────────────────
  private drawCrop(): void {
    const g = this.cropCanvas.getContext('2d')!;
    const S = CROP;
    g.clearRect(0, 0, S, S);
    if (!this.src || !this.view) return;
    // 원(지름 80%)이 크롭 영역이 되도록 원본을 배치
    const k = (S * 0.8) / (this.view.r * 2);
    g.save();
    g.translate(S / 2, S / 2);
    g.scale(k, k);
    g.drawImage(this.src, -this.view.cx, -this.view.cy);
    g.restore();
    g.fillStyle = 'rgba(11,22,38,0.55)';
    g.beginPath();
    g.rect(0, 0, S, S);
    g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2, true);
    g.fill();
    g.strokeStyle = '#ffd166';
    g.lineWidth = 3;
    g.setLineDash([8, 6]);
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
    g.stroke();
  }

  private rebuild(): void {
    if (this.faceDirty) {
      this.faceDirty = false;
      if (this.src && this.view) {
        const f = renderFace(this.src, this.view, 192, this.av.toon);
        this.faceCanvas.width = f.width;
        this.faceCanvas.height = f.height;
        this.faceCanvas.getContext('2d')!.drawImage(f, 0, 0);
        this.faceTex.needsUpdate = true;
      }
    }
    if (this.model) {
      this.scene.remove(this.model);
      this.model.userData.dispose?.();
    }
    const av = { ...this.av, photo: this.av.photo && !!this.src };
    this.model = buildAvatarModel(av, av.photo ? this.faceTex : null);
    this.scene.add(this.model);
  }

  private loop = (): void => {
    if (this.closed) return;
    if (this.dirty) {
      this.dirty = false;
      this.rebuild();
    }
    if (this.dragYaw === null) this.yaw = Math.sin(performance.now() / 1400) * 0.6;
    if (this.model) this.model.rotation.y = this.yaw;
    this.preview.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  // ───────────────────────── 저장 ─────────────────────────
  private save(): void {
    sound.unlock();
    this.av.name = cleanName(this.av.name);
    let face: string | null | undefined = undefined;
    if (this.photoChanged) face = this.src && this.view && this.av.photo ? toDataUrl(renderFace(this.src, this.view, 256, this.av.toon)) : null;
    this.game.applyAvatar({ ...this.av, created: true }, face);
    sound.unlockFanfare();
    this.game.state.toast(`반가워요, ${this.av.name}!`);
    this.close();
  }

  private close(): void {
    this.closed = true;
    cancelAnimationFrame(this.raf);
    if (this.model) this.model.userData.dispose?.();
    this.faceTex.dispose();
    this.preview.dispose();
    this.preview.forceContextLoss();
    this.wrap.remove();
    this.game.paused = false;
    this.opts.onClose?.();
  }
}
