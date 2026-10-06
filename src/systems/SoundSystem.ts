/**
 * WebAudio로 효과음을 합성한다(외부 사운드 파일 없음).
 * 첫 사용자 입력 이후 unlock() 을 호출해야 모바일에서 소리가 난다.
 */
type Wave = OscillatorType;

class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();
  enabled = true;

  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 0.4);
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private gate(name: string, minGapMs: number): boolean {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return false;
    const now = performance.now();
    const prev = this.last.get(name) ?? 0;
    if (now - prev < minGapMs) return false;
    this.last.set(name, now);
    return true;
  }

  private tone(freq: number, dur: number, type: Wave, vol: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', sweepTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  swing(): void {
    if (!this.gate('swing', 160)) return;
    this.noise(0.16, 0.12, 600, 0.8, 'bandpass', 2400);
  }

  hit(): void {
    if (!this.gate('hit', 45)) return;
    this.tone(180, 0.09, 'square', 0.12, 70);
    this.noise(0.07, 0.18, 1200, 1.2);
  }

  kill(combo = 1): void {
    if (!this.gate('kill', 60)) return;
    this.tone(220, 0.22, 'triangle', 0.22, 60);
    // 콤보가 오를수록 높아지는 '띠링'
    if (combo >= 2) this.tone(520 * Math.pow(1.06, Math.min(combo, 24)), 0.12, 'square', 0.06, undefined, 0.03);
    this.noise(0.18, 0.15, 400, 0.7, 'lowpass');
  }

  pickup(): void {
    if (!this.gate('pickup', 35)) return;
    this.tone(660 + Math.random() * 120, 0.06, 'sine', 0.14, 980);
  }

  drop(): void {
    if (!this.gate('drop', 50)) return;
    this.tone(420, 0.06, 'triangle', 0.1, 300);
  }

  coin(): void {
    if (!this.gate('coin', 45)) return;
    const f = 1250 + Math.random() * 250;
    this.tone(f, 0.08, 'square', 0.05);
    this.tone(f * 1.5, 0.14, 'sine', 0.08, undefined, 0.04);
  }

  pay(): void {
    if (!this.gate('pay', 55)) return;
    this.tone(900 + Math.random() * 100, 0.05, 'triangle', 0.08);
  }

  sell(): void {
    if (!this.gate('sell', 90)) return;
    this.tone(880, 0.08, 'sine', 0.12);
    this.tone(1320, 0.14, 'sine', 0.12, undefined, 0.07);
  }

  unlockFanfare(): void {
    if (!this.gate('fanfare', 400)) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, undefined, i * 0.09));
    this.tone(1568, 0.4, 'sine', 0.1, undefined, 0.36);
  }

  upgrade(): void {
    if (!this.gate('upgrade', 120)) return;
    this.tone(523, 0.1, 'square', 0.07);
    this.tone(784, 0.18, 'square', 0.07, undefined, 0.08);
  }

  deny(): void {
    if (!this.gate('deny', 250)) return;
    this.tone(200, 0.15, 'sawtooth', 0.06, 140);
  }

  angry(): void {
    if (!this.gate('angry', 300)) return;
    this.tone(300, 0.2, 'sawtooth', 0.05, 180);
  }

  click(): void {
    if (!this.gate('click', 40)) return;
    this.tone(700, 0.04, 'square', 0.05);
  }
}

export const sound = new Synth();
