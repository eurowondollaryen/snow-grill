import { LAYOUT, WORLD, type Point } from '../config/balance';

const GATE_TOP: Point = { x: WORLD.gateX, y: WORLD.fenceAY - 50 };
const GATE_BOTTOM: Point = { x: WORLD.gateX, y: WORLD.fenceAY + 50 };

function laneAbove(y: number): number | null {
  let best: number | null = null;
  for (const l of LAYOUT.lanes) if (l < y - 40 && (best === null || l > best)) best = l;
  return best;
}

function laneBelow(y: number): number | null {
  let best: number | null = null;
  for (const l of LAYOUT.lanes) if (l > y + 40 && (best === null || l < best)) best = l;
  return best;
}

/** 캠프 안 이동: 시설 사이 가로 통로를 이용해 시설 몸체를 피한다 */
function campRoute(a: Point, b: Point): Point[] {
  // 같은 존 근처라면 직선, 그 외에는 통로 경유(시설 몸체 관통 방지)
  if (Math.abs(a.y - b.y) < 40 && Math.abs(a.x - b.x) < 90) return [b];
  const onLane = LAYOUT.lanes.find((l) => Math.abs(l - b.y) < 30);
  const lane = onLane ?? (b.y > a.y + 40 ? laneAbove(b.y) : laneBelow(b.y));
  if (lane === null) return [b];
  return [
    { x: a.x, y: lane },
    { x: b.x, y: lane },
    b,
  ];
}

/** 직원 NPC 경로(사냥터 A ↔ 캠프는 출입구 경유) */
export function route(from: Point, to: Point): Point[] {
  const fromHunt = from.y < WORLD.fenceAY;
  const toHunt = to.y < WORLD.fenceAY;
  if (fromHunt && toHunt) return [to];
  if (!fromHunt && !toHunt) return campRoute(from, to);
  if (fromHunt) return [{ x: WORLD.gateX, y: GATE_TOP.y }, GATE_BOTTOM, ...campRoute(GATE_BOTTOM, to)];
  return [...campRoute(from, GATE_BOTTOM), GATE_TOP, to];
}
