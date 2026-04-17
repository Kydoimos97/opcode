const KEY = 'ccode_debug_mode';

export function isDebugMode(): boolean {
  return localStorage.getItem(KEY) === 'true';
}

export function setDebugMode(enabled: boolean): void {
  localStorage.setItem(KEY, String(enabled));
  window.dispatchEvent(new CustomEvent('ccode-debug-mode-changed', { detail: enabled }));
}

export function debugLog(...args: unknown[]): void {
  if (isDebugMode()) console.debug('[opcode]', ...args);
}
