import { describe, it, expect } from 'vitest';
import { deriveHookState } from './useHookEvents';

function makeEvent(hook_type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ ts: '2026-01-01T00:00:00Z', hook_type, payload });
}

describe('deriveHookState', () => {
  it('sets currentTool on PreToolUse', () => {
    const lines = [makeEvent('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } })];
    const state = deriveHookState(lines);
    expect(state.currentTool?.name).toBe('Bash');
    expect(state.currentTool?.input).toEqual({ command: 'ls' });
  });

  it('clears currentTool on PostToolUse', () => {
    const lines = [
      makeEvent('PreToolUse', { tool_name: 'Bash', tool_input: {} }),
      makeEvent('PostToolUse', { tool_name: 'Bash', tool_response: {} }),
    ];
    const state = deriveHookState(lines);
    expect(state.currentTool).toBeNull();
  });

  it('sets isWaitingForHuman on idle_prompt Notification', () => {
    const lines = [makeEvent('Notification', { notification_type: 'idle_prompt', message: 'Waiting' })];
    const state = deriveHookState(lines);
    expect(state.isWaitingForHuman).toBe(true);
  });

  it('clears all transient state on Stop', () => {
    const lines = [
      makeEvent('PreToolUse', { tool_name: 'Bash', tool_input: {} }),
      makeEvent('Notification', { notification_type: 'idle_prompt', message: 'Waiting' }),
      makeEvent('Stop', { stop_hook_active: false }),
    ];
    const state = deriveHookState(lines);
    expect(state.currentTool).toBeNull();
    expect(state.isWaitingForHuman).toBe(false);
  });

  it('extracts sessionTitle from UserPromptSubmit', () => {
    const lines = [makeEvent('UserPromptSubmit', { session_title: 'my-session', prompt: 'hello' })];
    const state = deriveHookState(lines);
    expect(state.sessionTitle).toBe('my-session');
  });

  it('tracks subagent lifecycle', () => {
    const lines = [
      makeEvent('SubagentStart', { agent_type: 'worker', agent_id: 'abc' }),
    ];
    const state = deriveHookState(lines);
    expect(state.subagentActive).toBe(true);
    expect(state.subagentType).toBe('worker');
  });

  it('returns lastEventCount equal to line count', () => {
    const lines = [makeEvent('Stop', {})];
    const state = deriveHookState(lines);
    expect(state.lastEventCount).toBe(1);
  });
});
