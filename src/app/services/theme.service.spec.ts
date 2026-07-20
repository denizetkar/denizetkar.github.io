import { TestBed } from '@angular/core/testing';
import { ThemeService, AppTheme } from './theme.service';

const STORAGE_KEY = 'theme';
const VALID_THEMES: AppTheme[] = ['dark', 'cyberpunk', 'terminal'];

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  function createService(persistedTheme: string | null): ThemeService {
    if (persistedTheme !== null) {
      localStorage.setItem(STORAGE_KEY, persistedTheme);
    }
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    TestBed.flushEffects();
    return service;
  }

  it('defaults to the dark theme when no persisted value exists', () => {
    const service = createService(null);
    expect(service.activeTheme()).toBe('dark');
  });

  describe('init from persisted storage', () => {
    for (const theme of VALID_THEMES) {
      it(`initializes activeTheme to '${theme}' when localStorage holds it`, () => {
        const service = createService(theme);
        expect(service.activeTheme()).toBe(theme);
      });
    }

    it('ignores an unknown persisted value and falls back to dark', () => {
      const service = createService('light');
      expect(service.activeTheme()).toBe('dark');
    });
  });

  describe('setTheme writes to storage', () => {
    for (const theme of VALID_THEMES) {
      it(`persists '${theme}' to localStorage on setTheme`, () => {
        const service = createService(null);
        service.setTheme(theme);
        TestBed.flushEffects();
        expect(localStorage.getItem(STORAGE_KEY)).toBe(theme);
      });
    }

    it('updates the persisted value when the theme changes', () => {
      const service = createService(null);
      service.setTheme('cyberpunk');
      TestBed.flushEffects();
      expect(localStorage.getItem(STORAGE_KEY)).toBe('cyberpunk');
      service.setTheme('terminal');
      TestBed.flushEffects();
      expect(localStorage.getItem(STORAGE_KEY)).toBe('terminal');
    });
  });

  it('reflects the active theme on the document data-theme attribute', () => {
    const service = createService(null);
    service.setTheme('cyberpunk');
    TestBed.flushEffects();
    expect(document.documentElement.getAttribute('data-theme')).toBe('cyberpunk');
  });
});
