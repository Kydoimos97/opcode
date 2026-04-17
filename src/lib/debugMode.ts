import { api } from './api';

let debugModeCache: boolean | null = null;

export async function isDebugMode(): Promise<boolean> {
  if (debugModeCache !== null) return debugModeCache;
  try {
    const settings = await api.readCcodeSettings();
    debugModeCache = settings.debug_mode === true || settings.debug_mode === 'true';
    return debugModeCache;
  } catch (error) {
    console.error('Failed to read debug mode:', error);
    return false;
  }
}

export async function setDebugMode(enabled: boolean): Promise<void> {
  debugModeCache = enabled;
  try {
    const currentSettings = await api.readCcodeSettings();
    await api.writeCcodeSettings({
      ...currentSettings,
      debug_mode: enabled
    });
  } catch (error) {
    console.error('Failed to set debug mode:', error);
  }
  window.dispatchEvent(new CustomEvent('ccode-debug-mode-changed', { detail: enabled }));
}

export async function debugLog(...args: unknown[]): Promise<void> {
  if (await isDebugMode()) console.debug('[ccode]', ...args);
}
