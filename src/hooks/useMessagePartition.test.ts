import { describe, it, expect } from 'vitest';
import { partitionTurns } from './useMessagePartition';
import type { Turn } from './useGroupedMessages';

function makeTurn(hasUser: boolean, index: number): Turn {
  return {
    id: `turn-${index}`,
    userMessage: hasUser ? ({ type: 'user' } as any) : null,
    workItems: [],
    result: null,
    isComplete: true,
  };
}

describe('partitionTurns', () => {
  it('returns all turns when count <= windowCount', () => {
    const turns = [makeTurn(true, 0), makeTurn(true, 1), makeTurn(true, 2)];
    const result = partitionTurns(turns, 10);
    expect(result.visible).toHaveLength(3);
    expect(result.hiddenCount).toBe(0);
  });

  it('returns last 10 user windows from 25-turn input', () => {
    const turns: Turn[] = [];
    for (let i = 0; i < 25; i++) {
      turns.push(makeTurn(true, i));
    }
    const result = partitionTurns(turns, 10);
    expect(result.visible).toHaveLength(10);
    expect(result.hiddenCount).toBe(15);
  });

  it('includes non-user turns between user windows', () => {
    const turns: Turn[] = [
      makeTurn(true, 0),
      makeTurn(false, 1), // orphaned work
      makeTurn(true, 2),
    ];
    // Only 2 user turns, windowCount=1 → show last user window (index 2) + orphans before it
    // Wait, orphan at index 1 is between user turns. cutoffIndex = userTurnIndices[2-1] = userTurnIndices[1] = 2
    // So hiddenCount=2, visible=[turns[2]]
    const result = partitionTurns(turns, 1);
    expect(result.hiddenCount).toBe(2);
    expect(result.visible).toHaveLength(1);
    expect(result.visible[0].id).toBe('turn-2');
  });

  it('collapse resets: hiddenCount becomes 0 when turns <= windowCount', () => {
    const turns = [makeTurn(true, 0)];
    const result = partitionTurns(turns, 10);
    expect(result.hiddenCount).toBe(0);
  });
});
