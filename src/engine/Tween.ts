export type Ease = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inQuad: (t: number) => t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

interface Tw {
  t: number;
  dur: number;
  delay: number;
  ease: Ease;
  fn: (k: number) => void;
  done?: () => void;
}

/** 아주 작은 트윈 관리자(초 단위) */
export class Tweens {
  private list: Tw[] = [];

  add(dur: number, fn: (k: number) => void, ease: Ease = Ease.outQuad, done?: () => void, delay = 0): void {
    this.list.push({ t: 0, dur, delay, ease, fn, done });
    if (delay <= 0) fn(ease(0));
  }

  delay(sec: number, done: () => void): void {
    this.list.push({ t: 0, dur: 0, delay: sec, ease: Ease.linear, fn: () => {}, done });
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i];
      if (w.delay > 0) {
        w.delay -= dt;
        if (w.delay > 0) continue;
      }
      w.t += dt;
      const k = w.dur <= 0 ? 1 : Math.min(1, w.t / w.dur);
      w.fn(w.ease(k));
      if (k >= 1) {
        this.list.splice(i, 1);
        w.done?.();
      }
    }
  }
}
