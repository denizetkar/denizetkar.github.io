import { Component, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SimulationStateService } from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';
import { DataService } from '../../services/data.service';

// --- Frequency spectrum ---

export interface Channel {
  id: 'CH1' | 'CH2' | 'CH3' | 'CH4' | 'CH5';
  freqGHz: number;
  hidden: boolean;
  bars: number; // 1-5 signal strength indicator for scan results
}

export const CHANNELS: readonly Channel[] = [
  { id: 'CH1', freqGHz: 2.41, hidden: false, bars: 4 },
  { id: 'CH2', freqGHz: 2.43, hidden: false, bars: 2 },
  { id: 'CH3', freqGHz: 2.45, hidden: false, bars: 3 },
  { id: 'CH4', freqGHz: 2.47, hidden: false, bars: 5 },
  { id: 'CH5', freqGHz: 2.49, hidden: true, bars: 5 },
];

// --- Branching dialogue tree ---

export interface DialogueChoice {
  label: string;
  nextNodeId: string | null; // null = terminal (conversation complete)
}

export interface DialogueNode {
  nodeId: string;
  channel: Channel['id'];
  speaker: 'DENIZ' | 'RADIO';
  text: string;
  choices: DialogueChoice[];
}

const TNG = 'TNG Technology Consulting in Munich — I work fullstack across Python, Angular, TypeScript, and Kotlin/Java as a Senior Consultant (since Sep 2024).';
const BOGAZICI = 'Boğaziçi University — two B.Sc. degrees (Industrial Engineering + Computer Engineering, 2013-2019, GPA 3.68). Operations research, optimization, stats, plus the beautiful campus.';
const ADVICE = 'My advice: do not run away from systems code. Assembly, memory, and OS kernels make you a better coder, even if you ship Angular and Python most days.';
const LOWLEVEL = 'DPDK and embedded C++ taught me to respect every nanosecond. The low-level roots run deep — I squeeze performance out of Angular templates and Python pipelines now, but the instinct is the same.';
const HIDDEN = 'CH5 hidden band. You found the frequency the noise floor hides. Every conversation matters — every nanosecond matters. Static resolves into a whispered launch code: OMEGA-7. Transmission ends.';

export const DIALOGUE_NODES: readonly DialogueNode[] = [
  // CH1 — TNG + fullstack
  {
    nodeId: 'ch1-root',
    channel: 'CH1',
    speaker: 'DENIZ',
    text: `${TNG} What do you want to dig into?`,
    choices: [
      { label: 'Tell me more about TNG', nextNodeId: 'ch1-tng' },
      { label: 'What about your stack?', nextNodeId: 'ch1-stack' },
    ],
  },
  {
    nodeId: 'ch1-tng',
    channel: 'CH1',
    speaker: 'DENIZ',
    text: 'TNG is a Munich consulting house. We solve real software architecture and backend engineering problems for clients daily — no toy projects, no slide decks, just shipped systems.',
    choices: [{ label: 'Over and out', nextNodeId: null }],
  },
  {
    nodeId: 'ch1-stack',
    channel: 'CH1',
    speaker: 'DENIZ',
    text: 'Python on the backend, Angular 22 with Signals on the frontend, TypeScript everywhere, Kotlin/Java on Android. Fullstack in the truest sense.',
    choices: [{ label: 'Over and out', nextNodeId: null }],
  },
  // CH2 — Boğaziçi
  {
    nodeId: 'ch2-root',
    channel: 'CH2',
    speaker: 'DENIZ',
    text: `${BOGAZICI} Where do you want to go from there?`,
    choices: [
      { label: 'Why two majors?', nextNodeId: 'ch2-why' },
      { label: 'What did you study?', nextNodeId: 'ch2-what' },
    ],
  },
  {
    nodeId: 'ch2-why',
    channel: 'CH2',
    speaker: 'DENIZ',
    text: 'Industrial Engineering gave me optimization and operations research; Computer Engineering gave me algorithms and systems. Together they made me the engineer I am.',
    choices: [{ label: 'Over and out', nextNodeId: null }],
  },
  {
    nodeId: 'ch2-what',
    channel: 'CH2',
    speaker: 'DENIZ',
    text: 'Operations research, mathematical optimization, statistics, algorithms, data structures. The optimization mindset never left — it shows up in every system I design.',
    choices: [{ label: 'Over and out', nextNodeId: null }],
  },
  // CH3 — Advice
  {
    nodeId: 'ch3-root',
    channel: 'CH3',
    speaker: 'DENIZ',
    text: `${ADVICE} Pick a thread:`,
    choices: [
      { label: 'Why low-level?', nextNodeId: 'ch3-why' },
      { label: 'Any concrete advice?', nextNodeId: 'ch3-advice' },
    ],
  },
  {
    nodeId: 'ch3-why',
    channel: 'CH3',
    speaker: 'DENIZ',
    text: 'Because every abstraction leaks. If you understand memory layouts, cache lines, and the kernel, every higher-level decision you make is grounded in reality instead of folklore.',
    choices: [{ label: 'Over and out', nextNodeId: null }],
  },
  {
    nodeId: 'ch3-advice',
    channel: 'CH3',
    speaker: 'DENIZ',
    text: 'Read the source. Profile before you optimize. Write the boring test first. Ship the smallest correct diff. The rest is fashion.',
    choices: [{ label: 'Over and out', nextNodeId: null }],
  },
  // CH4 — Low-level roots
  {
    nodeId: 'ch4-root',
    channel: 'CH4',
    speaker: 'DENIZ',
    text: `${LOWLEVEL} Choose a branch:`,
    choices: [
      { label: 'Tell me about DPDK', nextNodeId: 'ch4-dpdk' },
      { label: 'And the embedded side?', nextNodeId: 'ch4-embedded' },
    ],
  },
  {
    nodeId: 'ch4-dpdk',
    channel: 'CH4',
    speaker: 'DENIZ',
    text: 'DPDK is kernel-bypass packet processing. My dpdk-router project routes IPv4 at line rate, bypassing the Linux network stack. You learn to count nanoseconds.',
    choices: [{ label: 'Over and out', nextNodeId: null }],
  },
  {
    nodeId: 'ch4-embedded',
    channel: 'CH4',
    speaker: 'DENIZ',
    text: 'Embedded flight software on STM32 — sensor fusion (Madgwick AHRS), quaternion PID fin control, apogee detection, parachute deployment. Real-time to the microsecond.',
    choices: [{ label: 'Over and out', nextNodeId: null }],
  },
  // CH5 — Hidden
  {
    nodeId: 'ch5-root',
    channel: 'CH5',
    speaker: 'RADIO',
    text: HIDDEN,
    choices: [{ label: 'Over and out', nextNodeId: null }],
  },
];

const NOISE_CHARS = '█▓▒░#%@&?';
const TOLERANCE = 0.05;
const CLEAR_THRESHOLD = 0.8;
const GARBLED_THRESHOLD = 0.5;
const START_FREQ = 2.400;
const SLIDER_MIN = 2.400;
const SLIDER_MAX = 2.500;

// --- Pure protocol logic ---

export class RadioProtocol {
  static tuneFrequency(targetFreq: number, currentFreq: number): number {
    const diff = Math.abs(targetFreq - currentFreq);
    if (diff >= TOLERANCE - 1e-9) return 0;
    return 1 - diff / TOLERANCE;
  }

  static injectNoise(message: string, signalStrength: number): string {
    const s = Math.min(1, Math.max(0, signalStrength));
    if (s >= 1) return message;
    const noiseRate = 1 - s;
    let out = '';
    for (let i = 0; i < message.length; i++) {
      const ch = message[i];
      // Only substitute alphabetic characters; digits, punctuation, and spaces pass through.
      const isAlpha = /[A-Za-z]/.test(ch);
      if (isAlpha && Math.random() < noiseRate) {
        out += NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
      } else {
        out += ch;
      }
    }
    return out;
  }

  static advanceDialogue(currentNodeId: string, userChoice: string): string | null {
    const node = DIALOGUE_NODES.find((n) => n.nodeId === currentNodeId);
    if (!node) return null;
    const choice = node.choices.find((c) => c.label === userChoice);
    if (!choice) return null;
    return choice.nextNodeId;
  }
}

@Component({
  selector: 'app-walkie-talkie',
  imports: [CommonModule],
  templateUrl: './walkie-talkie.component.html',
  styleUrl: './walkie-talkie.component.scss',
})
export class WalkieTalkieComponent implements OnDestroy {
  protected readonly simState: SimulationStateService;
  private readonly achievements: AchievementService;
  private readonly data: DataService;

  // Local UI signals
  protected readonly isPowered = signal(true);
  protected readonly isScanning = signal(false);
  protected readonly activeChannel = signal<number>(1);
  protected readonly isPttHeld = signal(false);
  protected readonly staticActive = signal(false);
  protected readonly currentTune = signal<number>(START_FREQ);
  protected readonly signalStrength = signal<number>(0);
  protected readonly completedChannels = signal<Set<Channel['id']>>(new Set());
  protected readonly scanResults = signal<readonly Channel[]>([]);
  protected readonly pttFeedback = signal<string>('');

  // Active dialogue
  private readonly _currentNodeId = signal<string | null>(null);

  constructor(simState: SimulationStateService, achievements: AchievementService, data: DataService) {
    this.simState = simState;
    this.achievements = achievements;
    this.data = data;
    // Sync radio power state to SimulationStateService on construction.
    simState.radioState.set({
      isPowered: true,
      isScanning: false,
      activeChannel: 1,
      isPttHeld: false,
      radioStatus: 'disconnected',
      staticActive: true,
    });
    this.recomputeSignal();
  }

  ngOnDestroy() {
    if (this.scanTimer !== null) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  // --- Template helpers (Angular templates can't call parseFloat directly) ---

  protected parseFloatValue(v: string): number {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  protected channelRotation(): number {
    return this.activeChannel() * 45;
  }

  // --- Component accessors for tests/template ---

  currentNodeId(): string | null {
    return this._currentNodeId();
  }

  currentDialogueNode(): DialogueNode | null {
    const id = this._currentNodeId();
    if (id === null) return null;
    return DIALOGUE_NODES.find((n) => n.nodeId === id) ?? null;
  }

  protected channels(): readonly Channel[] {
    return CHANNELS;
  }

  protected isFrequencyFound(id: Channel['id']): boolean {
    return this.simState.foundFrequencies().some((f) => f.startsWith(id));
  }

  protected signalBars(): string {
    const s = this.signalStrength();
    const filled = Math.round(s * 5);
    return '▓'.repeat(filled) + '░'.repeat(5 - filled);
  }

  protected isClear(): boolean {
    return this.signalStrength() > CLEAR_THRESHOLD;
  }

  protected isGarbled(): boolean {
    const s = this.signalStrength();
    return s > GARBLED_THRESHOLD && s <= CLEAR_THRESHOLD;
  }

  // --- Frequency scan ---

  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  protected scanFrequencies(): void {
    if (!this.isPowered() || this.isScanning()) return;
    this.isScanning.set(true);
    this.simState.radioState.update((s) => ({ ...s, isScanning: true, radioStatus: 'scanning' }));
    // Brief delay so the user sees the "SCANNING..." state before results appear.
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      const main = CHANNELS.filter((c) => !c.hidden);
      this.scanResults.set(main);
      const freqs = main.map((c) => `${c.id}:${c.freqGHz.toFixed(3)}`);
      this.simState.foundFrequencies.set(freqs);
      this.simState.radioState.update((s) => ({
        ...s,
        isScanning: false,
        radioStatus: this.simState.connectedFrequency() ? 'connected' : 'disconnected',
      }));
      this.isScanning.set(false);
    }, 1000);
  }

  // --- Channel tuning ---

  protected tuneChannel(id: Channel['id']): void {
    if (!this.isPowered()) return;
    const ch = CHANNELS.find((c) => c.id === id);
    if (!ch || (ch.hidden && !this.simState.foundFrequencies().some((f) => f.startsWith(id)))) {
      return;
    }
    this.simState.connectedFrequency.set(id);
    this.simState.radioState.update((s) => ({
      ...s,
      activeChannel: parseInt(id.replace('CH', ''), 10),
      radioStatus: 'connected',
    }));
    this.currentTune.set(this.deadFrequencyFor(ch.freqGHz));
    this._currentNodeId.set(null);
    this.recomputeSignal();
    this.pttFeedback.set('');
  }

  private deadFrequencyFor(targetFreq: number): number {
    const lo = targetFreq - TOLERANCE - 0.001;
    const hi = targetFreq + TOLERANCE + 0.001;
    const loClamped = Math.max(SLIDER_MIN, lo);
    const hiClamped = Math.min(SLIDER_MAX, hi);
    return hiClamped <= SLIDER_MAX ? hiClamped : loClamped;
  }

  protected setCurrentTune(freq: number): void {
    this.currentTune.set(freq);
    this.recomputeSignal();
  }

  protected recomputeSignal(): void {
    const id = this.simState.connectedFrequency();
    if (!id) {
      this.signalStrength.set(0);
      this.updateStatic(true);
      return;
    }
    const ch = CHANNELS.find((c) => c.id === id);
    if (!ch) {
      this.signalStrength.set(0);
      this.updateStatic(true);
      return;
    }
    const signal = RadioProtocol.tuneFrequency(ch.freqGHz, this.currentTune());
    this.signalStrength.set(signal);
    this.updateStatic(signal < CLEAR_THRESHOLD);
    // Live preview: garbled text appears as signal improves.
    this.previewTransmission();
  }

  private updateStatic(active: boolean): void {
    this.staticActive.set(active);
    this.simState.radioState.update((s) => ({ ...s, staticActive: active }));
  }

  private previewTransmission(): void {
    const id = this.simState.connectedFrequency();
    if (!id) {
      this.simState.receivedTransmission.set('');
      return;
    }
    const signal = this.signalStrength();
    if (signal < GARBLED_THRESHOLD) {
      // Below 0.5 — pure static.
      this.simState.receivedTransmission.set(this.staticNoise());
      return;
    }
    if (signal < CLEAR_THRESHOLD) {
      // Between 0.5 and 0.8 — garbled preview of what's coming.
      this.simState.receivedTransmission.set(this.garbledPreview(id as Channel['id']));
      return;
    }
    // Above 0.8 — clear preview or active dialogue.
    const node = this.currentDialogueNode();
    if (node !== null) {
      this.simState.receivedTransmission.set(node.text);
    } else {
      this.simState.receivedTransmission.set('◉ SIGNAL LOCKED — HOLD PTT TO TRANSMIT');
    }
  }

  private staticNoise(): string {
    const chars = NOISE_CHARS;
    let out = '';
    for (let i = 0; i < 40; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  private garbledPreview(channelId: Channel['id']): string {
    const root = DIALOGUE_NODES.find((n) => n.channel === channelId && n.nodeId.endsWith('-root'));
    const text = root?.text ?? '...transmission detected...';
    return RadioProtocol.injectNoise(text, this.signalStrength());
  }

  // --- Dialogue flow ---

  protected startDialogue(): void {
    const id = this.simState.connectedFrequency();
    if (!id) {
      this.pttFeedback.set('NO CARRIER — tune a channel first.');
      return;
    }
    if (this.signalStrength() <= CLEAR_THRESHOLD) {
      this.pttFeedback.set('SIGNAL TOO WEAK — TUNE CLOSER');
      return;
    }
    const root = DIALOGUE_NODES.find((n) => n.channel === id && n.nodeId.endsWith('-root'));
    if (!root) {
      this.pttFeedback.set('NO TRANSMISSION on this band.');
      return;
    }
    this._currentNodeId.set(root.nodeId);
    this.simState.conversationState.set({ nodeId: root.nodeId, history: [] });
    this.simState.radioState.update((s) => ({ ...s, radioStatus: 'receiving' }));
    this.transmitText(root.text);
    this.pttFeedback.set('');
  }

  // PTT repurposed: transmit confirms a dialogue choice.
  protected transmit(choiceLabel: string): void {
    const currentId = this._currentNodeId();
    if (currentId === null) {
      this.startDialogue();
      return;
    }
    const nextId = RadioProtocol.advanceDialogue(currentId, choiceLabel);
    this.simState.conversationState.update((s) => ({
      nodeId: currentId,
      history: [...s.history, { nodeId: currentId, choice: choiceLabel }],
    }));
    if (nextId === null) {
      // Terminal node → complete the channel.
      this.completeCurrentChannel();
      return;
    }
    const next = DIALOGUE_NODES.find((n) => n.nodeId === nextId);
    if (!next) {
      this.completeCurrentChannel();
      return;
    }
    this._currentNodeId.set(next.nodeId);
    this.simState.conversationState.update((s) => ({ ...s, nodeId: next.nodeId }));
    this.transmitText(next.text);
  }

  protected completeCurrentChannel(): void {
    const id = this.simState.connectedFrequency() as Channel['id'] | null;
    if (!id) return;
    // Win condition: signal must be > 0.8 to "complete clearly".
    if (this.signalStrength() <= CLEAR_THRESHOLD) {
      this.pttFeedback.set('CARRIER TOO NOISY — TUNE TO SIGNAL > 0.8');
      return;
    }
    this.completedChannels.update((set) => {
      const next = new Set(set);
      next.add(id);
      return next;
    });
    this.simState.receivedTransmission.set(`CHANNEL ${id} TRANSMISSION COMPLETE. Over and out.`);

    // Reveal CH5 after ALL 4 main channels complete.
    const allMain = CHANNELS.filter((c) => !c.hidden).every((c) =>
      this.completedChannels().has(c.id),
    );
    if (allMain) {
      const hidden = CHANNELS.find((c) => c.hidden);
      if (hidden && !this.simState.foundFrequencies().some((f) => f.startsWith(hidden.id))) {
        this.simState.foundFrequencies.update((list) => [
          ...list,
          `${hidden.id}:${hidden.freqGHz.toFixed(3)}`,
        ]);
        this.scanResults.update((list) => [...list, hidden]);
      }
      this.achievements.unlock('all-conversations-complete');
    }

    this._currentNodeId.set(null);
  }

  // --- PTT button (transmit confirmation) ---

  protected startPtt(): void {
    if (!this.isPowered()) return;
    this.isPttHeld.set(true);
    this.staticActive.set(true);
    this.simState.radioState.update((s) => ({ ...s, isPttHeld: true, radioStatus: 'transmitting' }));
  }

  protected stopPtt(): void {
    if (!this.isPttHeld()) return;
    this.isPttHeld.set(false);
    this.updateStatic(this.signalStrength() < CLEAR_THRESHOLD);
    // If no dialogue active, PTT attempts to start one (requires signal > 0.8).
    if (this._currentNodeId() === null) {
      this.startDialogue();
      this.simState.radioState.update((s) => ({ ...s, isPttHeld: false }));
      return;
    }
    const node = this.currentDialogueNode();
    if (node && node.choices.length > 0) {
      this.simState.radioState.update((s) => ({ ...s, isPttHeld: false }));
      this.transmit(node.choices[0].label);
    } else {
      this.simState.radioState.update((s) => ({ ...s, isPttHeld: false, radioStatus: 'connected' }));
    }
  }

  protected togglePower(): void {
    this.isPowered.update((p) => !p);
    this.simState.radioState.update((s) => ({ ...s, isPowered: this.isPowered() }));
  }

  protected setChannel(num: number): void {
    const id = `CH${num}` as Channel['id'];
    this.tuneChannel(id);
  }

  // --- Internals ---

  private transmitText(text: string): void {
    const garbled = RadioProtocol.injectNoise(text, this.signalStrength());
    this.simState.receivedTransmission.set(garbled);
    this.simState.radioState.update((s) => ({ ...s, radioStatus: 'receiving' }));
  }
}
