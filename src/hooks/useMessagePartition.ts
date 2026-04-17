import { useMemo } from 'react';
import type { Turn } from './useGroupedMessages';

/**
 * Partitions turns to the last N user-turn windows.
 *
 * A "user-turn window" is any turn that has a non-null userMessage.
 * All turns from the first of the last N user-turn windows to the end are
 * included — this preserves orphaned work items and result turns between them.
 *
 * @param turns  All turns from useGroupedMessages
 * @param windowCount  Number of user-turn windows to show (default 10)
 * @returns { visible, hiddenCount } where hiddenCount is the number of turns hidden
 */
export function partitionTurns(turns: Turn[], windowCount: number): { visible: Turn[]; hiddenCount: number } {
  if (turns.length === 0) return { visible: [], hiddenCount: 0 };

  // Find indices of turns that have a real user message
  const userTurnIndices: number[] = [];
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].userMessage !== null) {
      userTurnIndices.push(i);
    }
  }

  if (userTurnIndices.length <= windowCount) {
    return { visible: turns, hiddenCount: 0 };
  }

  // The cutoff is the index of the Nth-from-last user turn
  const cutoffIndex = userTurnIndices[userTurnIndices.length - windowCount];
  return {
    visible: turns.slice(cutoffIndex),
    hiddenCount: cutoffIndex,
  };
}

export function useMessagePartition(
  turns: Turn[],
  windowCount: number,
  expanded: boolean,
): { visible: Turn[]; hiddenCount: number } {
  return useMemo(() => {
    if (expanded) return { visible: turns, hiddenCount: 0 };
    return partitionTurns(turns, windowCount);
  }, [turns, windowCount, expanded]);
}
