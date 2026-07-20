import { Injectable, signal } from '@angular/core';

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

@Injectable({
  providedIn: 'root',
})
export class AchievementService {
  public readonly achievements = signal<Achievement[]>(
    INITIAL_ACHIEVEMENTS.map((a) => ({ ...a })),
  );

  constructor() {
    this.restore();
  }

  public unlock(achievementId: string): void {
    this.achievements.update((list) => {
      const idx = list.findIndex((a) => a.id === achievementId);
      if (idx === -1 || list[idx].unlocked) {
        return list;
      }
      const next = list.slice();
      next[idx] = { ...next[idx], unlocked: true };
      return next;
    });
    this.persist();
  }

  public isUnlocked(achievementId: string): boolean {
    const a = this.achievements().find((x) => x.id === achievementId);
    return a?.unlocked ?? false;
  }

  public getUnlocked(): Achievement[] {
    return this.achievements().filter((a) => a.unlocked);
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
