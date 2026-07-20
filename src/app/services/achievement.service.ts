import { Injectable, inject, signal } from '@angular/core';
import { SimulationStateService, GossipEasterEggNode } from './simulation-state.service';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockCondition: string;
}

interface PersistedAchievement {
  id: string;
  unlocked: boolean;
}

const STORAGE_KEY = 'achievements';

const INITIAL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'apogee-reached',
    title: 'Apogee Reached',
    description: 'Launch the rocket and reach apogee at 10,000m or above.',
    unlocked: false,
    unlockCondition: 'rocketState.altitude >= 10000 && flightState === "apogee"',
  },
  {
    id: 'all-packets-routed',
    title: 'All Packets Routed',
    description: 'Successfully route every packet through the DPDK router without alarms.',
    unlocked: false,
    unlockCondition: 'packets.length > 0 && all routed && !alarmActive',
  },
  {
    id: 'all-conversations-complete',
    title: 'All Conversations Complete',
    description: 'Complete every walkie-talkie conversation branch.',
    unlocked: false,
    unlockCondition: 'conversationState reaches every terminal node',
  },
  {
    id: 'gossip-converged',
    title: 'Gossip Converged',
    description: 'Achieve full convergence across the gossip network.',
    unlocked: false,
    unlockCondition: 'convergencePercent >= 100',
  },
  {
    id: 'hidden-command-found',
    title: 'Hidden Command Found',
    description: 'Discover a hidden terminal command.',
    unlocked: false,
    unlockCondition: 'undocumented command invoked in terminal',
  },
  {
    id: 'arg-solved',
    title: 'ARG Solved',
    description: 'Solve the full ARG puzzle chain (OMEGA-7 → SIGMA-13).',
    unlocked: false,
    unlockCondition: 'gossipArgSolved && argCompleted',
  },
];

const BASE_ACHIEVEMENT_IDS = [
  'apogee-reached',
  'all-packets-routed',
  'all-conversations-complete',
  'gossip-converged',
  'hidden-command-found',
];

const GOSSIP_EASTER_EGG: GossipEasterEggNode = {
  id: 'easter-egg',
  label: 'Easter Egg',
  title: 'Hidden Gossip Node',
  body: [
    'You found the hidden gossip node.',
    'DPDK routing mastery unlocks back-channel gossip.',
    'Packet whispers travel faster than rumors.',
  ],
};

@Injectable({
  providedIn: 'root',
})
export class AchievementService {
  public readonly achievements = signal<Achievement[]>(
    INITIAL_ACHIEVEMENTS.map((a) => ({ ...a })),
  );

  public readonly recentlyUnlocked = signal<Achievement | null>(null);

  private readonly simState = inject(SimulationStateService);

  constructor() {
    this.restore();
    this.applyCrossUnlocksFromState();
  }

  public unlock(achievementId: string): void {
    let didChange = false;
    let unlockedAchievement: Achievement | null = null;
    this.achievements.update((list) => {
      const idx = list.findIndex((a) => a.id === achievementId);
      if (idx === -1 || list[idx].unlocked) {
        return list;
      }
      didChange = true;
      const next = list.slice();
      const updated = { ...next[idx], unlocked: true };
      next[idx] = updated;
      unlockedAchievement = updated;
      return next;
    });
    if (didChange) {
      this.persist();
      this.applyCrossUnlock(achievementId);
      this.checkMetaAchievement();
      if (unlockedAchievement !== null) {
        this.recentlyUnlocked.set(unlockedAchievement);
      }
    }
  }

  public clearRecentlyUnlocked(): void {
    this.recentlyUnlocked.set(null);
  }

  public isUnlocked(achievementId: string): boolean {
    const a = this.achievements().find((x) => x.id === achievementId);
    return a?.unlocked ?? false;
  }

  public getUnlocked(): Achievement[] {
    return this.achievements().filter((a) => a.unlocked);
  }

  private applyCrossUnlock(achievementId: string): void {
    switch (achievementId) {
      case 'all-packets-routed':
        if (this.simState.gossipEasterEgg() === null) {
          this.simState.gossipEasterEgg.set(GOSSIP_EASTER_EGG);
        }
        break;
      case 'all-conversations-complete':
        if (this.simState.rocketConfig().specialProfile !== 'nyancat-achievement') {
          this.simState.rocketConfig.update((cfg) => ({
            ...cfg,
            specialProfile: 'nyancat-achievement',
          }));
        }
        break;
      case 'gossip-converged': {
        const found = this.simState.foundFrequencies();
        if (!found.some((f) => f.startsWith('CH5'))) {
          this.simState.foundFrequencies.update((list) => [...list, 'CH5:2.490']);
        }
        break;
      }
      case 'hidden-command-found':
        if (!this.simState.dpdkPresetUnlocked()) {
          this.simState.dpdkPresetUnlocked.set(true);
        }
        break;
      case 'apogee-reached':
        // Terminal VFS already gates .secrets on this achievement — nothing to do here.
        break;
      default:
        break;
    }
  }

  private checkMetaAchievement(): void {
    if (this.isUnlocked('arg-solved')) {
      return;
    }
    const allBase = BASE_ACHIEVEMENT_IDS.every((id) => this.isUnlocked(id));
    if (!allBase) {
      return;
    }
    this.achievements.update((list) => {
      const idx = list.findIndex((a) => a.id === 'arg-solved');
      if (idx === -1 || list[idx].unlocked) {
        return list;
      }
      const next = list.slice();
      const updated = { ...next[idx], unlocked: true };
      next[idx] = updated;
      this.recentlyUnlocked.set(updated);
      return next;
    });
    this.persist();
  }

  private applyCrossUnlocksFromState(): void {
    for (const id of BASE_ACHIEVEMENT_IDS) {
      if (this.isUnlocked(id)) {
        this.applyCrossUnlock(id);
      }
    }
    if (this.isUnlocked('arg-solved')) {
      // arg-solved is the meta — already persisted; nothing else to apply.
    }
  }

  private restore(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PersistedAchievement[];
      if (!Array.isArray(parsed)) {
        return;
      }
      const unlockedIds = new Set(parsed.filter((p) => p.unlocked).map((p) => p.id));
      this.achievements.update((list) =>
        list.map((a) => (unlockedIds.has(a.id) ? { ...a, unlocked: true } : a)),
      );
    } catch {
      // Corrupt storage — ignore and keep defaults.
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const payload: PersistedAchievement[] = this.achievements().map((a) => ({
      id: a.id,
      unlocked: a.unlocked,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }
}
