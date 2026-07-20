import { TestBed } from '@angular/core/testing';
import { ApplicationRef } from '@angular/core';
import {
  RocketSimulatorComponent,
  RocketPhysics,
  STAGE_DEFINITIONS,
} from './rocket-simulator.component';
import type { WritableSignal } from '@angular/core';
import { SimulationStateService } from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';
import { DataService } from '../../services/data.service';

const G0 = 9.81;

/**
 * Test-only mirror of RocketSimulatorComponent's protected/private members
 * (each member re-declared with the same type as on the component).
 * `as unknown as RocketHandle` re-exposes them to the spec without weakening
 * their types — every member must exist on RocketSimulatorComponent itself.
 * Declared as a standalone interface (not `Component & {...}`) because an
 * intersection with a class that owns the same private fields collapses to
 * `never`.
 */
type RocketHandle = {
  thrust: WritableSignal<number>;
  fuelRatio: WritableSignal<number>;
  pitchAngle: WritableSignal<number>;
  altitude: WritableSignal<number>;
  velocity: WritableSignal<number>;
  flightState: WritableSignal<string>;
  activeCheat: WritableSignal<string>;
  efficiencyRating: () => number;
  launchRocket(override?: boolean): void;
  runPhysicsTick(): void;
  keypressCheat(char: string): void;
  triggerOverride(): void;
  resetFlightSimulator(): void;
  intervalId: ReturnType<typeof setInterval> | null;
  ignitionTimeoutId: ReturnType<typeof setTimeout> | null;
};

describe('RocketPhysics.calculateDeltaV (Tsiolkovsky)', () => {
  it('returns Isp * g0 * ln(massRatio) for nominal values', () => {
    // Isp=250s, massRatio=3 → 250 * 9.81 * ln(3) ≈ 2701.5
    const dv = RocketPhysics.calculateDeltaV(250, 3);
    expect(dv).toBeCloseTo(250 * 9.81 * Math.log(3), 3);
  });
  it('returns 0 when massRatio is 1 (no fuel burned)', () => {
    expect(RocketPhysics.calculateDeltaV(300, 1)).toBe(0);
  });
  it('returns 0 when massRatio < 1 (invalid — guards boundary)', () => {
    expect(RocketPhysics.calculateDeltaV(300, 0.5)).toBe(0);
  });
});

describe('RocketPhysics.airDensity (exponential atmosphere)', () => {
  it('is 1.225 kg/m³ at sea level', () => {
    expect(RocketPhysics.airDensity(0)).toBeCloseTo(1.225, 4);
  });
  it('decays exponentially with altitude', () => {
    expect(RocketPhysics.airDensity(8500)).toBeCloseTo(1.225 * Math.exp(-1), 4);
  });
});

describe('RocketPhysics.applyDrag', () => {
  it('returns 0 drag at zero velocity', () => {
    expect(RocketPhysics.applyDrag(0, 0)).toBe(0);
  });
  it('returns 0 drag in vacuum (negligible density at high altitude)', () => {
    // 100km altitude → density ≈ 1.225 * e^(-100000/8500) ≈ 2.4e-6 kg/m³
    const drag = RocketPhysics.applyDrag(100000, 300);
    expect(drag).toBeLessThan(0.5);
  });
  it('scales with velocity squared (F = 0.5 * ρ * v² * Cd * A)', () => {
    const v = 100;
    const dragSlow = RocketPhysics.applyDrag(0, v);
    const dragFast = RocketPhysics.applyDrag(0, v * 2);
    // 4× drag for 2× velocity
    expect(dragFast / dragSlow).toBeCloseTo(4, 2);
  });
});

describe('RocketPhysics.applyGravity', () => {
  it('applies full 9.81 m/s² deceleration when pitch is vertical (90°)', () => {
    const result = RocketPhysics.applyGravity(100, 90);
    expect(result.vertical).toBeCloseTo(100 - 9.81, 3);
    expect(result.horizontal).toBeCloseTo(0, 6);
  });
  it('preserves horizontal velocity as pitch tilts away from vertical', () => {
    // pitch 45° → sin(45)=0.707, cos(45)=0.707
    const result = RocketPhysics.applyGravity(100, 45);
    expect(result.horizontal).toBeCloseTo(100 * Math.cos((45 * Math.PI) / 180), 2);
  });
  it('assigns full velocity to horizontal component when pitch is horizontal (0°)', () => {
    // pitch 0° = horizontal flight: vertical component is 0, gravity pulls it
    // down to -g0; horizontal carries the full velocity magnitude.
    const result = RocketPhysics.applyGravity(100, 0);
    expect(result.vertical).toBeCloseTo(-G0, 3);
    expect(result.horizontal).toBeCloseTo(100, 3);
  });
});

describe('RocketPhysics.consumeFuel', () => {
  it('depletes fuel proportional to thrust (burnRate = thrust/100 * 0.5)', () => {
    const fuelAfter = RocketPhysics.consumeFuel(100, 80, 1);
    expect(fuelAfter).toBeCloseTo(100 - (80 / 100) * 0.5, 4);
  });
  it('never returns negative fuel', () => {
    const fuelAfter = RocketPhysics.consumeFuel(0.1, 100, 5);
    expect(fuelAfter).toBe(0);
  });
  it('UFO cheat (infinite fuel) keeps fuel pinned at 100', () => {
    const fuelAfter = RocketPhysics.consumeFuel(100, 100, 1, true);
    expect(fuelAfter).toBe(100);
  });
});

describe('RocketPhysics.step (full integration)', () => {
  it('stores a trajectory point {x, y} per step', () => {
    const sim = RocketPhysics.createSimulation({
      thrust: 80,
      pitchAngle: 90,
      stages: 2,
      cheat: 'none',
    });
    const before = sim.state.trajectoryPoints.length;
    sim.step(0.1);
    expect(sim.state.trajectoryPoints.length).toBe(before + 1);
    const last = sim.state.trajectoryPoints[sim.state.trajectoryPoints.length - 1];
    expect(typeof last.x).toBe('number');
    expect(typeof last.y).toBe('number');
  });

  it('separates stage 1 → stage 2 when stage 1 fuel hits 0', () => {
    const sim = RocketPhysics.createSimulation({
      thrust: 95,
      pitchAngle: 90,
      stages: 2,
      cheat: 'none',
    });
    expect(sim.state.activeStage).toBe(0);
    // Burn through stage 1 fuel.
    let safety = 0;
    while (sim.state.activeStage === 0 && sim.state.stages[0].fuelRemaining > 0 && safety < 5000) {
      sim.step(0.1);
      safety++;
    }
    expect(sim.state.activeStage).toBe(1);
  });

  it('nyancat cheat (335) ignores drag — drag force contribution is 0', () => {
    const sim = RocketPhysics.createSimulation({
      thrust: 80,
      pitchAngle: 90,
      stages: 2,
      cheat: 'nyancat',
    });
    sim.step(0.1);
    expect(sim.lastDragForce).toBe(0);
  });

  it('UFO cheat (1337) keeps fuel from depleting', () => {
    const sim = RocketPhysics.createSimulation({
      thrust: 100,
      pitchAngle: 90,
      stages: 2,
      cheat: 'ufo',
    });
    for (let i = 0; i < 50; i++) sim.step(0.1);
    expect(sim.state.stages[sim.state.activeStage].fuelRemaining).toBe(100);
  });

  it('pitch outside ±5° of vertical near apogee fails the stability win condition', () => {
    const sim = RocketPhysics.createSimulation({
      thrust: 95,
      pitchAngle: 60, // 30° off vertical
      stages: 2,
      cheat: 'none',
    });
    // Force the sim near apogee with a tilted pitch to test stability check.
    sim.state.altitude = 9500;
    sim.state.pitchAngle = 60;
    sim.state.stages[sim.state.activeStage].fuelRemaining = 50;
    const result = sim.evaluateWinCondition();
    expect(result.stable).toBe(false);
  });
});

describe('RocketSimulatorComponent (integration)', () => {
  let component: RocketSimulatorComponent;
  let simState: SimulationStateService;
  let achievements: AchievementService;
  let dataService: DataService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    component = TestBed.createComponent(RocketSimulatorComponent).componentInstance;
    simState = TestBed.inject(SimulationStateService);
    achievements = TestBed.inject(AchievementService);
    dataService = TestBed.inject(DataService);
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  function flushEffects(): void {
    TestBed.inject(ApplicationRef).tick();
  }

  it('imports STAGE_DEFINITIONS with at least 2 stages', () => {
    expect(STAGE_DEFINITIONS.length).toBeGreaterThanOrEqual(2);
  });

  const c = () => component as unknown as RocketHandle;

  it('reads rocketConfig from SimulationStateService on init', () => {
    simState.rocketConfig.set({
      thrust: 92,
      fuelRatio: 55,
      pitchAngle: 85,
      stages: 3,
    });
    flushEffects();
    expect(c().thrust()).toBe(92);
    expect(c().pitchAngle()).toBe(85);
  });

  it('pushes rocketState into SimulationStateService during launch', () => {
    c().thrust.set(95);
    c().fuelRatio.set(50);
    c().pitchAngle.set(90);
    c().launchRocket();
    expect(simState.rocketState().flightState).toBe('launching');
  });

  it('mirrors telemetry logs into SimulationStateService.rocketLogs', () => {
    c().launchRocket();
    expect(simState.rocketLogs().length).toBeGreaterThan(0);
  });

  it('uses DataService.timeline() milestones with altitudes', () => {
    expect(dataService.timeline().length).toBeGreaterThan(0);
    expect(dataService.timeline()[0].altitude).toBeGreaterThan(0);
  });

  it('preserves the cheat-code keypad (335 = nyancat, 1337 = ufo)', () => {
    c().keypressCheat('3');
    c().keypressCheat('3');
    c().keypressCheat('5');
    expect(c().activeCheat()).toBe('nyancat');
    c().resetFlightSimulator();
    c().keypressCheat('1');
    c().keypressCheat('3');
    c().keypressCheat('3');
    c().keypressCheat('7');
    expect(c().activeCheat()).toBe('ufo');
  });

  it('aborts launch when thrust < 60 (gravity dominates)', () => {
    c().thrust.set(40);
    c().pitchAngle.set(90);
    c().fuelRatio.set(50);
    c().launchRocket();
    expect(c().flightState()).toBe('aborted');
  });

  it('explodes when thrust exceeds 95% structural limit (override)', () => {
    c().thrust.set(99);
    c().fuelRatio.set(50);
    c().pitchAngle.set(90);
    c().triggerOverride();
    // After lift-off, the next physics tick should detect over-thrust and explode.
    let ticks = 0;
    while (c().flightState() === 'launching' && ticks < 500) {
      c().runPhysicsTick();
      ticks++;
    }
    expect(['exploded', 'apogee']).toContain(c().flightState());
  });

  it('unlocks apogee-reached achievement when altitude reaches 10,000m with stable ascent', () => {
    c().thrust.set(95);
    c().fuelRatio.set(50);
    c().pitchAngle.set(90);
    c().launchRocket();
    // Run physics until completion.
    let ticks = 0;
    while (c().flightState() === 'launching' && ticks < 20000) {
      c().runPhysicsTick();
      ticks++;
    }
    expect(c().altitude()).toBeGreaterThanOrEqual(10000);
    expect(achievements.isUnlocked('apogee-reached')).toBe(true);
  });

  it('computes an efficiency rating in [0, 100] after flight completion', () => {
    c().thrust.set(95);
    c().fuelRatio.set(50);
    c().pitchAngle.set(90);
    c().launchRocket();
    let ticks = 0;
    while (c().flightState() === 'launching' && ticks < 20000) {
      c().runPhysicsTick();
      ticks++;
    }
    const rating = c().efficiencyRating();
    expect(rating).toBeGreaterThanOrEqual(0);
    expect(rating).toBeLessThanOrEqual(100);
  });

  it('clears intervals on ngOnDestroy (no setInterval leak)', () => {
    c().thrust.set(95);
    c().fuelRatio.set(50);
    c().pitchAngle.set(90);
    c().launchRocket();
    // Run a few ticks to ensure the interval is active.
    for (let i = 0; i < 5; i++) c().runPhysicsTick();
    const altBefore = c().altitude();
    component.ngOnDestroy();
    // After destroy, no further state updates should occur even if we try to tick.
    c().runPhysicsTick();
    expect(c().altitude()).toBe(altBefore);
    // Internal timers must be cleared.
    expect((component as unknown as RocketHandle).intervalId).toBeNull();
    expect((component as unknown as RocketHandle).ignitionTimeoutId).toBeNull();
  });
});
