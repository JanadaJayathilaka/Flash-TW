import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppTheme, ThemeName, THEMES } from './themes';

const THEME_STORAGE_KEY = 'flash_mobile_theme';

interface ThemeContextValue {
  theme: AppTheme;
  themeName: ThemeName;
  setThemeName: (themeName: ThemeName) => Promise<void>;
  ready: boolean;
}

const AppThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>('default');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function loadStoredTheme() {
      try {
        const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (storedTheme && storedTheme in THEMES) {
          setThemeNameState(storedTheme as ThemeName);
        }
      } catch {
        // Keep default theme when storage cannot be accessed.
      } finally {
        setReady(true);
      }
    }

    loadStoredTheme();
  }, []);

  const setThemeName = useCallback(async (nextThemeName: ThemeName) => {
    setThemeNameState(nextThemeName);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, nextThemeName);
    } catch {
      // Keep in-memory theme if persistence fails.
    }
  }, []);

  const value = useMemo(
    () => ({
      theme: THEMES[themeName],
      themeName,
      setThemeName,
      ready,
    }),
    [themeName, setThemeName, ready]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }
  return context;
}
