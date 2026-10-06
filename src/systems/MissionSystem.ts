/**
 * 끝없이 이어지는 미션. 하나를 끝내면 바로 다음 미션이 나온다. Phaser 의존성 없음.
 */
import { MISSION } from '../config/balance';
import { stageMult } from '../config/stages';

export type MissionType = (typeof MISSION.cycle)[number];

export interface Mission {
  index: number;
  type: MissionType;
  target: number;
  reward: number;
  text: string;
}

export interface MissionSave {
  index: number;
  progress: number;
}

const fmt = (n: number) => Math.floor(n).toLocaleString('ko-KR');

/** index 번째 미션 생성(결정적) */
export function makeMission(index: number, stage: number): Mission {
  const type = MISSION.cycle[index % MISSION.cycle.length];
  const round = Math.floor(index / MISSION.cycle.length);
  const m = stageMult(stage);
  switch (type) {
    case 'kill': {
      const c = MISSION.kill;
      const target = c.base + c.perRound * round;
      return { index, type, target, reward: Math.round(target * c.reward * m), text: `곰 ${target}마리 사냥` };
    }
    case 'sell': {
      const c = MISSION.sell;
      const target = c.base + c.perRound * round;
      return { index, type, target, reward: Math.round(target * c.reward * m), text: `구운 고기 ${target}개 판매` };
    }
    case 'combo': {
      const c = MISSION.combo;
      const target = Math.min(c.max, c.base + c.perRound * round);
      return { index, type, target, reward: Math.round(target * c.reward * m), text: `콤보 ×${target} 달성` };
    }
    case 'earn': {
      const c = MISSION.earn;
      const target = Math.round(c.base * Math.pow(c.growth, round) * m);
      return { index, type, target, reward: Math.round(target * c.rewardRatio), text: `코인 ${fmt(target)} 벌기` };
    }
    case 'boss':
      return { index, type, target: 1, reward: Math.round(MISSION.boss.reward * m * (1 + round * 0.5)), text: '거대 곰 처치' };
    case 'upgrade': {
      const c = MISSION.upgrade;
      const target = c.base + c.perRound * round;
      return { index, type, target, reward: Math.round(target * c.reward * m), text: `대장간 강화 ${target}회` };
    }
  }
}

export class MissionTracker {
  current: Mission;
  progress: number;

  constructor(
    save: MissionSave,
    private stage: number,
    private onComplete: (m: Mission) => void,
  ) {
    this.current = makeMission(save.index, stage);
    this.progress = Math.min(save.progress, this.current.target);
  }

  /** combo 는 '최고값', 나머지는 누적 */
  track(type: MissionType, amount: number): void {
    if (this.current.type !== type || amount <= 0) return;
    this.progress = type === 'combo' ? Math.max(this.progress, amount) : this.progress + amount;
    if (this.progress >= this.current.target) {
      const done = this.current;
      this.current = makeMission(done.index + 1, this.stage);
      this.progress = 0;
      this.onComplete(done);
    }
  }

  get save(): MissionSave {
    return { index: this.current.index, progress: this.progress };
  }
}
