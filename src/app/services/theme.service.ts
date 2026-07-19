import { Injectable, signal, effect } from '@angular/core';

export type AppTheme = 'dark' | 'cyberpunk' | 'terminal';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  public readonly activeTheme = signal<AppTheme>('dark');

  constructor() {
    // Synchronize the HTML data-theme attribute reactively using effects
    effect(() => {
      const theme = this.activeTheme();
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', theme);
      }
    });
  }

  public setTheme(theme: AppTheme) {
    this.activeTheme.set(theme);
  }
}
