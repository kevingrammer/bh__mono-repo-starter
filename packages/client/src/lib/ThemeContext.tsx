import { createContext, useContext, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useThemeMode, type ThemeMode } from './useTheme';

interface ThemeContextValue {
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  toggleTheme: () => { },
});

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { mode, mounted, theme, toggleTheme } = useThemeMode();

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ThemeContext.Provider value={{ mode, toggleTheme }}>
        {mounted ? children : null}
      </ThemeContext.Provider>
    </ThemeProvider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
