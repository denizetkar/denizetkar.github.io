import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  WalkieTalkieComponent,
  RadioProtocol,
  CHANNELS,
  DIALOGUE_NODES,
} from './walkie-talkie.component';
import type { WritableSignal } from '@angular/core';
import type { Channel } from './walkie-talkie.component';
import { SimulationStateService } from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';
import { DataService } from '../../services/data.service';

/**
 * Test-only mirror of WalkieTalkieComponent's protected members
 * (each member re-declared with the same type as on the component).
 * `as unknown as WalkieTalkieHandle` re-exposes them to the spec without
 * weakening their types — every member must exist on WalkieTalkieComponent.
 */
type WalkieTalkieHandle = {
  isScanning: WritableSignal<boolean>;
  isPttHeld: WritableSignal<boolean>;
  signalStrength: WritableSignal<number>;
  completedChannels: WritableSignal<Set<Channel['id']>>;
  scanFrequencies(): void;
  tuneChannel(id: Channel['id']): void;
  setCurrentTune(freq: number): void;
  startPtt(): void;
  stopPtt(): void;
  startDialogue(): void;
  transmit(choiceLabel: string): void;
  completeCurrentChannel(): void;
};

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

  const c = () => component as unknown as WalkieTalkieHandle;

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

  it('scanFrequencies shows a SCANNING state then populates foundFrequencies after ~1s', async () => {
    vi.useFakeTimers();
    try {
      expect(c().isScanning()).toBe(false);
      c().scanFrequencies();
      // During the scan window: isScanning is true, radioStatus is 'scanning',
      // and foundFrequencies is not yet populated.
      expect(c().isScanning()).toBe(true);
      expect(simState.radioState().radioStatus).toBe('scanning');
      expect(simState.foundFrequencies().length).toBe(0);
      await vi.advanceTimersByTimeAsync(1000);
      // After the scan completes: isScanning is false, all 4 main channels found.
      expect(c().isScanning()).toBe(false);
      const found = simState.foundFrequencies();
      expect(found.length).toBe(4);
      expect(found).toContain('CH1:2.410');
      expect(found).toContain('CH4:2.470');
    } finally {
      vi.useRealTimers();
    }
  });

  it('scanFrequencies is a no-op while already scanning', async () => {
    vi.useFakeTimers();
    try {
      c().scanFrequencies();
      expect(c().isScanning()).toBe(true);
      // Second call should be ignored.
      c().scanFrequencies();
      expect(c().isScanning()).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(c().isScanning()).toBe(false);
      expect(simState.foundFrequencies().length).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tuneChannel auto-starts the dialogue (no dead STANDBY panel)', () => {
    c().tuneChannel('CH1');
    expect(simState.connectedFrequency()).toBe('CH1');
    expect(component.currentDialogueNode()).not.toBeNull();
    expect(component.currentDialogueNode()?.channel).toBe('CH1');
    // Transmission text is already populated from the auto-started dialogue.
    expect(simState.receivedTransmission().length).toBeGreaterThan(0);
  });

  it('PTT (startPtt + stopPtt) advances the dialogue by confirming the first choice', () => {
    c().tuneChannel('CH1');
    const root = component.currentDialogueNode();
    expect(root?.nodeId).toBe('ch1-root');
    c().startPtt();
    expect(c().isPttHeld()).toBe(true);
    c().stopPtt();
    expect(c().isPttHeld()).toBe(false);
    // stopPtt transmitted the first choice → dialogue advanced to ch1-tng.
    expect(component.currentDialogueNode()?.nodeId).toBe('ch1-tng');
  });

  it('PTT on a terminal node completes the channel', () => {
    c().tuneChannel('CH1');
    c().setCurrentTune(2.41);
    // Walk to the terminal ch1-tng node (one choice: "Over and out").
    c().transmit(component.currentDialogueNode()!.choices[0].label);
    expect(component.currentDialogueNode()?.nodeId).toBe('ch1-tng');
    // PTT on the terminal node → completes the channel.
    c().startPtt();
    c().stopPtt();
    expect(component.currentDialogueNode()).toBeNull();
    expect(c().completedChannels().has('CH1')).toBe(true);
  });

  it('tuneChannel sets the connected frequency and recomputes signal strength', () => {
    c().scanFrequencies();
    c().tuneChannel('CH1');
    expect(simState.connectedFrequency()).toBe('CH1');
    // With current tune exactly on 2.410, signal should be 1.0
    expect(c().signalStrength()).toBe(1);
  });

  it('exposes dialogue text sourced from DataService bio / currentRole', () => {
    c().scanFrequencies();
    c().tuneChannel('CH1');
    c().startDialogue();
    const text = simState.receivedTransmission();
    expect(text.length).toBeGreaterThan(0);
    // Bio mentions TNG + fullstack (Python/Angular/TypeScript) — at least one of those words appears.
    const bio = dataService.bio();
    const matched = ['TNG', 'Python', 'Angular', 'TypeScript'].some((w) => bio.includes(w));
    expect(matched).toBe(true);
  });

  it('reveals CH5 (hidden frequency) after completing CH1', () => {
    c().scanFrequencies();
    c().tuneChannel('CH1');
    // Force signal to perfect so completeCurrentChannel succeeds
    c().setCurrentTune(2.41);
    c().startDialogue();
    // Walk all CH1 nodes to completion.
    let safety = 0;
    while (component.currentNodeId() !== null && safety < 50) {
      const node = component.currentDialogueNode();
      if (!node || node.choices.length === 0) {
        c().completeCurrentChannel();
        break;
      }
      c().transmit(node.choices[0].label);
      // If completion was triggered (node had no choices), break.
      if (component.currentNodeId() === null) break;
      safety++;
    }
    const found = simState.foundFrequencies();
    expect(found.some((f) => f.includes('CH5'))).toBe(true);
  });

  it('CH5 dialogue contains the OMEGA-7 ARG hint and is tunable after CH1 completes', () => {
    const ch5Node = DIALOGUE_NODES.find((n) => n.channel === 'CH5');
    expect(ch5Node).toBeTruthy();
    expect(ch5Node!.text).toContain('OMEGA-7');
    // CH5 is hidden until CH1 completes — tuneChannel is a no-op before reveal.
    c().tuneChannel('CH5');
    expect(simState.connectedFrequency()).not.toBe('CH5');
    // Complete CH1 to reveal CH5.
    c().tuneChannel('CH1');
    c().setCurrentTune(2.41);
    let safety = 0;
    while (component.currentNodeId() !== null && safety < 50) {
      const node = component.currentDialogueNode();
      if (!node || node.choices.length === 0) {
        c().completeCurrentChannel();
        break;
      }
      c().transmit(node.choices[0].label);
      if (component.currentNodeId() === null) break;
      safety++;
    }
    expect(simState.foundFrequencies().some((f) => f.includes('CH5'))).toBe(true);
    // Now CH5 tunes and auto-starts its dialogue (with the OMEGA-7 hint).
    c().tuneChannel('CH5');
    expect(simState.connectedFrequency()).toBe('CH5');
    expect(component.currentDialogueNode()?.channel).toBe('CH5');
    expect(simState.receivedTransmission()).toContain('OMEGA-7');
  });

  it('unlocks all-conversations-complete achievement when all 4 main channels are completed', () => {
    c().scanFrequencies();
    for (const chId of ['CH1', 'CH2', 'CH3', 'CH4'] as const) {
      c().tuneChannel(chId);
      const ch = CHANNELS.find((c) => c.id === chId)!;
      c().setCurrentTune(ch.freqGHz);
      c().startDialogue();
      let safety = 0;
      while (component.currentNodeId() !== null && safety < 50) {
        const node = component.currentDialogueNode();
        if (!node || node.choices.length === 0) {
          c().completeCurrentChannel();
          break;
        }
        c().transmit(node.choices[0].label);
        if (component.currentNodeId() === null) break;
        safety++;
      }
    }
    expect(achievements.isUnlocked('all-conversations-complete')).toBe(true);
  });
});
