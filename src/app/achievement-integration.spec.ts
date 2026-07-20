import { TestBed } from '@angular/core/testing';
import { AchievementService, Achievement } from './services/achievement.service';
import { SimulationStateService } from './services/simulation-state.service';

/**
 * Cross-widget achievement integration tests.
 *
 * Verifies the cross-unlock map: when an achievement from one widget fires,
 * a corresponding unlock is applied to another widget's state in
 * SimulationStateService. Also verifies the meta-achievement (arg-solved)
 * fires when all five base achievements are unlocked, and that the
 * recentlyUnlocked notification signal behaves correctly.
 */
describe('Cross-widget achievement integration', () => {
  let achievements: AchievementService;
  let simState: SimulationStateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    achievements = TestBed.inject(AchievementService);
    simState = TestBed.inject(SimulationStateService);
  });

  describe('cross-unlock map', () => {
    it('all-packets-routed unlocks a hidden gossip easter-egg node in simState', () => {
      expect(simState.gossipEasterEgg()).toBeNull();
      achievements.unlock('all-packets-routed');
      const node = simState.gossipEasterEgg();
      expect(node).not.toBeNull();
      expect(node?.id).toBe('easter-egg');
      expect(node?.label).toContain('Easter');
      expect(node?.body?.length).toBeGreaterThan(0);
    });

    it('all-conversations-complete unlocks a special rocket skin (nyancat variant) in rocketConfig', () => {
      expect(simState.rocketConfig().specialProfile).toBeUndefined();
      achievements.unlock('all-conversations-complete');
      const profile = simState.rocketConfig().specialProfile;
      expect(profile).toBeDefined();
      expect(profile).toBe('nyancat-achievement');
    });

    it('gossip-converged reveals the hidden CH5 walkie-talkie frequency', () => {
      expect(simState.foundFrequencies().some((f) => f.startsWith('CH5'))).toBe(false);
      achievements.unlock('gossip-converged');
      const found = simState.foundFrequencies();
      expect(found.some((f) => f.startsWith('CH5'))).toBe(true);
    });

    it('hidden-command-found unlocks the hidden DPDK routing rule preset flag', () => {
      expect(simState.dpdkPresetUnlocked()).toBe(false);
      achievements.unlock('hidden-command-found');
      expect(simState.dpdkPresetUnlocked()).toBe(true);
    });

    it('apogee-reached does not throw and leaves simState consistent (terminal VFS gate is tested in terminal spec)', () => {
      expect(() => achievements.unlock('apogee-reached')).not.toThrow();
      expect(achievements.isUnlocked('apogee-reached')).toBe(true);
    });
  });

  describe('meta-achievement: arg-solved', () => {
    it('auto-unlocks arg-solved when all five base achievements are unlocked', () => {
      expect(achievements.isUnlocked('arg-solved')).toBe(false);
      achievements.unlock('apogee-reached');
      achievements.unlock('all-packets-routed');
      achievements.unlock('all-conversations-complete');
      achievements.unlock('gossip-converged');
      expect(achievements.isUnlocked('arg-solved')).toBe(false);
      achievements.unlock('hidden-command-found');
      expect(achievements.isUnlocked('arg-solved')).toBe(true);
    });

    it('does NOT auto-unlock arg-solved when only four of five are unlocked', () => {
      achievements.unlock('apogee-reached');
      achievements.unlock('all-packets-routed');
      achievements.unlock('all-conversations-complete');
      achievements.unlock('gossip-converged');
      expect(achievements.isUnlocked('arg-solved')).toBe(false);
    });
  });

  describe('unlock notification signal', () => {
    it('unlock() sets recentlyUnlocked to the unlocked achievement', () => {
      expect(achievements.recentlyUnlocked()).toBeNull();
      achievements.unlock('apogee-reached');
      const recent: Achievement | null = achievements.recentlyUnlocked();
      expect(recent).not.toBeNull();
      expect(recent?.id).toBe('apogee-reached');
      expect(recent?.title).toBe('Apogee Reached');
    });

    it('clearRecentlyUnlocked() resets the signal to null', () => {
      achievements.unlock('gossip-converged');
      expect(achievements.recentlyUnlocked()).not.toBeNull();
      achievements.clearRecentlyUnlocked();
      expect(achievements.recentlyUnlocked()).toBeNull();
    });

    it('unlocking an already-unlocked achievement does not re-fire the notification', () => {
      achievements.unlock('apogee-reached');
      expect(achievements.recentlyUnlocked()?.id).toBe('apogee-reached');
      achievements.clearRecentlyUnlocked();
      achievements.unlock('apogee-reached');
      expect(achievements.recentlyUnlocked()).toBeNull();
    });
  });

  describe('achievements reset on re-instantiation', () => {
    it('re-instantiating resets all achievements (no localStorage persistence)', () => {
      achievements.unlock('all-packets-routed');
      achievements.unlock('all-conversations-complete');
      achievements.unlock('hidden-command-found');
      expect(achievements.isUnlocked('all-packets-routed')).toBe(true);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const reloadedAchievements = TestBed.inject(AchievementService);
      const reloadedSimState = TestBed.inject(SimulationStateService);

      expect(reloadedAchievements.isUnlocked('all-packets-routed')).toBe(false);
      expect(reloadedAchievements.isUnlocked('all-conversations-complete')).toBe(false);
      expect(reloadedAchievements.isUnlocked('hidden-command-found')).toBe(false);

      expect(reloadedSimState.gossipEasterEgg()).toBeNull();
      expect(reloadedSimState.rocketConfig().specialProfile).toBeUndefined();
      expect(reloadedSimState.dpdkPresetUnlocked()).toBe(false);
      expect(reloadedAchievements.recentlyUnlocked()).toBeNull();
    });
  });
});
