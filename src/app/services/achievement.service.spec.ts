import { TestBed } from '@angular/core/testing';
import { AchievementService } from './achievement.service';

describe('AchievementService', () => {
  let service: AchievementService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AchievementService);
  });

  it('unlock("apogee-reached") sets unlocked=true', () => {
    service.unlock('apogee-reached');
    const a = service.achievements().find((x) => x.id === 'apogee-reached');
    expect(a?.unlocked).toBe(true);
  });

  it('isUnlocked("apogee-reached") returns true after unlock', () => {
    expect(service.isUnlocked('apogee-reached')).toBe(false);
    service.unlock('apogee-reached');
    expect(service.isUnlocked('apogee-reached')).toBe(true);
  });

  it('achievements reset on re-instantiation (no localStorage persistence)', () => {
    service.unlock('gossip-converged');
    expect(service.isUnlocked('gossip-converged')).toBe(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(AchievementService);
    expect(reloaded.isUnlocked('gossip-converged')).toBe(false);
  });

  it('getUnlocked() returns only unlocked achievements', () => {
    service.unlock('apogee-reached');
    service.unlock('arg-solved');
    const unlocked = service.getUnlocked();
    expect(unlocked.length).toBe(2);
    expect(unlocked.map((a) => a.id).sort()).toEqual(['apogee-reached', 'arg-solved']);
  });

  it('initial achievements include the six canonical ids', () => {
    const ids = service.achievements().map((a) => a.id);
    expect(ids).toContain('apogee-reached');
    expect(ids).toContain('all-packets-routed');
    expect(ids).toContain('all-conversations-complete');
    expect(ids).toContain('gossip-converged');
    expect(ids).toContain('hidden-command-found');
    expect(ids).toContain('arg-solved');
  });
});
