import { UNLOCK_TRACKS } from '../config/balance';
import { PERKS, applyPerks, type PerkKey } from '../config/perks';
import { STAGE, stageName } from '../config/stages';
import { UPGRADES, describeStat, getStats, type UpgradeKey } from '../config/upgrades';
import { DEBUG, type Game } from '../game/Game';
import type { GameState } from '../systems/GameState';
import { inputState } from '../systems/InputState';
import type { Mission } from '../systems/MissionSystem';
import { sound } from '../systems/SoundSystem';
import { formatNum } from '../utils/math';
import { AvatarEditor } from './AvatarEditor';

const JOY_R = 60;

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** DOM 기반 HUD */
export class Hud {
  private state: GameState;
  private coinsEl!: HTMLElement;
  private chip!: HTMLElement;
  private coinIco!: HTMLElement;
  private gemsEl!: HTMLElement;
  private shownCoins = 0;
  private nextEl!: HTMLElement;
  private banner!: HTMLElement;
  private bannerText = '';
  private missionEl!: HTMLElement;
  private missionKey = '';
  private comboEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private arrow!: HTMLElement;
  private forge!: HTMLElement;
  private forgeRows: { key: UpgradeKey; lv: HTMLElement; val: HTMLElement; btn: HTMLButtonElement }[] = [];
  private modal: HTMLElement | null = null;
  private joyBase!: HTMLElement;
  private joyKnob!: HTMLElement;
  private joyId: number | null = null;
  private joyX = 0;
  private joyY = 0;
  private fps?: HTMLElement;
  private t = 0;
  private fpsAcc = 0;
  private fpsN = 0;

  constructor(
    private root: HTMLElement,
    private game: Game,
  ) {
    this.state = game.state;
    this.shownCoins = this.state.coins;
    this.build();
    const s = this.state;
    s.on('coins', (_c: number, d: number) => {
      if (d > 0) this.bump(this.coinIco);
      if (this.forge.classList.contains('open')) this.refreshForge();
      this.refreshNext();
    });
    s.on('gems', (_g: number, d: number) => {
      this.gemsEl.textContent = formatNum(s.gems);
      if (d > 0) this.bump(this.gemsEl.parentElement!);
    });
    s.on('stats', () => this.refreshForge());
    s.on('forge', (open: boolean) => this.showForge(open));
    s.on('toast', (t: string) => this.toast(t));
    s.on('combo', (n: number, bonus: number) => this.showCombo(n, bonus));
    s.on('offline', (a: number, e: number) => this.showOffline(a, e));
    s.on('unlock', () => this.refreshNext());
    s.on('unlockProgress', () => this.refreshNext());
    s.on('stageClear', () => this.showStageClear());
    s.on('mission', (m: Mission | null) => this.onMission(m));
    s.on('avatar', () => this.renderChip());
    this.refreshNext();
  }

  // ───────────────────────── 구성 ─────────────────────────
  private build(): void {
    const r = this.root;
    // 조이스틱 입력 레이어(맨 아래)
    const touch = h('div', 'touch-layer');
    r.appendChild(touch);
    this.joyBase = h('div', 'joy-base');
    this.joyKnob = h('div', 'joy-knob');
    r.append(this.joyBase, this.joyKnob);
    touch.addEventListener('pointerdown', (e) => this.joyStart(e));
    window.addEventListener('pointermove', (e) => this.joyMove(e));
    window.addEventListener('pointerup', (e) => this.joyEnd(e));
    window.addEventListener('pointercancel', (e) => this.joyEnd(e));
    window.addEventListener('blur', () => this.joyRelease());

    const top = h('div', 'top-bar');
    const chip = h('button', 'chip stage');
    this.chip = chip;
    this.renderChip();
    chip.addEventListener('click', () => this.openEditor());
    const money = h('div', 'money');
    const coin = h('div', 'pill coins', `<i class="coin-ico"></i><span>0</span>`);
    this.coinIco = coin.querySelector('i')!;
    this.coinsEl = coin.querySelector('span')!;
    const gem = h('button', 'pill gems', `<i>💎</i><span>${formatNum(this.state.gems)}</span><em>상점</em>`);
    this.gemsEl = gem.querySelector('span')!;
    gem.addEventListener('click', () => this.openGemShop());
    money.append(coin, gem);
    const gear = h('button', 'icon-btn', '⚙');
    gear.addEventListener('click', () => this.openSettings());
    top.append(chip, money, gear);
    r.appendChild(top);

    this.nextEl = h('div', 'next-line');
    r.appendChild(this.nextEl);
    this.banner = h('div', 'banner');
    r.appendChild(this.banner);
    this.missionEl = h('div', 'mission', `<div class="m-head"><b>미션</b><span class="m-text"></span><span class="m-rew"></span></div><div class="m-bar"><i></i><span></span></div>`);
    r.appendChild(this.missionEl);
    this.comboEl = h('div', 'combo');
    r.appendChild(this.comboEl);
    this.toastEl = h('div', 'toast');
    r.appendChild(this.toastEl);
    this.arrow = h('div', 'edge-arrow');
    r.appendChild(this.arrow);

    // 대장간 패널
    this.forge = h('div', 'sheet forge', `<h3>🔨 대장간 · 능력치 강화</h3>`);
    const list = h('div', 'rows');
    for (const u of UPGRADES) {
      const row = h('div', 'row', `<div class="nm"><b>${u.label}</b><small></small></div><div class="val"></div>`);
      const btn = h('button', 'buy');
      btn.addEventListener('click', () => this.buyUpgrade(u.key));
      row.appendChild(btn);
      list.appendChild(row);
      this.forgeRows.push({ key: u.key, lv: row.querySelector('small')!, val: row.querySelector('.val')!, btn });
    }
    this.forge.appendChild(list);
    r.appendChild(this.forge);

    if (DEBUG) {
      this.fps = h('div', 'debug');
      const b = h('button', 'debug-btn', '+1000 🪙');
      b.addEventListener('click', () => this.game.debugCoins(1000));
      const g = h('button', 'debug-btn gem', '+20 💎');
      g.addEventListener('click', () => this.state.addGems(20));
      r.append(this.fps, b, g);
    }
  }

  private renderChip(): void {
    const d = this.state.data;
    this.chip.innerHTML = `<span class="nm">👤 ${escapeHtml(d.avatar.name)}</span><b>지역 ${d.stage} · ${this.state.stageName} <span class="star">★${d.stars}</span></b>`;
  }

  /** 캐릭터 꾸미기 화면 */
  openEditor(first = false): void {
    if (this.modal || document.querySelector('.avatar-ed')) return;
    sound.unlock();
    sound.click();
    this.joyRelease();
    new AvatarEditor(this.game, { first });
  }

  private bump(el: HTMLElement): void {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  private toast(t: string): void {
    this.toastEl.textContent = t;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private showCombo(n: number, bonus: number): void {
    this.comboEl.innerHTML = `콤보 ×${n}${bonus > 0 ? `<small>보너스 고기 +${bonus}</small>` : ''}`;
    this.comboEl.className = `combo show ${n >= 15 ? 'hot' : n >= 5 ? 'warm' : ''}`;
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('pop');
    clearTimeout((this.comboEl as unknown as { _t?: number })._t);
    (this.comboEl as unknown as { _t?: number })._t = window.setTimeout(() => this.comboEl.classList.remove('show'), 1600);
  }

  private refreshNext(): void {
    const parts: string[] = [];
    for (const t of UNLOCK_TRACKS) {
      const u = this.state.current(t);
      if (u) parts.push(`${u.label} <b>${formatNum(this.state.remaining(t))}</b>`);
    }
    this.nextEl.innerHTML = parts.length ? `다음: ${parts.join(' · ')}` : '모든 해금 완료!';
  }

  private refreshMission(): void {
    const tr = this.game.missions;
    const m = tr.current;
    const key = `${m.index}:${Math.floor(tr.progress)}`;
    if (key === this.missionKey) return;
    this.missionKey = key;
    const p = Math.min(1, tr.progress / m.target);
    this.missionEl.querySelector('.m-text')!.textContent = m.text;
    this.missionEl.querySelector('.m-rew')!.innerHTML = `<i class="coin-ico sm"></i>${formatNum(m.reward)}`;
    (this.missionEl.querySelector('.m-bar i') as HTMLElement).style.width = `${p * 100}%`;
    this.missionEl.querySelector('.m-bar span')!.textContent =
      m.type === 'earn' ? `${Math.floor(p * 100)}%` : `${formatNum(Math.min(tr.progress, m.target))}/${formatNum(m.target)}`;
  }

  private onMission(done: Mission | null): void {
    this.refreshMission();
    if (done) this.bump(this.missionEl);
  }

  // ───────────────────────── 조이스틱 ─────────────────────────
  private joyStart(e: PointerEvent): void {
    sound.unlock();
    if (this.modal || this.joyId !== null || this.game.paused) return;
    this.joyId = e.pointerId;
    this.joyX = e.clientX;
    this.joyY = e.clientY;
    this.joyBase.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    this.joyKnob.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    this.joyBase.classList.add('on');
    this.joyKnob.classList.add('on');
    inputState.joyActive = true;
    inputState.joyX = 0;
    inputState.joyY = 0;
  }

  private joyMove(e: PointerEvent): void {
    if (e.pointerId !== this.joyId) return;
    let dx = e.clientX - this.joyX;
    let dy = e.clientY - this.joyY;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) {
      dx = (dx / d) * JOY_R;
      dy = (dy / d) * JOY_R;
    }
    this.joyKnob.style.transform = `translate(${this.joyX + dx}px, ${this.joyY + dy}px)`;
    const m = Math.min(1, d / JOY_R);
    const dead = 0.12;
    if (m < dead) {
      inputState.joyX = inputState.joyY = 0;
    } else {
      const k = Math.min(1, (m - dead) / (0.55 - dead)) / (d || 1);
      inputState.joyX = (e.clientX - this.joyX) * k;
      inputState.joyY = (e.clientY - this.joyY) * k;
    }
  }

  private joyEnd(e: PointerEvent): void {
    if (e.pointerId === this.joyId) this.joyRelease();
  }

  private joyRelease(): void {
    this.joyId = null;
    this.joyBase.classList.remove('on');
    this.joyKnob.classList.remove('on');
    inputState.joyActive = false;
    inputState.joyX = inputState.joyY = 0;
  }

  // ───────────────────────── 대장간 ─────────────────────────
  private buyUpgrade(key: UpgradeKey): void {
    sound.unlock();
    if (this.state.buyUpgrade(key)) {
      sound.upgrade();
      this.toast(`${UPGRADES.find((u) => u.key === key)!.label} Lv.${this.state.level(key)}!`);
    } else sound.deny();
  }

  private refreshForge(): void {
    const s = this.state.stats;
    const m = this.state.incomeMult;
    for (const r of this.forgeRows) {
      const def = UPGRADES.find((u) => u.key === r.key)!;
      const lv = this.state.level(r.key);
      const cost = this.state.nextCost(r.key);
      r.lv.textContent = `Lv.${lv} / ${def.maxLevel}`;
      if (cost === null) {
        r.val.textContent = describeStat(r.key, s, m);
        r.btn.textContent = 'MAX';
        r.btn.disabled = true;
      } else {
        const next = applyPerks(getStats({ ...this.state.data.levels, [r.key]: lv + 1 }), this.state.data.perks);
        r.val.textContent = `${describeStat(r.key, s, m)} → ${describeStat(r.key, next, m)}`;
        r.btn.innerHTML = `<i class="coin-ico sm"></i>${formatNum(cost)}`;
        r.btn.disabled = this.state.coins < cost;
      }
    }
  }

  private showForge(open: boolean): void {
    if (open) this.refreshForge();
    this.forge.classList.toggle('open', open);
  }

  // ───────────────────────── 모달 ─────────────────────────
  private openModal(html: string, onBuild: (box: HTMLElement, close: () => void) => void): void {
    if (this.modal) return;
    this.joyRelease();
    this.game.paused = true;
    const wrap = h('div', 'modal-wrap');
    const box = h('div', 'modal', html);
    wrap.appendChild(box);
    this.root.appendChild(wrap);
    this.modal = wrap;
    const close = () => {
      wrap.remove();
      this.modal = null;
      this.game.paused = false;
    };
    onBuild(box, close);
  }

  private openSettings(): void {
    sound.unlock();
    sound.click();
    const d = this.state.data;
    this.openModal(
      `<h2>설정</h2><p class="muted">총 판매 ${formatNum(d.lifetime.sold)}개 · 곰 ${formatNum(d.lifetime.kills)}마리 · 거대 곰 ${d.lifetime.bosses}마리</p>
       <button class="big avatar">👤 캐릭터 꾸미기</button><button class="big snd"></button><button class="big red reset">진행 초기화</button><button class="big teal close">닫기</button>
       <p class="muted sm">PC: WASD/방향키 · 모바일: 화면 드래그</p>`,
      (box, close) => {
        (box.querySelector('.avatar') as HTMLButtonElement).onclick = () => {
          close();
          this.openEditor();
        };
        const snd = box.querySelector('.snd') as HTMLButtonElement;
        const label = () => (snd.textContent = `사운드: ${sound.enabled ? '켜짐 🔊' : '꺼짐 🔇'}`);
        label();
        snd.onclick = () => {
          sound.enabled = !sound.enabled;
          this.state.data.sound = sound.enabled;
          label();
          sound.click();
          this.game.save();
        };
        let confirm = false;
        const reset = box.querySelector('.reset') as HTMLButtonElement;
        reset.onclick = () => {
          if (!confirm) {
            confirm = true;
            reset.textContent = '한 번 더 누르면 초기화';
            sound.deny();
            return;
          }
          this.game.resetProgress();
        };
        (box.querySelector('.close') as HTMLButtonElement).onclick = () => {
          sound.click();
          close();
        };
      },
    );
  }

  private openGemShop(): void {
    sound.unlock();
    sound.click();
    this.openModal(`<h2>💎 보석 상점</h2><p class="muted">보석 사냥터의 곰이 떨어뜨린 보석으로 <b>영구</b> 강화! 다음 지역에도 유지돼요.</p><div class="gem-have"></div><div class="perks"></div><button class="big teal close">닫기</button>`, (box, close) => {
      const list = box.querySelector('.perks')!;
      const have = box.querySelector('.gem-have')!;
      const render = () => {
        have.innerHTML = `보유 <b>💎 ${formatNum(this.state.gems)}</b>`;
        list.innerHTML = '';
        for (const p of PERKS) {
          const lv = this.state.perkLevel(p.key);
          const cost = this.state.perkNextCost(p.key);
          const row = h(
            'div',
            'perk',
            `<span class="pi">${p.icon}</span><div class="nm"><b>${p.label}</b><small>${p.desc} · Lv.${lv}/${p.maxLevel}</small></div>`,
          );
          const btn = h('button', 'buy gem');
          btn.innerHTML = cost === null ? 'MAX' : `💎 ${cost}`;
          btn.disabled = cost === null || this.state.gems < cost;
          btn.onclick = () => this.buyPerk(p.key, render);
          row.appendChild(btn);
          list.appendChild(row);
        }
      };
      render();
      (box.querySelector('.close') as HTMLButtonElement).onclick = () => {
        sound.click();
        close();
      };
    });
  }

  private buyPerk(key: PerkKey, render: () => void): void {
    if (this.state.buyPerk(key)) {
      sound.upgrade();
      this.game.save();
    } else sound.deny();
    render();
  }

  private showOffline(amount: number, elapsedMs: number): void {
    const mins = Math.floor(Math.min(elapsedMs, 2 * 3600_000) / 60000);
    const time = mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`;
    this.openModal(
      `<h2>다시 오셨군요!</h2><p class="muted">자리를 비운 ${time} 동안<br>직원과 레일이 일했어요</p><div class="reward"><i class="coin-ico lg"></i>${formatNum(amount)}</div><button class="big teal ok">받기</button>`,
      (box, close) => {
        (box.querySelector('.ok') as HTMLButtonElement).onclick = () => {
          sound.unlock();
          this.state.addCoins(amount);
          sound.coin();
          close();
          this.toast(`+${formatNum(amount)} 코인`);
          this.game.save();
        };
      },
    );
  }

  private showStageClear(): void {
    if (this.modal) return;
    const d = this.state.data;
    const secs = Math.max(0, Math.floor((Date.now() - d.stageStartedAt) / 1000));
    const ns = d.stars + 1;
    sound.unlockFanfare();
    this.openModal(
      `<div class="trophy">🏆</div><h2>${this.state.stageName} 정복!</h2>
       <p class="muted">플레이 시간 ${Math.floor(secs / 60)}분 ${secs % 60}초 · 이번 지역 판매 ${formatNum(d.totalSold)}개</p>
       <div class="stars">★ ${d.stars} → ★ ${ns}</div>
       <p class="teal-t">영구 보너스: 판매 수입 +${Math.round(ns * STAGE.starIncome * 100)}%</p>
       <p><b>다음 지역: ${stageName(d.stage + 1)}</b><br><span class="muted">새로운 곰 · 거대 곰 · 가격과 수입 ×${STAGE.growth}</span></p>
       <p class="muted sm">캠프는 처음부터 다시 짓지만 ★과 💎 보석 강화는 영원히 남아요</p>
       <button class="big pink go">다음 지역으로 출발!</button>`,
      (box) => {
        (box.querySelector('.go') as HTMLButtonElement).onclick = () => {
          sound.click();
          this.game.startNextStage();
        };
      },
    );
  }

  // ───────────────────────── 루프 ─────────────────────────
  update(dt: number): void {
    this.t += dt;
    const target = this.state.coins;
    if (Math.abs(target - this.shownCoins) < 1) this.shownCoins = target;
    else this.shownCoins += (target - this.shownCoins) * (1 - Math.exp(-12 * dt));
    this.coinsEl.textContent = formatNum(Math.round(this.shownCoins));

    const tut = this.game.tutorial;
    const text = this.game.forgeOpen || this.game.paused ? '' : tut.text;
    if (text !== this.bannerText) {
      this.bannerText = text;
      this.banner.textContent = text;
      this.banner.classList.toggle('show', !!text);
    }
    this.refreshMission();
    this.updateArrow(this.game.paused ? null : tut.objective);

    if (this.fps) {
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc >= 0.5) {
        this.fps.textContent = `FPS ${Math.round(this.fpsN / this.fpsAcc)} · ${this.game.debugInfo}`;
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
    }
  }

  private updateArrow(t: { x: number; y: number } | null): void {
    if (!t || this.modal) {
      this.arrow.classList.remove('on');
      return;
    }
    const r = this.game.r;
    const p = r.toScreen(t.x, t.y, 0.5);
    const W = r.width;
    const H = r.height;
    const m = 40;
    if (p.onScreen && p.x > m && p.x < W - m && p.y > 120 && p.y < H - m) {
      this.arrow.classList.remove('on');
      return;
    }
    const cx = W / 2;
    const cy = H / 2;
    const ang = Math.atan2(p.y - cy, p.x - cx);
    const pad = 46;
    const kx = Math.abs(Math.cos(ang)) > 1e-4 ? (W / 2 - pad) / Math.abs(Math.cos(ang)) : Infinity;
    const ky = Math.abs(Math.sin(ang)) > 1e-4 ? (H / 2 - pad - 50) / Math.abs(Math.sin(ang)) : Infinity;
    const k = Math.min(kx, ky);
    const s = 1 + Math.sin(this.t * 8) * 0.08;
    this.arrow.classList.add('on');
    this.arrow.style.transform = `translate(${cx + Math.cos(ang) * k}px, ${cy + 25 + Math.sin(ang) * k}px) rotate(${ang}rad) scale(${s})`;
  }
}

function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
