import { STATION } from '../config/balance';
import type { ItemStack } from '../entities/ItemStack';
import type { Zone } from '../stations/Zone';

export interface Carrier {
  x: number;
  y: number;
  stack: ItemStack;
  transferTimer: number;
  /** 마지막으로 주고받기에 성공한 시각(초) */
  lastTransfer?: number;
  isPlayer?: boolean;
}

export interface TransferTarget {
  zone: Zone;
  enabled(): boolean;
  /** 1개 주고받기 시도. 성공하면 true */
  tryTransfer(c: Carrier): boolean;
}

/** 존 안에 서 있는 운반자(플레이어·직원)와 시설 사이에서 transferInterval 마다 1개씩 주고받는다 */
export class TransferSystem {
  private targets: TransferTarget[] = [];
  private time = 0;

  add(...t: TransferTarget[]): void {
    this.targets.push(...t);
  }

  /** 플레이어가 서 있는 존 하이라이트용 */
  zoneAt(x: number, y: number): TransferTarget | null {
    for (const t of this.targets) if (t.enabled() && t.zone.contains(x, y)) return t;
    return null;
  }

  update(dt: number, carriers: Carrier[]): void {
    this.time += dt;
    for (const c of carriers) {
      c.transferTimer = Math.min(STATION.transferInterval, c.transferTimer + dt);
      if (c.transferTimer < STATION.transferInterval) continue;
      for (const t of this.targets) {
        if (!t.enabled() || !t.zone.contains(c.x, c.y)) continue;
        if (t.tryTransfer(c)) {
          c.transferTimer = 0;
          c.lastTransfer = this.time;
          break;
        }
      }
    }
  }

  get now(): number {
    return this.time;
  }
}
