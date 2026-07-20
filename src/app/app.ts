import { Component, inject, signal, computed, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from './services/data.service';
import { ThemeService, AppTheme } from './services/theme.service';
import { AchievementService, Achievement } from './services/achievement.service';
import { TerminalComponent } from './components/terminal/terminal.component';
import { GossipVisualizerComponent } from './components/gossip-visualizer/gossip-visualizer.component';
import { RocketSimulatorComponent } from './components/rocket-simulator/rocket-simulator.component';
import { DpdkRouterComponent } from './components/dpdk-router/dpdk-router.component';
import { WalkieTalkieComponent } from './components/walkie-talkie/walkie-talkie.component';
import { PortfolioCardsComponent } from './components/portfolio-cards/portfolio-cards.component';

export type DashboardTab = 'gossip' | 'rocket' | 'router' | 'radio' | 'portfolio';

const NOTIFICATION_DISMISS_MS = 5000;

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    TerminalComponent,
    GossipVisualizerComponent,
    RocketSimulatorComponent,
    DpdkRouterComponent,
    WalkieTalkieComponent,
    PortfolioCardsComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnDestroy {
  public readonly dataService = inject(DataService);
  public readonly themeService = inject(ThemeService);
  public readonly achievements = inject(AchievementService);

  // Active dashboard tab selection
  protected readonly activeTab = signal<DashboardTab>('gossip');

  // Interactive console toggles
  protected readonly isTerminalOpen = signal(false);

  // Achievements panel toggle (header button)
  protected readonly isAchievementsPanelOpen = signal(false);

  // Cross-widget unlock notification banner
  protected readonly activeNotification = computed<Achievement | null>(
    () => this.achievements.recentlyUnlocked(),
  );

  protected readonly unlockedAchievements = computed<Achievement[]>(() =>
    this.achievements.getUnlocked(),
  );

  protected readonly totalAchievements = computed<number>(() =>
    this.achievements.achievements().length,
  );

  private readonly autoDismissEffect = effect(() => {
    const recent = this.achievements.recentlyUnlocked();
    if (recent === null) {
      return;
    }
    const handle = setTimeout(() => {
      this.achievements.clearRecentlyUnlocked();
    }, NOTIFICATION_DISMISS_MS);
    // The effect re-runs whenever recentlyUnlocked changes; the previous timer
    // is naturally discarded because the closure captures only the latest handle.
    // Keep a reference so ngOnDestroy can clear it on teardown.
    this.pendingDismissHandle = handle;
  });

  private pendingDismissHandle: ReturnType<typeof setTimeout> | null = null;

  // Computed state for the GPOD / Green Screen of Death crash screen
  protected readonly isSystemCrashed = computed(() => this.dataService.isCrashed());

  // Text infection scrambler effect
  protected readonly mainHeading = computed(() => {
    const defaultText = "DENIZ ETKAR";
    if (this.dataService.isInfected()) {
      // Scramble characters randomly
      return defaultText
        .split('')
        .map(() => Math.random().toString(36).charAt(2).toUpperCase())
        .join('');
    }
    return defaultText;
  });

  protected readonly subHeading = computed(() => {
    const defaultText = "MISSION CONTROL CENTER";
    if (this.dataService.isInfected()) {
      return defaultText
        .split('')
        .map(() => Math.random().toString(36).charAt(2).toUpperCase())
        .join('');
    }
    return defaultText;
  });

  protected setTab(tab: DashboardTab) {
    this.activeTab.set(tab);
  }

  protected toggleTerminal() {
    this.isTerminalOpen.update(open => !open);
  }

  protected toggleAchievementsPanel() {
    this.isAchievementsPanelOpen.update(open => !open);
  }

  protected dismissNotification() {
    this.achievements.clearRecentlyUnlocked();
  }

  protected selectTheme(theme: AppTheme) {
    this.themeService.setTheme(theme);
  }

  protected recoverSystem() {
    this.dataService.isCrashed.set(false);
  }

  ngOnDestroy(): void {
    if (this.pendingDismissHandle !== null) {
      clearTimeout(this.pendingDismissHandle);
      this.pendingDismissHandle = null;
    }
  }
}
