import { Component, inject, signal, computed, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from './services/data.service';
import { ThemeService, AppTheme } from './services/theme.service';
import { AchievementService, Achievement } from './services/achievement.service';
import { SimulationStateService } from './services/simulation-state.service';
import { TerminalComponent } from './components/terminal/terminal.component';
import { GossipVisualizerComponent } from './components/gossip-visualizer/gossip-visualizer.component';
import { RocketSimulatorComponent } from './components/rocket-simulator/rocket-simulator.component';
import { DpdkRouterComponent } from './components/dpdk-router/dpdk-router.component';
import { WalkieTalkieComponent } from './components/walkie-talkie/walkie-talkie.component';
import { PortfolioCardsComponent } from './components/portfolio-cards/portfolio-cards.component';

export type DashboardTab = 'gossip' | 'rocket' | 'router' | 'radio' | 'portfolio';

const NOTIFICATION_DISMISS_MS = 5000;

export interface ProfileSection {
  readonly id: string;
  readonly label: string;
  readonly widget: string;
  readonly tab: DashboardTab;
  readonly achievementId: string;
  readonly decrypted: boolean;
  readonly lines: readonly string[];
}

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
  public readonly simState = inject(SimulationStateService);

  // Active dashboard tab selection
  protected readonly activeTab = signal<DashboardTab>('gossip');

  // ARG-completed site-wide green flash overlay
  protected readonly argCompleted = computed(() => this.simState.argCompleted());

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

  protected readonly isProfilePanelOpen = signal(true);

  private readonly profileSectionDefs: readonly {
    readonly id: string;
    readonly label: string;
    readonly widget: string;
    readonly tab: DashboardTab;
    readonly achievementId: string;
    readonly lines: () => readonly string[];
  }[] = [
    {
      id: 'about',
      label: 'ABOUT ME',
      widget: 'Gossip Mesh',
      tab: 'gossip',
      achievementId: 'gossip-converged',
      lines: () => [this.dataService.bio(), ...this.dataService.education().map((e) => `${e.degree} ${e.field} — ${e.institution} (${e.startYear}-${e.endYear})`)],
    },
    {
      id: 'career',
      label: 'CAREER',
      widget: 'Flight Computer',
      tab: 'rocket',
      achievementId: 'apogee-reached',
      lines: () => [this.dataService.currentRole(), ...this.dataService.timeline().map((m) => `${m.year} · ${m.title} — ${m.description}`)],
    },
    {
      id: 'skills',
      label: 'SKILLS',
      widget: 'DPDK Router',
      tab: 'router',
      achievementId: 'all-packets-routed',
      lines: () => this.dataService.skills().flatMap((g) => [`${g.category}:`, ...g.skills]),
    },
    {
      id: 'projects',
      label: 'PROJECTS',
      widget: 'BLE Radio',
      tab: 'radio',
      achievementId: 'all-conversations-complete',
      lines: () => this.dataService.projects().flatMap((p) => [`${p.name} — ${p.description}`, `Tech: ${p.tech.join(', ')}`]),
    },
    {
      id: 'contact',
      label: 'CONTACT',
      widget: 'Terminal CLI',
      tab: 'portfolio',
      achievementId: 'hidden-command-found',
      lines: () => [`Email: ${this.dataService.email()}`, `GitHub: ${this.dataService.githubUrl()}`, `LinkedIn: ${this.dataService.linkedinUrl()}`],
    },
  ];

  protected readonly profileSections = computed<ProfileSection[]>(() => {
    const achievements = this.achievements;
    return this.profileSectionDefs.map((def) => ({
      id: def.id,
      label: def.label,
      widget: def.widget,
      tab: def.tab,
      achievementId: def.achievementId,
      decrypted: achievements.isUnlocked(def.achievementId),
      lines: achievements.isUnlocked(def.achievementId) ? def.lines() : [],
    }));
  });

  protected readonly profileDecryptCount = computed<number>(() =>
    this.profileSections().filter((s) => s.decrypted).length,
  );

  protected readonly profileComplete = computed<boolean>(() =>
    this.profileDecryptCount() === this.profileSectionDefs.length,
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

  protected toggleProfilePanel() {
    this.isProfilePanelOpen.update(open => !open);
  }

  protected jumpToTab(tab: DashboardTab) {
    this.activeTab.set(tab);
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
