import { useEffect, useState, useCallback } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'app-theme-mode';

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage on mount to avoid hydration mismatch
  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (saved) {
      setMode(saved);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setMode(prefersDark ? 'dark' : 'light');
    }
    setMounted(true);
  }, []);

  // Update the data-theme attribute on html element when mode changes
  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute('data-theme', mode);
    }
  }, [mode, mounted]);

  const toggleTheme = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const theme = createTheme({
    palette: {
      mode,
      ...(mode === 'light'
        ? {
            background: {
              default: '#ffffff',
              paper: '#ffffff',
            },
            text: {
              primary: '#0f172a',
              secondary: '#475569',
            },
          }
        : {
            background: {
              default: '#0f172a',
              paper: '#1e293b',
            },
            text: {
              primary: '#f1f5f9',
              secondary: '#cbd5e1',
            },
          }),
    },
  });

  return { mode, mounted, theme, toggleTheme };
}
