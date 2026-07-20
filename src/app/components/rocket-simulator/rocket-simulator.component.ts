import { Component, OnDestroy, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, Milestone } from '../../services/data.service';
import {
  SimulationStateService,
  RocketFlightState,
} from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';

// ---------------------------------------------------------------------------
// Physics constants
// ---------------------------------------------------------------------------

const G0 = 9.81; // m/s² — standard gravitational acceleration at surface
const SCALE_ALTITUDE = 8500; // m — exponential atmosphere scale height
const SEA_LEVEL_DENSITY = 1.225; // kg/m³
const DRAG_COEFFICIENT = 0.5; // dimensionless
const CROSS_SECTIONAL_AREA = 0.01; // m²
const TARGET_APOGEE = 10_000; // m — win condition altitude
const STABILITY_TOLERANCE_DEG = 5; // ±5° of vertical for stable ascent near apogee
const STRUCTURAL_THRUST_LIMIT = 95; // % — explosion threshold
const TICK_DT = 0.1; // s — physics tick delta

// ---------------------------------------------------------------------------
// Stage + simulation state types
// ---------------------------------------------------------------------------

export interface StageDefinition {
  thrust: number; // kN of thrust at 100% throttle
  dryMass: number; // kg of stage structure (dropped at separation)
  fuelCapacity: number; // kg of fuel
  isp: number; // s — specific impulse
}

export const STAGE_DEFINITIONS: StageDefinition[] = [
  // Stage 1: booster — high thrust, lower Isp
  { thrust: 220, dryMass: 80, fuelCapacity: 120, isp: 250 },
  // Stage 2: sustainer — lower thrust, higher Isp
  { thrust: 120, dryMass: 40, fuelCapacity: 90, isp: 320 },
];

export interface StageRuntimeState {
  fuelRemaining: number; // percentage 0-100 of stage fuelCapacity
  separated: boolean;
}

export interface TrajectoryPoint {
  x: number; // horizontal displacement (m)
  y: number; // altitude (m)
}

export type CheatCode = 'none' | 'nyancat' | 'ufo';

interface SimulationState {
  altitude: number; // m
  horizontal: number; // m (horizontal displacement)
  velocity: number; // m/s — magnitude
  velocityVertical: number; // m/s
  velocityHorizontal: number; // m/s
  pitchAngle: number; // degrees, 90 = straight up
  stages: StageRuntimeState[];
  activeStage: number;
  trajectoryPoints: TrajectoryPoint[];
}

interface WinEvaluation {
  stable: boolean;
  fuelRemaining: boolean;
  apogeeReached: boolean;
}

interface SimulationApi {
  state: SimulationState;
  lastDragForce: number;
  step(dt: number): void;
  evaluateWinCondition(): WinEvaluation;
}

interface CreateSimulationParams {
  thrust: number; // % throttle
  pitchAngle: number; // degrees
  stages: number;
  cheat: CheatCode;
}

// ---------------------------------------------------------------------------
// Pure physics functions — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Tsiolkovsky rocket equation: Δv = Isp · g0 · ln(m0/m1).
 * Returns 0 for invalid mass ratios (≤ 1) since no fuel was burned.
 */
function tsiolkovskyDeltaV(isp: number, massRatio: number): number {
  if (massRatio <= 1) return 0;
  return isp * G0 * Math.log(massRatio);
}

/** Exponential atmosphere model: ρ(h) = ρ0 · e^(-h/H). */
function atmosphericDensity(altitude: number): number {
  return SEA_LEVEL_DENSITY * Math.exp(-altitude / SCALE_ALTITUDE);
}

/** Drag force F = ½ · ρ · v² · Cd · A. Zero velocity ⇒ zero drag. */
function dragForce(altitude: number, velocity: number): number {
  if (velocity <= 0) return 0;
  const density = atmosphericDensity(altitude);
  return 0.5 * density * velocity * velocity * DRAG_COEFFICIENT * CROSS_SECTIONAL_AREA;
}

interface VelocityDecomposition {
  vertical: number;
  horizontal: number;
}

/** Decompose velocity by pitch angle and apply gravity to the vertical component. */
function applyGravityDecomposition(
  velocity: number,
  pitchAngleDegrees: number,
): VelocityDecomposition {
  const pitchRad = (pitchAngleDegrees * Math.PI) / 180;
  // Pitch 90° = straight up ⇒ vertical = v, horizontal = 0.
  const vertical = velocity * Math.sin(pitchRad);
  const horizontal = velocity * Math.cos(pitchRad);
  // Gravity reduces the vertical component by g·dt (handled by caller via subtraction
  // of g0 from vertical velocity per second). Here we return the decomposed magnitudes;
  // the gravity deceleration is applied to velocityVertical in step().
  return { vertical, horizontal };
}

/** Fuel depletion: burnRate = thrust/100 · 0.5 (% per tick). Infinite-fuel cheat pins to 100. */
function consumeFuelTick(
  currentFuelPercent: number,
  thrustPercent: number,
  ticks: number,
  infiniteFuel: boolean,
): number {
  if (infiniteFuel) return 100;
  const burnPerTick = (thrustPercent / 100) * 0.5;
  return Math.max(0, currentFuelPercent - burnPerTick * ticks);
}

// ---------------------------------------------------------------------------
// RocketPhysics — exported façade over the pure functions + integration
// ---------------------------------------------------------------------------

export class RocketPhysics {
  static calculateDeltaV(isp: number, massRatio: number): number {
    return tsiolkovskyDeltaV(isp, massRatio);
  }

  static airDensity(altitude: number): number {
    return atmosphericDensity(altitude);
  }

  static applyDrag(altitude: number, velocity: number): number {
    return dragForce(altitude, velocity);
  }

  static applyGravity(velocity: number, pitchAngleDegrees: number): VelocityDecomposition {
    // Backwards-compatible signature used by the spec: returns the *decelerated*
    // vertical velocity (gravity already subtracted for a single tick of dt=1s).
    const decomposed = applyGravityDecomposition(velocity, pitchAngleDegrees);
    return {
      vertical: decomposed.vertical - G0,
      horizontal: decomposed.horizontal,
    };
  }

  static consumeFuel(
    fuelPercent: number,
    thrustPercent: number,
    ticks: number,
    infiniteFuel = false,
  ): number {
    return consumeFuelTick(fuelPercent, thrustPercent, ticks, infiniteFuel);
  }

  static createSimulation(params: CreateSimulationParams): SimulationApi {
    const stageCount = Math.max(1, Math.min(params.stages, STAGE_DEFINITIONS.length));
    const stages: StageRuntimeState[] = [];
    for (let i = 0; i < stageCount; i++) {
      stages.push({ fuelRemaining: 100, separated: false });
    }
    const state: SimulationState = {
      altitude: 0,
      horizontal: 0,
      velocity: 0,
      velocityVertical: 0,
      velocityHorizontal: 0,
      pitchAngle: params.pitchAngle,
      stages,
      activeStage: 0,
      trajectoryPoints: [{ x: 0, y: 0 }],
    };

    const api: SimulationApi = {
      state,
      lastDragForce: 0,
      step(dt: number): void {
        const activeIdx = state.activeStage;
        if (activeIdx >= stageCount) return; // all stages spent
        const stageDef = STAGE_DEFINITIONS[activeIdx];
        const stageState = state.stages[activeIdx];
        if (stageState.separated) return;

        const infiniteFuel = params.cheat === 'ufo';
        const ignoreDrag = params.cheat === 'nyancat';

        // 1. Fuel consumption — burnRate proportional to thrust.
        stageState.fuelRemaining = consumeFuelTick(
          stageState.fuelRemaining,
          params.thrust,
          1,
          infiniteFuel,
        );

        // 2. Stage separation — when stage 1 fuel hits 0, drop its dry mass and ignite next stage.
        if (stageState.fuelRemaining <= 0 && activeIdx < stageCount - 1) {
          stageState.separated = true;
          state.activeStage = activeIdx + 1;
          // Recurse into the next stage this tick.
          api.step(dt);
          return;
        }

        // 3. Compute total mass (kg) for Tsiolkovsky check on thrust/acceleration.
        const throttle = params.thrust / 100;
        const thrustNewtons = stageDef.thrust * 1000 * throttle; // kN → N

        // Total current mass: sum of all remaining (non-separated) stages.
        let totalMassKg = 0;
        for (let i = 0; i < stageCount; i++) {
          if (state.stages[i].separated) continue;
          totalMassKg += STAGE_DEFINITIONS[i].dryMass;
          totalMassKg +=
            (state.stages[i].fuelRemaining / 100) * STAGE_DEFINITIONS[i].fuelCapacity;
        }

        // 4. Thrust acceleration: a = F/m. Direction follows pitch angle.
        const pitchRad = (state.pitchAngle * Math.PI) / 180;
        const thrustAccel = thrustNewtons / Math.max(1, totalMassKg); // m/s²
        const thrustVertical = thrustAccel * Math.sin(pitchRad);
        const thrustHorizontal = thrustAccel * Math.cos(pitchRad);

        // 5. Gravity deceleration on vertical axis.
        let verticalAccel = thrustVertical - G0;

        // 6. Drag deceleration: a_drag = F_drag / m, opposing velocity.
        let dragAccel = 0;
        if (!ignoreDrag && state.velocity > 0) {
          const drag = dragForce(state.altitude, state.velocity);
          api.lastDragForce = drag;
          dragAccel = drag / Math.max(1, totalMassKg);
        } else {
          api.lastDragForce = 0;
        }

        // Integrate velocities (semi-implicit Euler).
        state.velocityVertical += verticalAccel * dt;
        state.velocityHorizontal += thrustHorizontal * dt;

        // Apply drag opposing the velocity vector.
        if (dragAccel > 0 && state.velocity > 0) {
          const vSin = state.velocity > 0 ? state.velocityVertical / state.velocity : 0;
          const vCos = state.velocity > 0 ? state.velocityHorizontal / state.velocity : 0;
          state.velocityVertical -= dragAccel * vSin * dt;
          state.velocityHorizontal -= dragAccel * vCos * dt;
        }

        // Clamp negative vertical velocity during powered ascent (don't allow falling
        // while engines burn). After burnout the rocket can coast down.
        if (stageState.fuelRemaining > 0 && state.velocityVertical < 0) {
          state.velocityVertical = 0;
        }

        state.velocity = Math.sqrt(
          state.velocityVertical ** 2 + state.velocityHorizontal ** 2,
        );

        // 7. Integrate position.
        state.altitude += state.velocityVertical * dt;
        state.horizontal += state.velocityHorizontal * dt;
        if (state.altitude < 0) state.altitude = 0;

        // 8. Trajectory point.
        state.trajectoryPoints.push({
          x: state.horizontal,
          y: state.altitude,
        });
      },
      evaluateWinCondition(): WinEvaluation {
        const stable = Math.abs(state.pitchAngle - 90) <= STABILITY_TOLERANCE_DEG;
        const activeStage = state.stages[state.activeStage];
        const fuelRemaining =
          state.stages.reduce((sum, s) => sum + s.fuelRemaining, 0) > 0;
        const apogeeReached = state.altitude >= TARGET_APOGEE;
        return { stable, fuelRemaining, apogeeReached };
      },
    };
    return api;
  }
}

// ---------------------------------------------------------------------------
// Telemetry log type
// ---------------------------------------------------------------------------

interface TelemetryLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'milestone';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'app-rocket-simulator',
  imports: [CommonModule, FormsModule],
  templateUrl: './rocket-simulator.component.html',
  styleUrl: './rocket-simulator.component.scss',
})
export class RocketSimulatorComponent implements OnInit, OnDestroy {
  private readonly dataService = inject(DataService);
  private readonly simState = inject(SimulationStateService);
  private readonly achievements = inject(AchievementService);

  // Flight parameters — mirror SimulationStateService.rocketConfig via effect.
  protected readonly thrust = signal(this.simState.rocketConfig().thrust);
  protected readonly fuelRatio = signal(this.simState.rocketConfig().fuelRatio);
  protected readonly pitchAngle = signal(this.simState.rocketConfig().pitchAngle);

  // Telemetry signals
  protected readonly altitude = signal(0);
  protected readonly velocity = signal(0);
  protected readonly fuelRemaining = signal(100);
  protected readonly flightState = signal<RocketFlightState>('prelaunch');
  protected readonly logs = signal<TelemetryLog[]>([
    { timestamp: '00:00:00', message: 'Flight computer online. Calibrating gyroscopes...', type: 'info' },
    { timestamp: '00:00:02', message: 'Rocket: Teknofest Alpha V2. Standing by.', type: 'info' },
  ]);

  // Visualization
  protected readonly trajectoryPoints = signal<TrajectoryPoint[]>([{ x: 0, y: 0 }]);
  protected readonly activeStage = signal(0);
  protected readonly stages = signal<StageRuntimeState[]>(
    STAGE_DEFINITIONS.map(() => ({ fuelRemaining: 100, separated: false })),
  );
  protected readonly efficiency = signal(0);

  // Cheat codes / Easter eggs
  protected readonly cheatCodeInput = signal('');
  protected readonly activeCheat = signal<CheatCode>('none');

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private ignitionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private physics: SimulationApi | null = null;
  private milestones: Milestone[] = [];
  private triggeredMilestones = new Set<number>();
  private flightStartTime = 0;
  private maxAltitude = 0;
  private ticksRun = 0;
  private destroyed = false;

  constructor() {
    this.milestones = [...this.dataService.timeline()];
    // Sync local config signals whenever SimulationStateService.rocketConfig changes
    // (e.g. from the terminal `launch --thrust ...` command).
    effect(() => {
      const cfg = this.simState.rocketConfig();
      if (this.flightState() === 'prelaunch') {
        this.thrust.set(cfg.thrust);
        this.fuelRatio.set(cfg.fuelRatio);
        this.pitchAngle.set(cfg.pitchAngle);
      }
    });
  }

  ngOnInit(): void {
    this.pushStateToService();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ignitionTimeoutId !== null) {
      clearTimeout(this.ignitionTimeoutId);
      this.ignitionTimeoutId = null;
    }
  }

  protected addLog(message: string, type: TelemetryLog['type'] = 'info'): void {
    const timeStr = new Date().toTimeString().split(' ')[0];
    this.logs.update((prev) => [...prev, { timestamp: timeStr, message, type }]);
  }

  protected keypressCheat(char: string): void {
    const current = this.cheatCodeInput() + char;
    this.cheatCodeInput.set(current);
    if (current.endsWith('335') || current.endsWith('1337')) {
      const is335 = current.endsWith('335');
      const cheat: CheatCode = is335 ? 'nyancat' : 'ufo';
      this.activeCheat.set(cheat);
      this.addLog(
        `EASTER EGG ACTIVATED: ${is335 ? 'Nyan Cat' : 'Alien Spaceship'} mode enabled!`,
        'success',
      );
      this.cheatCodeInput.set('');
    } else if (current.length > 8) {
      this.cheatCodeInput.set(current.substring(current.length - 4));
    }
  }

  protected launchRocket(override = false): void {
    if (this.flightState() === 'launching') return;
    this.clearTimers();
    this.altitude.set(0);
    this.velocity.set(0);
    this.fuelRemaining.set(100);
    this.activeStage.set(0);
    this.maxAltitude = 0;
    this.ticksRun = 0;
    this.triggeredMilestones.clear();
    this.trajectoryPoints.set([{ x: 0, y: 0 }]);
    this.stages.set(STAGE_DEFINITIONS.map(() => ({ fuelRemaining: 100, separated: false })));
    this.efficiency.set(0);
    this.logs.set([
      { timestamp: '00:00:00', message: 'System launch command initialized.', type: 'info' },
    ]);

    // Validation checks (skipped for cheats or override).
    if (!override && this.activeCheat() === 'none') {
      if (this.thrust() < 60) {
        this.flightState.set('aborted');
        this.addLog(
          'LIFT-OFF ERROR: Insufficient thrust parameters (< 60%). Gravity vector dominates.',
          'error',
        );
        this.pushStateToService();
        return;
      }
      if (this.fuelRatio() < 40 || this.fuelRatio() > 60) {
        this.flightState.set('aborted');
        this.addLog(
          'ENGINE CRITICAL: Combustion instability. Incorrect oxidizer-fuel mixture.',
          'error',
        );
        this.pushStateToService();
        return;
      }
      if (this.pitchAngle() < 70 || this.pitchAngle() > 105) {
        this.flightState.set('aborted');
        this.addLog(
          'GUIDANCE FAULT: Attack angle outside safety envelope (70°-105°). Wind shear warning.',
          'error',
        );
        this.pushStateToService();
        return;
      }
    }

    // Sync config into SimulationStateService.
    this.simState.rocketConfig.update((cfg) => ({
      ...cfg,
      thrust: this.thrust(),
      fuelRatio: this.fuelRatio(),
      pitchAngle: this.pitchAngle(),
      stages: STAGE_DEFINITIONS.length,
    }));

    this.flightState.set('launching');
    this.addLog('Ignition sequence start...', 'warning');
    this.pushStateToService();

    // Build the physics engine immediately so tests/callers can drive it via
    // runPhysicsTick() without waiting on the visual ignition delay.
    this.physics = RocketPhysics.createSimulation({
      thrust: this.thrust(),
      pitchAngle: this.pitchAngle(),
      stages: STAGE_DEFINITIONS.length,
      cheat: this.activeCheat(),
    });

    this.ignitionTimeoutId = setTimeout(() => {
      if (this.flightState() !== 'launching') return;
      this.addLog('LIFT-OFF! Rocket is airborne.', 'success');
      this.flightStartTime = Date.now();
      this.intervalId = setInterval(() => {
        this.runPhysicsTick();
      }, 16);
    }, 1500);
  }

  /** Public (for spec) physics tick — advances the simulation by one TICK_DT step. */
  runPhysicsTick(): void {
    if (this.destroyed) return;
    if (this.flightState() !== 'launching' || this.physics === null) return;
    const tick = this.ticksRun++;
    this.physics.step(TICK_DT);
    const s = this.physics.state;

    this.altitude.set(Math.floor(s.altitude));
    this.velocity.set(Math.floor(s.velocity));
    this.fuelRemaining.set(Math.floor(s.stages[s.activeStage]?.fuelRemaining ?? 0));
    this.activeStage.set(s.activeStage);
    this.stages.set(s.stages.map((st) => ({ ...st })));
    this.trajectoryPoints.set([...s.trajectoryPoints]);
    if (s.altitude > this.maxAltitude) this.maxAltitude = s.altitude;

    // Stage separation event log.
    if (s.activeStage > 0 && tick > 0 && s.stages[s.activeStage - 1]?.separated) {
      // Log only on transition.
      if (!this.triggeredMilestones.has(-s.activeStage)) {
        this.triggeredMilestones.add(-s.activeStage);
        this.addLog(
          `STAGE SEPARATION: Stage ${s.activeStage} jettisoned. Stage ${s.activeStage + 1} ignition.`,
          'warning',
        );
      }
    }

    // Check milestones.
    const prevAlt = this.altitude();
    this.checkMilestones(prevAlt);

    // Lose: structural failure from over-thrust (override > 95%).
    if (this.thrust() > STRUCTURAL_THRUST_LIMIT && this.activeCheat() === 'none') {
      this.triggerExplosion('Structural overload: thrust exceeded 95% limit.');
      return;
    }

    // Lose: pitch outside safety envelope during ascent.
    if (
      this.activeCheat() === 'none' &&
      (this.pitchAngle() < 70 || this.pitchAngle() > 105) &&
      s.altitude > 100
    ) {
      this.triggerExplosion('Pitch outside safety envelope — wind shear destabilized airframe.');
      return;
    }

    // Lose: fuel exhaustion before apogee.
    const totalFuel = s.stages.reduce((sum, st) => sum + st.fuelRemaining, 0);
    if (totalFuel <= 0 && s.altitude < TARGET_APOGEE) {
      this.flightState.set('exploded');
      this.addLog(
        'CRITICAL FAILURE: Fuel exhausted before apogee. Parachute auto-deploy failed.',
        'error',
      );
      this.clearTimers();
      this.efficiency.set(this.computeEfficiency());
      this.pushStateToService();
      return;
    }

    // Win: apogee reached with stable ascent and fuel not exhausted.
    if (s.altitude >= TARGET_APOGEE) {
      this.triggerApogeeReached();
      return;
    }

    // Safety cap to prevent runaway loops in tests.
    if (this.ticksRun > 50_000) {
      this.triggerExplosion('Flight computer timeout — simulation aborted.');
    }

    this.pushStateToService();
  }

  private checkMilestones(currentAlt: number): void {
    for (const m of this.milestones) {
      if (!this.triggeredMilestones.has(m.altitude) && currentAlt >= m.altitude) {
        this.triggeredMilestones.add(m.altitude);
        this.addLog(`[ALTITUDE: ${m.altitude}m] Milestone reached!`, 'success');
        this.addLog(`🚀 ${m.year}: ${m.title} - ${m.description}`, 'milestone');
      }
    }
  }

  private triggerExplosion(reason: string): void {
    this.flightState.set('exploded');
    this.velocity.set(0);
    this.clearTimers();
    this.addLog(`🔥 BOOM! ${reason}`, 'error');
    this.addLog(
      'RECOVERY REPORT: Debris retrieved. Experience and education log files intact.',
      'warning',
    );
    this.efficiency.set(this.computeEfficiency());
    this.pushStateToService();
  }

  private triggerApogeeReached(): void {
    const evaluation = this.physics?.evaluateWinCondition() ?? {
      stable: false,
      fuelRemaining: false,
      apogeeReached: true,
    };
    if (!evaluation.stable) {
      this.triggerExplosion('Apogee reached but pitch deviated beyond ±5° — airframe broke up.');
      return;
    }
    if (!evaluation.fuelRemaining) {
      this.triggerExplosion('Apogee reached but fuel fully exhausted — no retro burn.');
      return;
    }
    this.flightState.set('apogee');
    this.velocity.set(0);
    this.clearTimers();
    this.addLog('✨ APOGEE REACHED. Main engines cut. Stable ascent confirmed.', 'success');
    this.addLog('Teknofest Flight Computer status: Apogee nominal. Payload ready for deployment.', 'success');
    // ARG profile (set by `launch --code OMEGA-7`) prints the gossip partition signature.
    if (this.simState.rocketConfig().specialProfile === 'arg') {
      this.addLog('partition signature detected: [A-B,B-C,C-D]', 'milestone');
    }
    this.achievements.unlock('apogee-reached');
    this.efficiency.set(this.computeEfficiency());
    this.pushStateToService();
  }

  /** Efficiency rating in [0, 100]: rewards apogee, fuel economy, stability, speed. */
  private computeEfficiency(): number {
    const apogeeScore = Math.min(40, (this.maxAltitude / TARGET_APOGEE) * 40);
    const totalFuel = this.stages().reduce((sum, st) => sum + st.fuelRemaining, 0);
    const fuelScore = Math.min(30, (totalFuel / (STAGE_DEFINITIONS.length * 100)) * 30);
    const stabilityScore = Math.abs(this.pitchAngle() - 90) <= STABILITY_TOLERANCE_DEG ? 20 : 0;
    const speedScore = Math.min(10, this.velocity() / 100);
    return Math.max(0, Math.min(100, Math.round(apogeeScore + fuelScore + stabilityScore + speedScore)));
  }

  efficiencyRating(): number {
    return this.efficiency();
  }

  protected readonly efficiencyRatingComputed = computed(() => this.efficiency());

  protected triggerOverride(): void {
    this.launchRocket(true);
  }

  protected resetFlightSimulator(): void {
    this.clearTimers();
    this.altitude.set(0);
    this.velocity.set(0);
    this.fuelRemaining.set(100);
    this.activeStage.set(0);
    this.stages.set(STAGE_DEFINITIONS.map(() => ({ fuelRemaining: 100, separated: false })));
    this.trajectoryPoints.set([{ x: 0, y: 0 }]);
    this.efficiency.set(0);
    this.flightState.set('prelaunch');
    this.activeCheat.set('none');
    this.cheatCodeInput.set('');
    this.physics = null;
    this.triggeredMilestones.clear();
    this.logs.set([
      { timestamp: '00:00:00', message: 'Flight computer rebooted.', type: 'info' },
      { timestamp: '00:00:01', message: 'Standing by for launch parameters.', type: 'info' },
    ]);
    this.pushStateToService();
  }

  private pushStateToService(): void {
    const trajectoryPoints = this.trajectoryPoints().map((p) => ({ x: p.x, y: p.y }));
    this.simState.rocketState.set({
      altitude: this.altitude(),
      velocity: this.velocity(),
      fuelRemaining: this.fuelRemaining(),
      flightState: this.flightState(),
      trajectoryPoints,
    });
    this.simState.rocketLogs.set(
      this.logs().map((l) => ({ timestamp: l.timestamp, message: l.message, type: l.type })),
    );
  }

  // --- Computed helpers for the SVG trajectory visualization ---
  protected readonly trajectoryPath = computed(() => {
    const pts = this.trajectoryPoints();
    if (pts.length === 0) return '';
    const maxAlt = this.maxTrajectoryY();
    const maxX = this.maxTrajectoryX();
    return pts
      .map((p, i) => {
        const x = (p.x / maxX) * 100;
        const y = 100 - (p.y / maxAlt) * 100;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  });

  protected readonly maxTrajectoryX = computed(() => {
    const pts = this.trajectoryPoints();
    return Math.max(1, ...pts.map((p) => p.x));
  });

  protected readonly maxTrajectoryY = computed(() => {
    const pts = this.trajectoryPoints();
    return Math.max(1, ...pts.map((p) => p.y));
  });
}
