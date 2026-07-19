import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, Milestone } from '../../services/data.service';

interface TelemetryLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'milestone';
}

@Component({
  selector: 'app-rocket-simulator',
  imports: [CommonModule, FormsModule],
  templateUrl: './rocket-simulator.component.html',
  styleUrl: './rocket-simulator.component.scss',
})
export class RocketSimulatorComponent implements OnDestroy {
  private readonly dataService = inject(DataService);

  // Flight parameters
  protected readonly thrust = signal(80); // %
  protected readonly fuelRatio = signal(50); // %
  protected readonly pitchAngle = signal(90); // degrees

  // Telemetry signals
  protected readonly altitude = signal(0); // meters
  protected readonly velocity = signal(0); // m/s
  protected readonly fuelRemaining = signal(100); // %
  protected readonly flightState = signal<'prelaunch' | 'launching' | 'aborted' | 'orbit' | 'exploded'>('prelaunch');
  protected readonly logs = signal<TelemetryLog[]>([
    { timestamp: '00:00:00', message: 'Flight computer online. Calibrating gyroscopes...', type: 'info' },
    { timestamp: '00:00:02', message: 'Rocket: Teknofest Alpha V2. Standing by.', type: 'info' }
  ]);

  // Cheat Codes / Easter Eggs
  protected readonly cheatCodeInput = signal('');
  protected readonly activeCheat = signal<'none' | 'nyancat' | 'ufo'>('none');

  private intervalId: any = null;
  private milestones: Milestone[] = [];

  constructor() {
    this.milestones = [...this.dataService.timeline()];
  }

  ngOnDestroy() {
    this.clearInterval();
  }

  private clearInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  protected addLog(message: string, type: TelemetryLog['type'] = 'info') {
    const timeStr = new Date().toTimeString().split(' ')[0];
    this.logs.update(prev => [...prev, { timestamp: timeStr, message, type }]);
  }

  protected keypressCheat(char: string) {
    const current = this.cheatCodeInput() + char;
    this.cheatCodeInput.set(current);
    
    // Check codes
    if (current.endsWith('335') || current.endsWith('1337')) {
      const is335 = current.endsWith('335');
      this.activeCheat.set(is335 ? 'nyancat' : 'ufo');
      this.addLog(`EASTER EGG ACTIVATED: ${is335 ? 'Nyan Cat' : 'Alien Spaceship'} mode enabled!`, 'success');
      this.cheatCodeInput.set('');
    } else if (current.length > 8) {
      this.cheatCodeInput.set(current.substring(current.length - 4));
    }
  }

  protected launchRocket(override = false) {
    if (this.flightState() === 'launching') return;

    this.clearInterval();
    this.altitude.set(0);
    this.velocity.set(0);
    this.fuelRemaining.set(100);
    this.logs.set([
      { timestamp: '00:00:00', message: 'System launch command initialized.', type: 'info' }
    ]);

    // Validation checks
    if (!override && this.activeCheat() === 'none') {
      if (this.thrust() < 60) {
        this.flightState.set('aborted');
        this.addLog('LIFT-OFF ERROR: Insufficient thrust parameters (< 60%). Gravity vector dominates.', 'error');
        return;
      }
      if (this.fuelRatio() < 40 || this.fuelRatio() > 60) {
        this.flightState.set('aborted');
        this.addLog('ENGINE CRITICAL: Combustion instability. Incorrect oxidizer-fuel mixture.', 'error');
        return;
      }
      if (this.pitchAngle() < 70 || this.pitchAngle() > 105) {
        this.flightState.set('aborted');
        this.addLog('GUIDANCE FAULT: Attack angle outside safety envelope (70°-105°). Wind shear warning.', 'error');
        return;
      }
    }

    this.flightState.set('launching');
    this.addLog('Ignition sequence start...', 'warning');
    
    setTimeout(() => {
      if (this.flightState() !== 'launching') return;
      this.addLog('LIFT-OFF! Rocket is airborne.', 'success');
      
      const speedCoeff = this.activeCheat() !== 'none' ? 1.8 : 1.0;
      let tick = 0;
      
      this.intervalId = setInterval(() => {
        tick++;
        
        // Update physics simulation
        this.fuelRemaining.update(f => Math.max(0, f - (override ? 3 : 1.5)));
        
        // Velocity increases based on thrust
        this.velocity.update(v => Math.floor(v + (this.thrust() / 15) * speedCoeff));
        
        // Altitude increases based on velocity
        this.altitude.update(alt => {
          const delta = Math.floor(this.velocity() / 10);
          const nextAlt = alt + delta;

          // Check milestones
          this.checkMilestones(alt, nextAlt);

          // Handle override explosion
          if (override && nextAlt >= 4000 && this.flightState() === 'launching') {
            this.triggerExplosion();
            return alt;
          }

          if (nextAlt >= 10000) {
            this.triggerOrbitReached();
            return 10000;
          }

          return nextAlt;
        });

        if (this.fuelRemaining() === 0 && this.altitude() < 10000 && this.flightState() === 'launching') {
          this.flightState.set('exploded');
          this.addLog('CRITICAL FAILURE: Fuel exhausted before orbit insertion. Parachute auto-deploy failed.', 'error');
          this.clearInterval();
        }

      }, 100);
    }, 1500);
  }

  private checkMilestones(currentAlt: number, nextAlt: number) {
    this.milestones.forEach(m => {
      if (currentAlt < m.altitude && nextAlt >= m.altitude) {
        this.addLog(`[ALTITUDE: ${m.altitude}m] Milestone reached!`, 'success');
        this.addLog(`🚀 ${m.year}: ${m.title} - ${m.description}`, 'milestone');
      }
    });
  }

  private triggerExplosion() {
    this.flightState.set('exploded');
    this.velocity.set(0);
    this.clearInterval();
    this.addLog('🔥 BOOM! Telemetry signals lost. Structural integrity compromised.', 'error');
    this.addLog('RECOVERY REPORT: Debris retrieved from coordinates. Experience and education log files intact.', 'warning');
  }

  private triggerOrbitReached() {
    this.flightState.set('orbit');
    this.velocity.set(0);
    this.clearInterval();
    this.addLog('✨ APOGEE REACHED. Main engines cut. Orbit insertion complete!', 'success');
    this.addLog('Teknofest Flight Computer status: Orbit nominal. Ready for deployment.', 'success');
  }

  protected triggerOverride() {
    this.launchRocket(true);
  }

  protected resetFlightSimulator() {
    this.clearInterval();
    this.altitude.set(0);
    this.velocity.set(0);
    this.fuelRemaining.set(100);
    this.flightState.set('prelaunch');
    this.activeCheat.set('none');
    this.logs.set([
      { timestamp: '00:00:00', message: 'Flight computer rebooted.', type: 'info' },
      { timestamp: '00:00:01', message: 'Standing by for launch parameters.', type: 'info' }
    ]);
  }
}
