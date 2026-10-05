import type { InputBatch } from '@open-channel/match';

export type WalkState = {
  pos: Record<string, { x: number; y: number }>;
  ticks: number;
};

export function initialWalk(): WalkState {
  return { pos: {}, ticks: 0 };
}

export function reduceWalk(prev: WalkState, batch: InputBatch): WalkState {
  const pos = { ...prev.pos };
  for (const item of batch) {
    const cur = pos[item.actorId] ?? { x: 0, y: 0 };
    const dir = item.payload[0] ?? 0;
    if (dir === 0) cur.x -= 1;
    else if (dir === 1) cur.x += 1;
    else if (dir === 2) cur.y -= 1;
    else if (dir === 3) cur.y += 1;
    pos[item.actorId] = { ...cur };
  }
  return { pos, ticks: prev.ticks + 1 };
}

export function encodeWalk(state: WalkState): Buffer {
  return Buffer.from(JSON.stringify(state));
}

export function walkShouldEnd(state: WalkState): boolean {
  return Object.keys(state.pos).length >= 2;
}
