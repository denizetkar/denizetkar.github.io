import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from './services/data.service';
import { ThemeService, AppTheme } from './services/theme.service';
import { TerminalComponent } from './components/terminal/terminal.component';
import { GossipVisualizerComponent } from './components/gossip-visualizer/gossip-visualizer.component';
import { RocketSimulatorComponent } from './components/rocket-simulator/rocket-simulator.component';
import { DpdkRouterComponent } from './components/dpdk-router/dpdk-router.component';
import { WalkieTalkieComponent } from './components/walkie-talkie/walkie-talkie.component';
import { PortfolioCardsComponent } from './components/portfolio-cards/portfolio-cards.component';

export type DashboardTab = 'gossip' | 'rocket' | 'router' | 'radio' | 'portfolio';

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
export class App {
  public readonly dataService = inject(DataService);
  public readonly themeService = inject(ThemeService);

  // Active dashboard tab selection
  protected readonly activeTab = signal<DashboardTab>('gossip');

  // Interactive console toggles
  protected readonly isTerminalOpen = signal(false);

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

  protected selectTheme(theme: AppTheme) {
    this.themeService.setTheme(theme);
  }

  protected recoverSystem() {
    this.dataService.isCrashed.set(false);
  }
}
