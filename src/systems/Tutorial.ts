import { UNLOCK_TRACKS, type Point, type UnlockDef } from '../config/balance';
import type { Player } from '../entities/Player';
import type { BuyZone } from '../stations/BuyZone';
import type { Counter } from '../stations/Counter';
import type { Station } from '../stations/Station';
import { formatNum } from '../utils/math';
import type { GameState } from './GameState';

export interface TutorialFlags {
  bearKilled: boolean;
  butcherIn: boolean;
  grillIn: boolean;
  counterIn: boolean;
  sold: boolean;
  coinsCollected: boolean;
}

export interface TutorialCtx {
  state: GameState;
  player: Player;
  butcher: Station;
  grill: Station;
  counter: Counter;
  staffZone: BuyZone;
  nearestBear(): Point | null;
  nearestPickup(): Point | null;
  boss(): Point | null;
  flags: TutorialFlags;
}

interface Step {
  text: () => string;
  target: () => Point | null;
  done: () => boolean;
}

/** 첫 실행 튜토리얼(3.11) + 이후 목표 안내 */
export class Tutorial {
  private steps: Step[];
  objective: Point | null = null;
  text = '';

  constructor(private ctx: TutorialCtx) {
    const c = ctx;
    const holds = (t: string) => !c.player.stack.empty && c.player.stack.type === t;
    this.steps = [
      {
        text: () => '사냥터로 올라가 곰에게 다가가세요! 도끼가 자동으로 공격해요',
        target: () => c.nearestBear(),
        done: () => c.flags.bearKilled || holds('raw'),
      },
      {
        text: () => '떨어진 생고기를 주우세요',
        target: () => c.nearestPickup() ?? c.nearestBear(),
        done: () => holds('raw') || c.flags.butcherIn,
      },
      {
        text: () => '정육대 왼쪽 존에 서서 생고기를 넣으세요',
        target: () => c.butcher.inputPoint,
        done: () => c.flags.butcherIn,
      },
      {
        text: () => (holds('raw') ? '생고기를 모두 넣어야 다른 고기를 들 수 있어요' : '정육대 오른쪽 존에서 손질 고기를 꺼내세요'),
        target: () => (holds('raw') ? c.butcher.inputPoint : c.butcher.outputPoint),
        done: () => holds('cut') || c.flags.grillIn,
      },
      {
        text: () => '그릴 왼쪽 존에 손질 고기를 넣으세요',
        target: () => c.grill.inputPoint,
        done: () => c.flags.grillIn,
      },
      {
        text: () => (holds('cut') ? '손질 고기를 모두 그릴에 넣으세요' : '그릴 오른쪽 존에서 구운 고기를 꺼내세요'),
        target: () => (holds('cut') ? c.grill.inputPoint : c.grill.outputPoint),
        done: () => holds('cooked') || c.flags.counterIn,
      },
      {
        text: () => '판매대 왼쪽 존에 구운 고기를 진열하세요',
        target: () => c.counter.inputZone.center,
        done: () => c.flags.counterIn,
      },
      {
        text: () => '판매대 오른쪽 계산 존에 서 있어야 손님이 결제해요',
        target: () => c.counter.cashierZone.center,
        done: () => c.flags.sold,
      },
      {
        text: () => '돈더미에 다가가 코인을 주우세요',
        target: () => c.counter.pile.pos,
        done: () => c.flags.coinsCollected,
      },
      {
        text: () => {
          const r = c.state.remaining('staff');
          return c.state.coins >= r
            ? '고용 게시판 앞 구매 존에 서서 계산원을 고용하세요!'
            : `코인 ${formatNum(r)}개를 모아 계산원을 고용하세요 (보유 ${formatNum(c.state.coins)})`;
        },
        target: () => c.staffZone.center,
        done: () => c.state.isUnlocked('cashier'),
      },
    ];
  }

  get finished(): boolean {
    return this.ctx.state.data.tutorialStep >= this.steps.length;
  }

  update(): void {
    const s = this.ctx.state;
    if (!this.finished) {
      let step = this.steps[s.data.tutorialStep];
      while (step && step.done()) {
        s.setTutorialStep(s.data.tutorialStep + 1);
        step = this.steps[s.data.tutorialStep];
        if (!step) s.toast('튜토리얼 완료! 캠프를 키워보세요');
      }
      if (step) {
        this.text = step.text();
        this.objective = step.target();
        return;
      }
    }
    // 튜토리얼 이후: 살 수 있는 해금 중 가장 싼 것을 안내
    let best: UnlockDef | null = null;
    for (const t of UNLOCK_TRACKS) {
      const u = s.current(t);
      if (u && s.coins >= s.remaining(t) && (!best || s.remaining(t) < s.remaining(best.track))) best = u;
    }
    const boss = this.ctx.boss();
    if (best) {
      this.text = best.track === 'stage' ? '다음 지역으로 떠날 준비 완료!' : `${best.label} 가능!`;
      this.objective = best.pos;
    } else if (boss) {
      this.text = '⚠ 거대 곰 출현! 잡으면 고기 대량';
      this.objective = boss;
    } else {
      this.text = '';
      this.objective = null;
    }
  }
}
