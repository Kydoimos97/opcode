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

    if (themeMode === 'custom') {
      Object.entries(colors).forEach(([key, value]) => {
        const cssVarName = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        root.style.setProperty(cssVarName, value);
      });
    } else {
      Object.keys(colors).forEach((key) => {
        const cssVarName = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        root.style.removeProperty(cssVarName);
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
