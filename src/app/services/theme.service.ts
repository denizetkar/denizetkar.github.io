import { Injectable, signal, effect } from '@angular/core';

export type AppTheme = 'dark' | 'cyberpunk' | 'terminal';

const STORAGE_KEY = 'theme';
const VALID_THEMES: ReadonlySet<AppTheme> = new Set<AppTheme>(['dark', 'cyberpunk', 'terminal']);

function readPersistedTheme(): AppTheme | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored !== null && VALID_THEMES.has(stored as AppTheme) ? (stored as AppTheme) : null;
}

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  public readonly activeTheme = signal<AppTheme>('dark');

  constructor() {
    const persisted = readPersistedTheme();
    if (persisted !== null) {
      this.activeTheme.set(persisted);
    }

    effect(() => {
      const theme = this.activeTheme();
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', theme);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, theme);
      }
    });
  }

  public setTheme(theme: AppTheme) {
    this.activeTheme.set(theme);
  }
}
