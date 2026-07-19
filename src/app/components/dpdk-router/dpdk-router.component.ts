import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';

interface RouteRule {
  cidr: string;
  gateway: string;
  port: string;
  isLoop: boolean;
}

interface Packet {
  id: number;
  dst: string;
  port: string;
  status: 'routed' | 'looping' | 'dropped';
  position: number; // For layout/animation
}

@Component({
  selector: 'app-dpdk-router',
  imports: [CommonModule, FormsModule],
  templateUrl: './dpdk-router.component.html',
  styleUrl: './dpdk-router.component.scss',
})
export class DpdkRouterComponent implements OnDestroy {
  protected readonly dataService = inject(DataService);

  protected readonly rules = signal<RouteRule[]>([
    { cidr: '10.10.0.0/16', gateway: '192.168.1.1', port: 'Port 1 (WAN)', isLoop: false },
    { cidr: '172.16.0.0/12', gateway: '10.0.0.1', port: 'Port 2 (LAN)', isLoop: false },
    { cidr: '192.168.0.0/16', gateway: '192.168.10.1', port: 'Port 3 (DMZ)', isLoop: false }
  ]);

  protected readonly packets = signal<Packet[]>([]);
  protected readonly cpuLoad = signal(12); // %
  protected readonly packetRate = signal(450); // packets/sec
  protected readonly alarmActive = signal(false);

  // Form bindings
  protected readonly newCidr = signal('10.20.0.0/24');
  protected readonly newPort = signal('Port 1 (WAN)');
  protected readonly makeLoop = signal(false);

  private intervalId: any = null;
  private packetIdCounter = 0;

  ngOnDestroy() {
    this.clearInterval();
  }

  private clearInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  protected addRule() {
    // Determine gateway based on port or loop selection
    const gateway = this.makeLoop() ? 'LOOPBACK (127.0.0.1)' : `192.168.10.${Math.floor(Math.random() * 254) + 1}`;
    
    this.rules.update(prev => [
      ...prev,
      {
        cidr: this.newCidr(),
        gateway,
        port: this.makeLoop() ? 'Internal Ring-0 Loop' : this.newPort(),
        isLoop: this.makeLoop()
      }
    ]);
  }

  protected removeRule(index: number) {
    this.rules.update(prev => prev.filter((_, i) => i !== index));
  }

  protected injectTraffic() {
    this.clearInterval();

    // Check if any rule contains a loop
    const hasLoopRule = this.rules().some(r => r.isLoop);
    this.packets.set([]);
    this.packetIdCounter = 0;

    let tick = 0;
    this.intervalId = setInterval(() => {
      tick++;

      // Create new packets
      const newPackets: Packet[] = [];
      const count = hasLoopRule ? 5 : 2;
      for (let i = 0; i < count; i++) {
        this.packetIdCounter++;
        newPackets.push({
          id: this.packetIdCounter,
          dst: hasLoopRule ? '127.0.0.1 (Cyclic)' : `10.10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          port: hasLoopRule ? 'Internal Loop' : ['Port 1 (WAN)', 'Port 2 (LAN)', 'Port 3 (DMZ)'][Math.floor(Math.random() * 3)],
          status: hasLoopRule ? 'looping' : 'routed',
          position: 0
        });
      }

      // Update existing packets positions
      this.packets.update(prev => {
        const updated = prev
          .map(p => ({ ...p, position: p.position + (hasLoopRule ? 8 : 15) }))
          .filter(p => p.position < 100);
        return [...updated, ...newPackets];
      });

      if (hasLoopRule) {
        // CPU spikes and packet storm
        this.cpuLoad.update(c => Math.min(100, c + 8));
        this.packetRate.update(r => r + 2400);

        if (this.cpuLoad() > 60) {
          this.alarmActive.set(true);
        }

        if (this.cpuLoad() === 100 && tick > 15) {
          this.clearInterval();
          // Crash the app
          this.dataService.isCrashed.set(true);
        }
      } else {
        // Normal traffic simulation
        this.cpuLoad.set(Math.floor(10 + Math.random() * 15));
        this.packetRate.set(Math.floor(400 + Math.random() * 120));
        this.alarmActive.set(false);
      }

    }, 200);
  }

  protected stopTraffic() {
    this.clearInterval();
    this.packets.set([]);
    this.cpuLoad.set(5);
    this.packetRate.set(0);
    this.alarmActive.set(false);
  }

  protected resetRouter() {
    this.stopTraffic();
    this.rules.set([
      { cidr: '10.10.0.0/16', gateway: '192.168.1.1', port: 'Port 1 (WAN)', isLoop: false },
      { cidr: '172.16.0.0/12', gateway: '10.0.0.1', port: 'Port 2 (LAN)', isLoop: false },
      { cidr: '192.168.0.0/16', gateway: '192.168.10.1', port: 'Port 3 (DMZ)', isLoop: false }
    ]);
    this.dataService.isCrashed.set(false);
  }
}
