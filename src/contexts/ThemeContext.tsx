import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { api } from '../lib/api';

export type ThemeMode = 'dark' | 'gray' | 'light' | 'custom';

export interface CustomThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

export interface ChatColors {
  userBorder: string;
  userBg: string;
  workBorder: string;
  agentBorder: string;
  agentBg: string;
  toolBorder: string;
  toolBg: string;
  finalBorder: string;
  finalBg: string;
  interruptBorder: string;
  interruptBg: string;
  interruptFg: string;
  resultOkBorder: string;
  resultOkBg: string;
  resultErrBorder: string;
  resultErrBg: string;
}

interface ThemeContextType {
  theme: ThemeMode;
  customColors: CustomThemeColors;
  chatColors: ChatColors;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setCustomColors: (colors: Partial<CustomThemeColors>) => Promise<void>;
  setChatColors: (colors: Partial<ChatColors>) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'theme_preference';
const CUSTOM_COLORS_STORAGE_KEY = 'theme_custom_colors';
const CHAT_COLORS_STORAGE_KEY = 'theme_chat_colors';

// Default custom theme colors (based on current dark theme)
const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
  background: 'oklch(0.12 0.01 240)',
  foreground: 'oklch(0.98 0.01 240)',
  card: 'oklch(0.14 0.01 240)',
  cardForeground: 'oklch(0.98 0.01 240)',
  primary: 'oklch(0.98 0.01 240)',
  primaryForeground: 'oklch(0.12 0.01 240)',
  secondary: 'oklch(0.16 0.01 240)',
  secondaryForeground: 'oklch(0.98 0.01 240)',
  muted: 'oklch(0.16 0.01 240)',
  mutedForeground: 'oklch(0.65 0.01 240)',
  accent: 'oklch(0.16 0.01 240)',
  accentForeground: 'oklch(0.98 0.01 240)',
  destructive: 'oklch(0.6 0.2 25)',
  destructiveForeground: 'oklch(0.98 0.01 240)',
  border: 'oklch(0.16 0.01 240)',
  input: 'oklch(0.16 0.01 240)',
  ring: 'oklch(0.98 0.01 240)',
};

const DEFAULT_CHAT_COLORS: ChatColors = {
  userBorder: 'rgba(59, 130, 246, 0.5)',
  userBg: 'rgba(59, 130, 246, 0.1)',
  workBorder: 'rgba(59, 130, 246, 0.25)',
  agentBorder: 'rgba(59, 130, 246, 0.2)',
  agentBg: 'rgba(59, 130, 246, 0.05)',
  toolBorder: 'rgba(255, 255, 255, 0.1)',
  toolBg: 'rgba(255, 255, 255, 0.04)',
  finalBorder: 'rgba(34, 197, 94, 0.2)',
  finalBg: 'rgba(34, 197, 94, 0.05)',
  interruptBorder: 'rgba(245, 158, 11, 0.5)',
  interruptBg: 'rgba(245, 158, 11, 0.1)',
  interruptFg: 'rgba(251, 191, 36, 1)',
  resultOkBorder: 'rgba(34, 197, 94, 0.2)',
  resultOkBg: 'rgba(34, 197, 94, 0.05)',
  resultErrBorder: 'rgba(239, 68, 68, 0.2)',
  resultErrBg: 'rgba(239, 68, 68, 0.05)',
};

// ─── Contrast utilities ───────────────────────────────────────────────────────

/** Resolve any CSS color expression to an rgb(...) string via a temp DOM element. */
function resolveCssColor(value: string): string {
  try {
    const el = document.createElement('div');
    el.style.backgroundColor = value;
    el.style.position = 'absolute';
    el.style.visibility = 'hidden';
    document.body.appendChild(el);
    const resolved = getComputedStyle(el).backgroundColor;
    document.body.removeChild(el);
    return resolved;
  } catch {
    return 'rgb(128,128,128)';
  }
}

/** Perceived luminance (0 = black, 1 = white) from an rgb(...) string. */
function rgbLuminance(rgbStr: string): number {
  const m = rgbStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return 0.5;
  return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
}

/**
 * Given a background CSS color string, returns a foreground color string that
 * is guaranteed to be readable (near-black on light bg, near-white on dark bg).
 */
function autoForeground(bgCssValue: string): string {
  const resolved = resolveCssColor(bgCssValue);
  const lum = rgbLuminance(resolved);
  return lum > 0.45 ? 'oklch(0.1 0 0)' : 'oklch(0.95 0 0)';
}

/**
 * After any theme class is applied, read back the resolved CSS variable values
 * and override the *-foreground counterparts so text is always readable.
 */
function enforceContrastForegrounds(root: HTMLElement) {
  // Only pairs where the foreground is literally "text rendered on top of that background"
  // muted-foreground and card-foreground are semantic text colors, not tied to their bg.
  const pairs: [string, string][] = [
    ['--color-accent', '--color-accent-foreground'],
    ['--color-primary', '--color-primary-foreground'],
    ['--color-secondary', '--color-secondary-foreground'],
    ['--color-destructive', '--color-destructive-foreground'],
  ];

  for (const [bgVar, fgVar] of pairs) {
    const bgValue = getComputedStyle(root).getPropertyValue(bgVar).trim();
    if (!bgValue) continue;
    root.style.setProperty(fgVar, autoForeground(bgValue));
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>('gray');
  const [customColors, setCustomColorsState] = useState<CustomThemeColors>(DEFAULT_CUSTOM_COLORS);
  const [chatColors, setChatColorsState] = useState<ChatColors>(DEFAULT_CHAT_COLORS);
  const [isLoading, setIsLoading] = useState(true);

  // Load theme preference and custom colors from storage
  useEffect(() => {
    const loadTheme = async () => {
      try {
        // Load all settings in parallel
        const [savedTheme, savedColors, savedChatColors] = await Promise.all([
          api.getSetting(THEME_STORAGE_KEY),
          api.getSetting(CUSTOM_COLORS_STORAGE_KEY),
          api.getSetting(CHAT_COLORS_STORAGE_KEY),
        ]);

        const themeMode: ThemeMode = (savedTheme as ThemeMode) || 'gray';
        const colors: CustomThemeColors = savedColors
          ? (JSON.parse(savedColors) as CustomThemeColors)
          : DEFAULT_CUSTOM_COLORS;
        const chColors: ChatColors = savedChatColors
          ? (JSON.parse(savedChatColors) as ChatColors)
          : DEFAULT_CHAT_COLORS;

        setThemeState(themeMode);
        setCustomColorsState(colors);
        setChatColorsState(chColors);

        // Apply theme using local variables — avoids stale closure on `theme`
        await applyTheme(themeMode, colors, chColors);
      } catch (error) {
        console.error('Failed to load theme settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTheme();
  }, []);

  // Apply chat colors as CSS variables
  const applyChatColors = useCallback((colors: ChatColors) => {
    const root = document.documentElement;
    Object.entries(colors).forEach(([key, value]) => {
      const cssVarName = `--chat-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVarName, value);
    });
  }, []);

  // Apply theme to document
  const applyTheme = useCallback(async (themeMode: ThemeMode, colors: CustomThemeColors, chColors: ChatColors = DEFAULT_CHAT_COLORS) => {
    const root = document.documentElement;

    // Remove all theme classes
    root.classList.remove('theme-dark', 'theme-gray', 'theme-light', 'theme-custom');

    // Add new theme class
    root.classList.add(`theme-${themeMode}`);

    // If custom theme, apply custom colors as CSS variables
    if (themeMode === 'custom') {
      Object.entries(colors).forEach(([key, value]) => {
        const cssVarName = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        root.style.setProperty(cssVarName, value);
      });
    } else {
      // Clear custom CSS variables when not using custom theme
      Object.keys(colors).forEach((key) => {
        const cssVarName = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        root.style.removeProperty(cssVarName);
      });
    }

    // Always apply chat colors
    applyChatColors(chColors);

    // Auto-derive *-foreground vars so text is always readable on colored backgrounds
    // Use requestAnimationFrame so the class/variable changes have been painted first
    requestAnimationFrame(() => enforceContrastForegrounds(root));
  }, [applyChatColors]);

  const setTheme = useCallback(async (newTheme: ThemeMode) => {
    try {
      setIsLoading(true);

      // Apply theme immediately
      setThemeState(newTheme);
      await applyTheme(newTheme, customColors, chatColors);

      // Save to storage
      await api.saveSetting(THEME_STORAGE_KEY, newTheme);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    } finally {
      setIsLoading(false);
    }
  }, [customColors, chatColors, applyTheme]);

  const setCustomColors = useCallback(async (colors: Partial<CustomThemeColors>) => {
    try {
      setIsLoading(true);

      const newColors = { ...customColors, ...colors };
      setCustomColorsState(newColors);

      // Apply immediately if custom theme is active
      if (theme === 'custom') {
        await applyTheme('custom', newColors, chatColors);
      }

      // Save to storage
      await api.saveSetting(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(newColors));
    } catch (error) {
      console.error('Failed to save custom colors:', error);
    } finally {
      setIsLoading(false);
    }
  }, [theme, customColors, chatColors, applyTheme]);

  const setChatColors = useCallback(async (colors: Partial<ChatColors>) => {
    try {
      setIsLoading(true);

      const newColors = { ...chatColors, ...colors };
      setChatColorsState(newColors);

      // Apply immediately
      applyChatColors(newColors);

      // Save to storage
      await api.saveSetting(CHAT_COLORS_STORAGE_KEY, JSON.stringify(newColors));
    } catch (error) {
      console.error('Failed to save chat colors:', error);
    } finally {
      setIsLoading(false);
    }
  }, [chatColors, applyChatColors]);

  const value: ThemeContextType = {
    theme,
    customColors,
    chatColors,
    setTheme,
    setCustomColors,
    setChatColors,
    isLoading,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
};
