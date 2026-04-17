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
  // Chat message colors — map to --chat-* CSS variables
  chatUserBorder: string;
  chatUserBg: string;
  chatWorkBorder: string;
  chatAgentBorder: string;
  chatAgentBg: string;
  chatFinalBorder: string;
  chatFinalBg: string;
  chatResultOkBorder: string;
  chatResultOkBg: string;
  chatResultErrBorder: string;
  chatResultErrBg: string;
  chatTerminalCommand: string;
  chatTerminalOutput: string;
}


interface ThemeContextType {
  theme: ThemeMode;
  customColors: CustomThemeColors;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setCustomColors: (colors: Partial<CustomThemeColors>) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'theme_preference';
const CUSTOM_COLORS_KEY = 'theme_custom_colors';

async function loadThemeFromCcode(): Promise<{ theme: ThemeMode; colors: CustomThemeColors }> {
  try {
    const settings = await api.readCcodeSettings();
    const themeMode: ThemeMode = (settings[THEME_KEY] as ThemeMode) || 'gray';
    const colors: CustomThemeColors = settings[CUSTOM_COLORS_KEY]
      ? (JSON.parse(settings[CUSTOM_COLORS_KEY]) as CustomThemeColors)
      : DEFAULT_CUSTOM_COLORS;
    return { theme: themeMode, colors };
  } catch {
    return { theme: 'gray', colors: DEFAULT_CUSTOM_COLORS };
  }
}

async function saveThemeToCcode(key: string, value: string): Promise<void> {
  try {
    const current = await api.readCcodeSettings();
    await api.writeCcodeSettings({ ...current, [key]: value });
  } catch (err) {
    console.error('Failed to save theme to .ccode:', err);
  }
}

// Default custom theme colors (based on current dark theme)
const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
  background: 'rgba(22, 24, 30, 1)',
  foreground: 'rgba(238, 241, 247, 1)',
  card: 'rgba(30, 32, 40, 1)',
  cardForeground: 'rgba(238, 241, 247, 1)',
  primary: 'rgba(238, 241, 247, 1)',
  primaryForeground: 'rgba(30, 32, 40, 1)',
  secondary: 'rgba(38, 41, 50, 1)',
  secondaryForeground: 'rgba(238, 241, 247, 1)',
  muted: 'rgba(34, 36, 45, 1)',
  mutedForeground: 'rgba(148, 153, 171, 1)',
  accent: 'rgba(38, 41, 50, 1)',
  accentForeground: 'rgba(238, 241, 247, 1)',
  destructive: 'rgba(212, 80, 52, 1)',
  destructiveForeground: 'rgba(250, 251, 255, 1)',
  border: 'rgba(44, 47, 57, 1)',
  input: 'rgba(44, 47, 57, 1)',
  ring: 'rgba(108, 112, 130, 1)',
  chatUserBorder: 'rgba(251, 191, 36, 0.40)',
  chatUserBg: 'rgba(251, 191, 36, 0.07)',
  chatWorkBorder: 'rgba(99, 179, 237, 0.35)',
  chatAgentBorder: 'rgba(255, 255, 255, 0.07)',
  chatAgentBg: 'rgba(255, 255, 255, 0.02)',
  chatFinalBorder: 'rgba(74, 222, 128, 0.50)',
  chatFinalBg: 'rgba(22, 163, 74, 0.13)',
  chatResultOkBorder: 'rgba(74, 222, 128, 0.40)',
  chatResultOkBg: 'rgba(22, 163, 74, 0.09)',
  chatResultErrBorder: 'rgba(248, 113, 113, 0.50)',
  chatResultErrBg: 'rgba(239, 68, 68, 0.11)',
  chatTerminalCommand: 'rgba(74, 222, 128, 1)',
  chatTerminalOutput: 'rgba(134, 239, 172, 1)',
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
  return lum > 0.45 ? 'rgba(20, 20, 20, 1)' : 'rgba(242, 242, 242, 1)';
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const { theme: themeMode, colors } = await loadThemeFromCcode();
        setThemeState(themeMode);
        setCustomColorsState(colors);
        await applyTheme(themeMode, colors);
      } catch (error) {
        console.error('Failed to load theme settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadTheme();
  }, []);

  const applyTheme = useCallback(async (themeMode: ThemeMode, colors: CustomThemeColors) => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-gray', 'theme-light', 'theme-custom');
    root.classList.add(`theme-${themeMode}`);

    const toCssVar = (key: string): string => {
      const kebab = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      // chat* keys map to --chat-* directly; everything else to --color-*
      return key.startsWith('chat') ? `--${kebab}` : `--color-${kebab}`;
    };

    if (themeMode === 'custom') {
      Object.entries(colors).forEach(([key, value]) => {
        root.style.setProperty(toCssVar(key), value);
      });
    } else {
      Object.keys(colors).forEach((key) => {
        root.style.removeProperty(toCssVar(key));
      });
    }

    requestAnimationFrame(() => enforceContrastForegrounds(root));
  }, []);

  const setTheme = useCallback(async (newTheme: ThemeMode) => {
    try {
      setIsLoading(true);
      setThemeState(newTheme);
      await applyTheme(newTheme, customColors);
      await saveThemeToCcode(THEME_KEY, newTheme);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    } finally {
      setIsLoading(false);
    }
  }, [customColors, applyTheme]);

  const setCustomColors = useCallback(async (colors: Partial<CustomThemeColors>) => {
    try {
      setIsLoading(true);
      const newColors = { ...customColors, ...colors };
      setCustomColorsState(newColors);
      if (theme === 'custom') {
        await applyTheme('custom', newColors);
      }
      await saveThemeToCcode(CUSTOM_COLORS_KEY, JSON.stringify(newColors));
    } catch (error) {
      console.error('Failed to save custom colors:', error);
    } finally {
      setIsLoading(false);
    }
  }, [theme, customColors, applyTheme]);

  const value: ThemeContextType = {
    theme,
    customColors,
    setTheme,
    setCustomColors,
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
