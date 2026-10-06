/**
 * 경제 관련 순수 함수 + 수입 추적기. Phaser 의존성 없음.
 */
import { BUYZONE, INCOME, OFFLINE } from '../config/balance';
import { meatPriceFor } from '../config/upgrades';

/** 구운 고기 n개 판매 금액 */
export function saleValue(count: number, priceLevel: number): number {
  return Math.max(0, Math.floor(count)) * meatPriceFor(priceLevel);
}

/** 구매 존 결제 속도(코인/초). 가격과 무관하게 min~max초 안에 완료되도록 한다. */
export function buyZoneRate(price: number): number {
  const duration = Math.min(BUYZONE.maxDuration, Math.max(BUYZONE.minDuration, BUYZONE.baseDuration));
  return Math.max(1, price / duration);
}

/**
 * 오프라인 보상: 경과 시간(분) × 분당 기대 수익 × 0.3, 최대 2시간분.
 * 직원이 없거나 1분 미만이면 0.
 */
export function offlineReward(elapsedMs: number, incomePerMin: number, hasStaff: boolean): number {
  if (!hasStaff || !(elapsedMs > 0) || !(incomePerMin > 0)) return 0;
  const minutes = elapsedMs / 60000;
  if (minutes < OFFLINE.minMinutes) return 0;
  return Math.floor(Math.min(minutes, OFFLINE.maxMinutes) * incomePerMin * OFFLINE.factor);
}

/** 매출을 일정 구간마다 모아 분당 수익을 지수 평활로 추정 */
export class IncomeTracker {
  perMin: number;
  private bucket = 0;
  private elapsed = 0;

  constructor(initialPerMin = 0) {
    this.perMin = initialPerMin;
  }

  record(amount: number): void {
    this.bucket += amount;
  }

  tick(dt: number): void {
    this.elapsed += dt;
    if (this.elapsed >= INCOME.bucketSeconds) {
      const rate = (this.bucket / this.elapsed) * 60;
      this.perMin = this.perMin === 0 ? rate : this.perMin + (rate - this.perMin) * INCOME.smoothing;
      this.bucket = 0;
      this.elapsed = 0;
    }
  }
}
