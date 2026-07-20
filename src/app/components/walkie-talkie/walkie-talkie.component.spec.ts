import { TestBed } from '@angular/core/testing';
import {
  WalkieTalkieComponent,
  RadioProtocol,
  CHANNELS,
  DIALOGUE_NODES,
} from './walkie-talkie.component';
import { SimulationStateService } from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';
import { DataService } from '../../services/data.service';

describe('RadioProtocol.tuneFrequency', () => {
  it('returns 1.0 for an exact frequency match', () => {
    expect(RadioProtocol.tuneFrequency(2.41, 2.41)).toBe(1);
  });

  it('returns 0 at or beyond the 0.05 GHz tolerance boundary', () => {
    // 2.410 -> 2.460 = 0.05 exactly (within fp epsilon)
    expect(RadioProtocol.tuneFrequency(2.41, 2.46)).toBe(0);
    expect(RadioProtocol.tuneFrequency(2.41, 2.5)).toBe(0);
  });

  it('returns a partial signal proportional to offset within tolerance', () => {
    // offset 0.025 → half strength
    const s = RadioProtocol.tuneFrequency(2.41, 2.435);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
    expect(s).toBeCloseTo(0.5, 1);
  });

  it('never returns a value outside [0, 1]', () => {
    expect(RadioProtocol.tuneFrequency(2.41, 2.43)).toBeGreaterThanOrEqual(0);
    expect(RadioProtocol.tuneFrequency(2.41, 2.43)).toBeLessThanOrEqual(1);
    expect(RadioProtocol.tuneFrequency(2.41, 5.0)).toBe(0);
  });
});

describe('RadioProtocol.injectNoise', () => {
  it('returns the message unchanged at signal strength 1.0', () => {
    const msg = 'TNG NODE: loud and clear';
    expect(RadioProtocol.injectNoise(msg, 1)).toBe(msg);
  });

  it('garbles more characters at lower signal strength', () => {
    const msg = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const clear = RadioProtocol.injectNoise(msg, 1);
    const garbled = RadioProtocol.injectNoise(msg, 0.2);
    expect(clear).toBe(msg);
    // garbled must differ from clear (randomly, but ~80% substitution rate → near-certain)
    expect(garbled).not.toBe(clear);
    // length preserved
    expect(garbled.length).toBe(msg.length);
  });

  it('preserves message length regardless of signal strength', () => {
    const msg = 'Hello World 12345';
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      expect(RadioProtocol.injectNoise(msg, s).length).toBe(msg.length);
    }
  });

  it('only substitutes alphabetic characters (digits/punct/space left alone)', () => {
    const msg = '123 ABC!?.';
    // at signal 0 the alphabetic chars are likely substituted; the digit/space/punct aren't.
    const out = RadioProtocol.injectNoise(msg, 0);
    expect(out.slice(0, 4)).toBe('123 ');
    expect(out.slice(7)).toBe('!?.');
  });
});

describe('RadioProtocol.advanceDialogue', () => {
  it('returns the next node id for a known choice', () => {
    // CH1 root node 'ch1-root' has choices; first choice should resolve to its nextNodeId.
    const root = DIALOGUE_NODES.find((n) => n.nodeId === 'ch1-root');
    expect(root).toBeTruthy();
    const firstChoice = root!.choices[0];
    const next = RadioProtocol.advanceDialogue('ch1-root', firstChoice.label);
    expect(next).toBe(firstChoice.nextNodeId);
  });

  it('returns null for an unknown choice label', () => {
    expect(RadioProtocol.advanceDialogue('ch1-root', 'NONEXISTENT_CHOICE')).toBeNull();
  });
});

describe('WalkieTalkieComponent', () => {
  let component: WalkieTalkieComponent;
  let simState: SimulationStateService;
  let achievements: AchievementService;
  let dataService: DataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(WalkieTalkieComponent);
    component = fixture.componentInstance;
    simState = TestBed.inject(SimulationStateService);
    achievements = TestBed.inject(AchievementService);
    dataService = TestBed.inject(DataService);
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('defines 4 main channels + 1 hidden channel at the correct GHz', () => {
    expect(CHANNELS.length).toBe(5);
    const main = CHANNELS.filter((c) => !c.hidden);
    expect(main.length).toBe(4);
    expect(CHANNELS.find((c) => c.id === 'CH1')?.freqGHz).toBe(2.41);
    expect(CHANNELS.find((c) => c.id === 'CH2')?.freqGHz).toBe(2.43);
    expect(CHANNELS.find((c) => c.id === 'CH3')?.freqGHz).toBe(2.45);
    expect(CHANNELS.find((c) => c.id === 'CH4')?.freqGHz).toBe(2.47);
    const hidden = CHANNELS.find((c) => c.hidden);
    expect(hidden?.id).toBe('CH5');
    expect(hidden?.freqGHz).toBe(2.49);
  });

  it('scanFrequencies populates SimulationStateService.foundFrequencies synchronously with the 4 main channels', () => {
    (component as any).scanFrequencies();
    const found = simState.foundFrequencies();
    expect(found.length).toBe(4);
    expect(found).toContain('CH1:2.410');
    expect(found).toContain('CH4:2.470');
  });

  it('tuneChannel sets the connected frequency and recomputes signal strength', () => {
    (component as any).scanFrequencies();
    (component as any).tuneChannel('CH1');
    expect(simState.connectedFrequency()).toBe('CH1');
    // With current tune exactly on 2.410, signal should be 1.0
    expect((component as any).signalStrength()).toBe(1);
  });

  it('exposes dialogue text sourced from DataService bio / currentRole', () => {
    (component as any).scanFrequencies();
    (component as any).tuneChannel('CH1');
    (component as any).startDialogue();
    const text = simState.receivedTransmission();
    expect(text.length).toBeGreaterThan(0);
    // Bio mentions TNG + fullstack (Python/Angular/TypeScript) — at least one of those words appears.
    const bio = dataService.bio();
    const matched = ['TNG', 'Python', 'Angular', 'TypeScript'].some((w) => bio.includes(w));
    expect(matched).toBe(true);
  });

  it('reveals CH5 (hidden frequency) after completing CH1', () => {
    (component as any).scanFrequencies();
    (component as any).tuneChannel('CH1');
    // Force signal to perfect so completeCurrentChannel succeeds
    (component as any).setCurrentTune(2.41);
    (component as any).startDialogue();
    // Walk all CH1 nodes to completion.
    let safety = 0;
    while (component.currentNodeId() !== null && safety < 50) {
      const node = component.currentDialogueNode();
      if (!node || node.choices.length === 0) {
        (component as any).completeCurrentChannel();
        break;
      }
      (component as any).transmit(node.choices[0].label);
      // If completion was triggered (node had no choices), break.
      if (component.currentNodeId() === null) break;
      safety++;
    }
    const found = simState.foundFrequencies();
    expect(found.some((f) => f.includes('CH5'))).toBe(true);
  });

  it('unlocks all-conversations-complete achievement when all 4 main channels are completed', () => {
    (component as any).scanFrequencies();
    for (const chId of ['CH1', 'CH2', 'CH3', 'CH4']) {
      (component as any).tuneChannel(chId);
      const ch = CHANNELS.find((c) => c.id === chId)!;
      (component as any).setCurrentTune(ch.freqGHz);
      (component as any).startDialogue();
      let safety = 0;
      while (component.currentNodeId() !== null && safety < 50) {
        const node = component.currentDialogueNode();
        if (!node || node.choices.length === 0) {
          (component as any).completeCurrentChannel();
          break;
        }
        (component as any).transmit(node.choices[0].label);
        if (component.currentNodeId() === null) break;
        safety++;
      }
    }
    expect(achievements.isUnlocked('all-conversations-complete')).toBe(true);
  });
});
