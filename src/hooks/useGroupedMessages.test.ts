import { describe, it, expect } from 'vitest';
import { groupMessagesIntoTurns } from './useGroupedMessages';
import type { ClaudeStreamMessage } from '../components/AgentExecution';

describe('groupMessagesIntoTurns', () => {
  it('groups a basic turn: user -> assistant -> user tool_result -> result', () => {
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
        type: 'result',
        is_error: false,
      },
    ];

    const turns = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);

    const turn = turns[0];
    expect(turn.userMessage?.type).toBe('user');
    expect(turn.workItems).toHaveLength(2);
    expect(turn.workItems[0].type).toBe('assistant');
    expect(turn.workItems[1].type).toBe('user');
    expect(turn.result?.type).toBe('result');
    expect(turn.isComplete).toBe(true);
  });

  it('handles incomplete turn: user -> assistant (streaming, no result yet)', () => {
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

    const turns = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);

    const turn = turns[0];
    expect(turn.userMessage?.type).toBe('user');
    expect(turn.workItems).toHaveLength(1);
    expect(turn.result).toBeNull();
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
        type: 'result',
        is_error: false,
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
      {
        type: 'result',
        is_error: false,
      },
    ];

    const turns = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(2);

    expect(turns[0].userMessage?.message?.content?.[0]?.text).toBe('first prompt');
    expect(turns[0].workItems[0]?.message?.content?.[0]?.text).toBe('first response');
    expect(turns[0].result?.type).toBe('result');

    expect(turns[1].userMessage?.message?.content?.[0]?.text).toBe('second prompt');
    expect(turns[1].workItems[0]?.message?.content?.[0]?.text).toBe('second response');
    expect(turns[1].result?.type).toBe('result');
  });

  it('handles system init message as standalone', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'system',
        subtype: 'init',
        session_id: 'test-session',
        model: 'claude-3-5-sonnet',
        cwd: '/tmp',
        tools: [],
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'user prompt' }],
        },
      },
      {
        type: 'result',
        is_error: false,
      },
    ];

    const turns = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(2);
    expect(turns[0].userMessage).toBeNull();
    expect(turns[0].workItems).toHaveLength(1);
    expect(turns[0].workItems[0].type).toBe('system');
    expect(turns[0].isComplete).toBe(true);

    expect(turns[1].userMessage?.type).toBe('user');
  });

  it('handles pure tool_result user messages as workItems', () => {
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
          content: [{ type: 'tool_use', id: 'call_1', name: 'bash', input: { command: 'ls' } }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'file1\nfile2' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'I see two files' }],
        },
      },
      {
        type: 'result',
        is_error: false,
      },
    ];

    const turns = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(turns[0].userMessage?.message?.content?.[0]?.text).toBe('user prompt');
    expect(turns[0].workItems).toHaveLength(3);
    expect(turns[0].workItems[0].type).toBe('assistant');
    expect(turns[0].workItems[1].type).toBe('user');
    expect(turns[0].workItems[2].type).toBe('assistant');
  });

  it('ignores pure tool_result user messages (does not start new turn)', () => {
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
          content: [{ type: 'tool_use', id: 'call_1', name: 'bash', input: { command: 'ls' } }],
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
      {
        type: 'result',
        is_error: false,
      },
    ];

    const turns = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(2);
    expect(turns[0].userMessage?.message?.content?.[0]?.text).toBe('first prompt');
    expect(turns[0].workItems[1]?.type).toBe('user');
    expect(turns[1].userMessage?.message?.content?.[0]?.text).toBe('second prompt');
  });

  it('handles empty workItems', () => {
    const messages: ClaudeStreamMessage[] = [
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'user prompt' }],
        },
      },
      {
        type: 'result',
        is_error: false,
      },
    ];

    const turns = groupMessagesIntoTurns(messages);

    expect(turns).toHaveLength(1);
    expect(turns[0].userMessage?.type).toBe('user');
    expect(turns[0].workItems).toHaveLength(0);
    expect(turns[0].result?.type).toBe('result');
  });
});
