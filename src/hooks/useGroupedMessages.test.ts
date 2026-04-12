import { describe, it, expect } from 'vitest';
import { groupMessagesIntoTurns } from './useGroupedMessages';
import type { ClaudeStreamMessage } from '../components/AgentExecution';

describe('groupMessagesIntoTurns', () => {
  it('groups a basic turn: user -> (assistant with tool_use) -> (user tool_result) -> (assistant text)', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'user prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'call_1', name: 'test', input: {} }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'result' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'final response' }],
        },
      },
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(standaloneMessages).toHaveLength(0);

    const turn = turns[0];
    expect(turn.userMessage.type).toBe('user');
    expect(turn.workItems).toHaveLength(2);
    expect(turn.workItems[0].type).toBe('assistant');
    expect(turn.workItems[1].type).toBe('user');
    expect(turn.assistantResponse?.type).toBe('assistant');
    expect(turn.isComplete).toBe(false);
  });

  it('handles streaming incomplete state: user -> (assistant with tool_use) -> (no result yet)', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'user prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'call_1', name: 'test', input: {} }],
        },
      },
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(standaloneMessages).toHaveLength(0);

    const turn = turns[0];
    expect(turn.userMessage.type).toBe('user');
    expect(turn.workItems).toHaveLength(1);
    expect(turn.assistantResponse).toBeUndefined();
    expect(turn.isComplete).toBe(false);
  });

  it('groups two separate user messages into two turns', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'first prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'first response' }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'second prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'second response' }],
        },
      },
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(2);
    expect(standaloneMessages).toHaveLength(0);

    expect(turns[0].userMessage.message?.content?.[0]?.text).toBe('first prompt');
    expect(turns[0].assistantResponse?.message?.content?.[0]?.text).toBe(
      'first response'
    );

    expect(turns[1].userMessage.message?.content?.[0]?.text).toBe('second prompt');
    expect(turns[1].assistantResponse?.message?.content?.[0]?.text).toBe(
      'second response'
    );
  });

  it('handles pure text response: user -> assistant text only', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'user prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'response' }],
        },
      },
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(standaloneMessages).toHaveLength(0);

    const turn = turns[0];
    expect(turn.workItems).toHaveLength(0);
    expect(turn.assistantResponse?.type).toBe('assistant');
  });

  it('puts system messages into standaloneMessages', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'system',
        message: {
          content: [{ type: 'text', text: 'system init' }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'user prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'response' }],
        },
      },
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(standaloneMessages).toHaveLength(1);
    expect(standaloneMessages[0].type).toBe('system');
  });

  it('ignores isMeta user messages as turn starters', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        isMeta: true,
        message: {
          content: [{ type: 'text', text: 'meta message' }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'real prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'response' }],
        },
      },
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(standaloneMessages).toHaveLength(1);
    expect(standaloneMessages[0].isMeta).toBe(true);
    expect(turns[0].userMessage.message?.content?.[0]?.text).toBe('real prompt');
  });

  it('puts pure tool_result user messages into workItems', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'first prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'call_1', name: 'test', input: {} }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'result' }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'second prompt' }],
        },
      },
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(2);
    expect(standaloneMessages).toHaveLength(0);

    const firstTurn = turns[0];
    expect(firstTurn.workItems).toHaveLength(2);
    expect(firstTurn.workItems[1].type).toBe('user');
    expect(
      firstTurn.workItems[1].message?.content?.[0]?.type
    ).toBe('tool_result');
  });

  it('returns empty arrays for empty input', () => {
    const { turns, standaloneMessages } = groupMessagesIntoTurns([]);

    expect(turns).toHaveLength(0);
    expect(standaloneMessages).toHaveLength(0);
  });

  it('handles assistant with thinking alongside text as the response', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'user prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: 'internal thought' },
            { type: 'text', text: 'response' },
          ],
        },
      },
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(standaloneMessages).toHaveLength(0);

    const turn = turns[0];
    expect(turn.workItems).toHaveLength(0);
    expect(turn.assistantResponse?.type).toBe('assistant');
  });

  it('handles tool_use alongside text as workItem, not response', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'user prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'calling tool' },
            { type: 'tool_use', id: 'call_1', name: 'test', input: {} },
          ],
        },
      },
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(standaloneMessages).toHaveLength(0);

    const turn = turns[0];
    expect(turn.workItems).toHaveLength(1);
    expect(turn.assistantResponse).toBeUndefined();
  });

  it('marks turn as complete when result message is seen', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'user prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'response' }],
        },
      },
      {
        type: 'result',
        message: {
          content: [{ type: 'text', text: 'result' }],
        },
      },
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(standaloneMessages).toHaveLength(1);

    const turn = turns[0];
    expect(turn.isComplete).toBe(true);
  });

  it('generates stable turn IDs based on userMessage index', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'first prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'first response' }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'second prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'second response' }],
        },
      },
    ];

    const { turns } = groupMessagesIntoTurns(messages);

    expect(turns[0].id).toBe('0');
    expect(turns[1].id).toBe('2');
  });

  it('handles result message type in standaloneMessages', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'user prompt' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'response' }],
        },
      },
      {
        type: 'result',
        message: {
          content: [{ type: 'text', text: 'result metadata' }],
        },
      },
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(standaloneMessages).toHaveLength(1);
    expect(standaloneMessages[0].type).toBe('result');
  });

  it('handles mixed content in messages without content array', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        content: [{ type: 'text', text: 'user prompt' }],
      } as ClaudeStreamMessage,
      {
        type: 'assistant',
        content: [{ type: 'text', text: 'response' }],
      } as ClaudeStreamMessage,
    ];

    const { turns, standaloneMessages } = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(standaloneMessages).toHaveLength(0);

    const turn = turns[0];
    expect(turn.workItems).toHaveLength(0);
    expect(turn.assistantResponse?.type).toBe('assistant');
  });
});
