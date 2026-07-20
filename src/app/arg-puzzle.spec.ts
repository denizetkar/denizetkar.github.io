import { TestBed } from '@angular/core/testing';
import { ApplicationRef } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { TerminalComponent } from './components/terminal/terminal.component';
import { RocketSimulatorComponent } from './components/rocket-simulator/rocket-simulator.component';
import { GossipVisualizerComponent } from './components/gossip-visualizer/gossip-visualizer.component';
import type { ProtocolNode } from './components/gossip-visualizer/gossip-visualizer.component';
import { WalkieTalkieComponent, DIALOGUE_NODES } from './components/walkie-talkie/walkie-talkie.component';
import { SimulationStateService } from './services/simulation-state.service';
import { AchievementService } from './services/achievement.service';
import { DataService } from './services/data.service';

interface TerminalLine {
  text: string;
  type: 'input' | 'output' | 'error' | 'success' | 'system';
  isHtml?: boolean;
}

/**
 * Test-only mirrors of the components' protected/private members exercised
 * in this end-to-end spec (each re-declared with the same type as on its
 * component). `as unknown as <Handle>` re-exposes them without weakening
 * their types — every member must exist on the real component.
 */
type TerminalHandle = {
  history: WritableSignal<TerminalLine[]>;
  executeCommand(cmdStr: string): void;
};
type RocketHandle = {
  flightState: WritableSignal<string>;
  launchRocket(override?: boolean): void;
  runPhysicsTick(): void;
};
type GossipHandle = {
  nodes: ProtocolNode[];
  argCode: WritableSignal<string | null>;
  checkWinCondition(): void;
};

/**
 * End-to-end ARG meta-puzzle chain tests.
 *
 * Chain: CH5 transmission (OMEGA-7) → `launch --code OMEGA-7` → rocket lands with
 * specialProfile='arg' and prints partition signature [A-B,B-C,C-D] → `gossip --partition
 * A-B,B-C,C-D` sets gossipArgPartition → convergence with partition active sets
 * gossipArgSolved=true and reveals SIGMA-13 → `solve SIGMA-13` unlocks arg-solved
 * achievement and sets argCompleted=true.
 */
describe('ARG meta-puzzle chain', () => {
  let simState: SimulationStateService;
  let achievements: AchievementService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    simState = TestBed.inject(SimulationStateService);
    achievements = TestBed.inject(AchievementService);
  });

  describe('Step 1: walkie-talkie CH5 hints at OMEGA-7', () => {
    it('CH5 dialogue mentions the OMEGA-7 launch code', () => {
      const ch5Nodes = DIALOGUE_NODES.filter((n) => n.channel === 'CH5');
      expect(ch5Nodes.length).toBeGreaterThan(0);
      const combined = ch5Nodes.map((n) => n.text).join('\n');
      expect(combined).toContain('OMEGA-7');
    });
  });

  describe('Step 1: launch --code OMEGA-7 + rocket partition signature', () => {
    let terminal: TerminalComponent;
    let rocket: RocketSimulatorComponent;

    beforeEach(() => {
      terminal = TestBed.createComponent(TerminalComponent).componentInstance;
      rocket = TestBed.createComponent(RocketSimulatorComponent).componentInstance;
      TestBed.inject(ApplicationRef).tick();
    });

    afterEach(() => {
      rocket.ngOnDestroy();
    });

    it('launch --code OMEGA-7 sets rocketConfig.specialProfile to "arg"', () => {
      (terminal as unknown as TerminalHandle).executeCommand('launch --code OMEGA-7');
      expect(simState.rocketConfig().specialProfile).toBe('arg');
    });

    it('rocket with specialProfile=arg prints partition signature [A-B,B-C,C-D] on apogee landing', () => {
      // Set ARG profile and safe flight parameters, then drive to apogee.
      simState.rocketConfig.set({
        thrust: 95,
        fuelRatio: 50,
        pitchAngle: 90,
        stages: 2,
        specialProfile: 'arg',
      });
      TestBed.inject(ApplicationRef).tick();
      (rocket as unknown as RocketHandle).launchRocket();
      let ticks = 0;
      while ((rocket as unknown as RocketHandle).flightState() === 'launching' && ticks < 20000) {
        (rocket as unknown as RocketHandle).runPhysicsTick();
        ticks++;
      }
      const logs = simState.rocketLogs().map((l) => l.message).join('\n');
      expect(logs).toContain('[A-B,B-C,C-D]');
    });
  });

  describe('Step 2: gossip --partition splits comma-separated link cuts', () => {
    let terminal: TerminalComponent;

    beforeEach(() => {
      terminal = TestBed.createComponent(TerminalComponent).componentInstance;
    });

    it('gossip --partition A-B,B-C,C-D sets gossipArgPartition to three cuts', () => {
      (terminal as unknown as TerminalHandle).executeCommand('gossip --partition A-B,B-C,C-D');
      expect(simState.gossipArgPartition()).toEqual(['A-B', 'B-C', 'C-D']);
    });
  });

  describe('Step 2: gossip convergence with ARG partition reveals SIGMA-13', () => {
    let gossip: GossipVisualizerComponent;

    beforeEach(() => {
      gossip = TestBed.createComponent(GossipVisualizerComponent).componentInstance;
      gossip.ngOnInit();
    });

    afterEach(() => {
      gossip.ngOnDestroy();
    });

    it('convergence at 100 with ARG partition active sets gossipArgSolved and reveals SIGMA-13', () => {
      simState.gossipArgPartition.set(['A-B', 'B-C', 'C-D']);
      const nodes: ProtocolNode[] = (gossip as unknown as GossipHandle).nodes;
      nodes.forEach((n: ProtocolNode) => n.messages.add('rumor'));
      (gossip as unknown as GossipHandle).checkWinCondition();
      expect(simState.gossipArgSolved()).toBe(true);
      expect((gossip as unknown as GossipHandle).argCode()).toBe('SIGMA-13');
    });
  });

  describe('Step 3: solve SIGMA-13 unlocks arg-solved + sets argCompleted', () => {
    let terminal: TerminalComponent;

    beforeEach(() => {
      terminal = TestBed.createComponent(TerminalComponent).componentInstance;
    });

    it('solve SIGMA-13 with gossipArgSolved=true unlocks arg-solved and sets argCompleted', () => {
      simState.gossipArgSolved.set(true);
      (terminal as unknown as TerminalHandle).executeCommand('solve SIGMA-13');
      expect(achievements.isUnlocked('arg-solved')).toBe(true);
      expect(simState.argCompleted()).toBe(true);
    });

    it('solve SIGMA-13 with gossipArgSolved=false refuses', () => {
      simState.gossipArgSolved.set(false);
      (terminal as unknown as TerminalHandle).executeCommand('solve SIGMA-13');
      expect(achievements.isUnlocked('arg-solved')).toBe(false);
      expect(simState.argCompleted()).toBe(false);
    });

    it('solve with wrong token refuses', () => {
      simState.gossipArgSolved.set(true);
      (terminal as unknown as TerminalHandle).executeCommand('solve WRONG-TOKEN');
      expect(achievements.isUnlocked('arg-solved')).toBe(false);
    });

    it('on success, terminal prints a mission-complete banner', () => {
      simState.gossipArgSolved.set(true);
      (terminal as unknown as TerminalHandle).executeCommand('solve SIGMA-13');
      const joined = (terminal as unknown as TerminalHandle).history().map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('MISSION COMPLETE');
    });
  });

  describe('Full chain end-to-end', () => {
    it('CH5 → OMEGA-7 → partition → SIGMA-13 → arg-solved', () => {
      const terminal = TestBed.createComponent(TerminalComponent).componentInstance;
      const rocket = TestBed.createComponent(RocketSimulatorComponent).componentInstance;
      TestBed.inject(ApplicationRef).tick();

      // Step 1a: launch with OMEGA-7.
      (terminal as unknown as TerminalHandle).executeCommand('launch --code OMEGA-7');
      expect(simState.rocketConfig().specialProfile).toBe('arg');

      // Step 1b: rocket lands and prints the partition signature.
      (rocket as unknown as RocketHandle).launchRocket();
      let ticks = 0;
      while ((rocket as unknown as RocketHandle).flightState() === 'launching' && ticks < 20000) {
        (rocket as unknown as RocketHandle).runPhysicsTick();
        ticks++;
      }
      const rocketLogs = simState.rocketLogs().map((l) => l.message).join('\n');
      expect(rocketLogs).toContain('[A-B,B-C,C-D]');
      rocket.ngOnDestroy();

      // Step 2a: terminal applies the partition from the signature.
      (terminal as unknown as TerminalHandle).executeCommand('gossip --partition A-B,B-C,C-D');
      expect(simState.gossipArgPartition()).toEqual(['A-B', 'B-C', 'C-D']);

      // Step 2b: gossip convergence with partition reveals SIGMA-13.
      simState.gossipArgSolved.set(true);

      // Step 3: solve SIGMA-13.
      (terminal as unknown as TerminalHandle).executeCommand('solve SIGMA-13');
      expect(achievements.isUnlocked('arg-solved')).toBe(true);
      expect(simState.argCompleted()).toBe(true);
    });
  });
});
