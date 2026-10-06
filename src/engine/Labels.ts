import type { Renderer } from './Renderer';

/**
 * 3D 위치에 붙는 HTML 라벨(숫자, 말풍선, 가격표 등).
 * 매 프레임 화면 좌표로 투영해 transform 만 갱신한다.
 */
export class Label {
  readonly el: HTMLDivElement;
  x = 0;
  y = 0;
  h = 0;
  visible = true;
  /** 세로 기준점(%): -100 = 라벨 아래쪽이 앵커, -50 = 가운데 */
  anchorY = -100;
  private lastHtml = '';
  private shown = true;

  constructor(
    private layer: LabelLayer,
    className: string,
  ) {
    this.el = document.createElement('div');
    this.el.className = `lbl ${className}`;
    layer.root.appendChild(this.el);
    layer.labels.add(this);
  }

  at(x: number, y: number, h: number): this {
    this.x = x;
    this.y = y;
    this.h = h;
    return this;
  }

  html(s: string): this {
    if (s !== this.lastHtml) {
      this.lastHtml = s;
      this.el.innerHTML = s;
    }
    return this;
  }

  text(s: string): this {
    if (s !== this.lastHtml) {
      this.lastHtml = s;
      this.el.textContent = s;
    }
    return this;
  }

  show(v: boolean): this {
    this.visible = v;
    return this;
  }

  /** @internal */
  apply(sx: number, sy: number, onScreen: boolean): void {
    const vis = this.visible && onScreen && this.lastHtml !== '';
    if (vis !== this.shown) {
      this.shown = vis;
      this.el.style.display = vis ? '' : 'none';
    }
    if (vis) this.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, ${this.anchorY}%)`;
  }

  destroy(): void {
    this.el.remove();
    this.layer.labels.delete(this);
  }
}

interface Floater {
  el: HTMLDivElement;
  x: number;
  y: number;
  h: number;
  t: number;
  life: number;
  rise: number;
}

export class LabelLayer {
  readonly root: HTMLDivElement;
  readonly labels = new Set<Label>();
  private floaters: Floater[] = [];
  private pool: HTMLDivElement[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'label-layer';
    parent.appendChild(this.root);
  }

  /** 떠오르며 사라지는 숫자(데미지 등) */
  float(x: number, y: number, h: number, text: string, cls = 'dmg', life = 0.75, rise = 0.9): void {
    if (this.floaters.length > 40) return;
    const el = this.pool.pop() ?? document.createElement('div');
    el.className = `lbl floater ${cls}`;
    el.textContent = text;
    el.style.display = '';
    this.root.appendChild(el);
    this.floaters.push({ el, x, y, h, t: 0, life, rise });
  }

  update(dt: number, r: Renderer): void {
    for (const l of this.labels) {
      if (!l.visible) {
        l.apply(0, 0, false);
        continue;
      }
      const p = r.toScreen(l.x, l.y, l.h);
      l.apply(p.x, p.y, p.onScreen);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        f.el.style.display = 'none';
        this.pool.push(f.el);
        this.floaters.splice(i, 1);
        continue;
      }
      const p = r.toScreen(f.x, f.y, f.h + k * f.rise);
      const sc = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5);
      f.el.style.opacity = `${k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1}`;
      f.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${sc.toFixed(2)})`;
    }
  }
}
