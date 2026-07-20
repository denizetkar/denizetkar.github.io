import { Component, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SimulationStateService, RouteRule, Packet as SimPacket } from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';

export interface RoutablePacket {
  id: string; dstIp: string; currentHop: string; ttl: number; port: string;
  status: 'routed' | 'looping' | 'dropped'; position: number; visitedHops: string[];
}

export class RoutingEngine {
  static ipToIntPublic(ip: string): number | null { return RoutingEngine.ipToInt(ip); }
  static parseCidrPublic(cidr: string): { ip: number; mask: number } | null { return RoutingEngine.parseCidr(cidr); }

  private static ipToInt(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    let result = 0;
    for (const part of parts) {
      const octet = Number.parseInt(part, 10);
      if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
      result = (result << 8) | octet;
    }
    return result >>> 0;
  }

  private static parseCidr(cidr: string): { ip: number; mask: number } | null {
    const [ipPart, prefixPart] = cidr.split('/');
    if (!ipPart || prefixPart === undefined) return null;
    const prefix = Number.parseInt(prefixPart, 10);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
    const ip = RoutingEngine.ipToInt(ipPart);
    if (ip === null) return null;
    const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
    return { ip, mask };
  }

  static longestPrefixMatch(dstIp: string, rules: RouteRule[]): RouteRule | null {
    const dst = RoutingEngine.ipToInt(dstIp);
    if (dst === null) return null;
    let best: RouteRule | null = null;
    let bestPrefix = -1;
    for (const rule of rules) {
      const parsed = RoutingEngine.parseCidr(rule.destination);
      if (parsed === null) continue;
      if ((dst & parsed.mask) >>> 0 !== (parsed.ip & parsed.mask) >>> 0) continue;
      const prefixLen = Number.parseInt(rule.destination.split('/')[1] ?? '0', 10);
      if (prefixLen > bestPrefix) { bestPrefix = prefixLen; best = rule; }
    }
    return best;
  }

  static decrementTtl(packet: { ttl: number }): { ttl: number } | null {
    if (packet.ttl <= 0) return null;
    return { ttl: packet.ttl - 1 };
  }

  /** A loop is the A->B->A bounce: last two hops differ, next equals the one before last. */
  static detectLoop(visitedGateways: string[], nextGateway: string): boolean {
    if (visitedGateways.length < 2) return false;
    const last = visitedGateways[visitedGateways.length - 1];
    const beforeLast = visitedGateways[visitedGateways.length - 2];
    return last !== beforeLast && beforeLast === nextGateway;
  }

  static processQueue<T>(packets: T[], capacity: number): { accepted: T[]; dropped: T[] } {
    if (packets.length <= capacity) return { accepted: packets.slice(), dropped: [] };
    return { accepted: packets.slice(0, capacity), dropped: packets.slice(capacity) };
  }
}

const DEFAULT_RULES: RouteRule[] = [
  { destination: '10.10.0.0/16', nextHop: '192.168.1.1', interface: 'Port 1 (WAN)' },
  { destination: '172.16.0.0/12', nextHop: '10.0.0.1', interface: 'Port 2 (LAN)' },
  { destination: '192.168.0.0/16', nextHop: '192.168.10.1', interface: 'Port 3 (DMZ)' },
  { destination: '0.0.0.0/0', nextHop: '192.168.10.1', interface: 'Port 3 (DMZ)' },
];
const INITIAL_TTL = 64;
const QUEUE_CAPACITY = 8;
const PROCESSING_COST = 4;
const TICK_MS = 200;

@Component({
  selector: 'app-dpdk-router',
  imports: [CommonModule, FormsModule],
  templateUrl: './dpdk-router.component.html',
  styleUrl: './dpdk-router.component.scss',
})
export class DpdkRouterComponent implements OnDestroy {
  private readonly simState = inject(SimulationStateService);
  private readonly achievements = inject(AchievementService);

  public readonly rules = computed<RouteRule[]>(() => this.simState.routingRules());
  public readonly packets = signal<RoutablePacket[]>([]);
  public readonly cpuLoad = signal(0);
  public readonly packetRate = signal(0);
  public readonly alarmActive = signal(false);
  public readonly newCidr = signal('10.20.0.0/24');
  public readonly newPort = signal('Port 1 (WAN)');
  public readonly newGateway = signal('192.168.20.1');
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private packetIdCounter = 0;

  constructor() {
    if (this.simState.routingRules().length === 0) this.simState.routingRules.set(DEFAULT_RULES);
  }

  ngOnDestroy(): void { this.clearInterval(); }
  private clearInterval(): void { if (this.intervalId !== null) { clearInterval(this.intervalId); this.intervalId = null; } }

  /** A rule is part of an A-B bounce if its nextHop is inside another rule's CIDR and vice versa. */
  isLoopingRule(rule: RouteRule, _index: number): boolean {
    const rules = this.rules();
    const thisCidr = RoutingEngine.parseCidrPublic(rule.destination);
    if (thisCidr === null) return false;
    const thisHop = RoutingEngine.ipToIntPublic(rule.nextHop);
    if (thisHop === null) return false;
    for (const other of rules) {
      if (other === rule) continue;
      const otherCidr = RoutingEngine.parseCidrPublic(other.destination);
      const otherHop = RoutingEngine.ipToIntPublic(other.nextHop);
      if (otherCidr === null || otherHop === null) continue;
      const hopInOther = (otherHop & thisCidr.mask) >>> 0 === (thisCidr.ip & thisCidr.mask) >>> 0;
      const otherHopInThis = (thisHop & otherCidr.mask) >>> 0 === (otherCidr.ip & otherCidr.mask) >>> 0;
      if (hopInOther && otherHopInThis) return true;
    }
    return false;
  }

  addRule(): void {
    const rule: RouteRule = { destination: this.newCidr(), nextHop: this.newGateway(), interface: this.newPort() };
    this.simState.routingRules.update((prev) => [...prev, rule]);
  }
  removeRule(index: number): void { this.simState.routingRules.update((prev) => prev.filter((_, i) => i !== index)); }

  injectPacket(dstIp: string): void {
    this.packetIdCounter++;
    this.packets.update((prev) => [...prev, {
      id: `pkt-${this.packetIdCounter}`, dstIp, currentHop: dstIp, ttl: INITIAL_TTL,
      port: 'RX', status: 'routed', position: 0, visitedHops: [],
    }]);
  }

  /** LPM on currentHop, TTL decrement, A-B-A loop detect, tail-drop, emergent GSOD on CPU=100%+loop. */
  processTick(): void {
    if (this.simState.isSystemCrashed()) return;
    const rules = this.rules();
    let processed = 0;
    let loopingCount = 0;
    const routed: RoutablePacket[] = [];
    const stillInFlight: RoutablePacket[] = [];

    for (const pkt of this.packets()) {
      const match = RoutingEngine.longestPrefixMatch(pkt.currentHop, rules);
      if (match === null) {
        processed++;
        if (pkt.visitedHops.length > 0) {
          routed.push({ ...pkt, position: 100, status: 'routed' });
        }
        continue;
      }
      const looping = RoutingEngine.detectLoop(pkt.visitedHops, match.nextHop);
      const decremented = RoutingEngine.decrementTtl(pkt);
      if (looping || decremented === null) {
        processed++;
        if (decremented === null) continue;
        loopingCount++;
        stillInFlight.push({ ...pkt, ttl: decremented.ttl, currentHop: match.nextHop,
          port: match.interface, status: 'looping', position: Math.min(100, pkt.position + 8),
          visitedHops: [...pkt.visitedHops, match.nextHop] });
        continue;
      }
      processed++;
      const nextPosition = pkt.position + 15;
      if (nextPosition >= 100) { routed.push({ ...pkt, position: 100, status: 'routed' }); continue; }
      stillInFlight.push({ ...pkt, ttl: decremented.ttl, currentHop: match.nextHop,
        port: match.interface, status: 'routed', position: nextPosition,
        visitedHops: [...pkt.visitedHops, match.nextHop] });
    }

    const { accepted, dropped } = RoutingEngine.processQueue(stillInFlight, QUEUE_CAPACITY);
    processed += dropped.length;
    const totalAttempted = routed.length + accepted.length + dropped.length;
    if (totalAttempted > 0 && routed.length === totalAttempted && loopingCount === 0 && dropped.length === 0) {
      this.achievements.unlock('all-packets-routed');
    }
    const cpu = Math.min(100, processed * PROCESSING_COST);
    this.cpuLoad.set(cpu);
    const packetsPerSec = (processed * 1000) / TICK_MS;
    const mpps = packetsPerSec / 1_000_000;
    this.packetRate.set(Math.round(packetsPerSec * mpps > 0 ? packetsPerSec : 0));
    this.alarmActive.set(loopingCount > 0 || cpu >= 100);
    if (loopingCount > 0 && accepted.length >= QUEUE_CAPACITY) {
      this.clearInterval();
      this.simState.isSystemCrashed.set(true);
    }
    this.packets.set(accepted);
    this.syncToSimState(accepted, routed);
  }

  injectTraffic(): void {
    this.clearInterval();
    for (const dst of ['10.10.5.20', '172.16.8.4', '192.168.50.10', '8.8.8.8']) this.injectPacket(dst);
    this.intervalId = setInterval(() => this.processTick(), TICK_MS);
  }
  stopTraffic(): void {
    this.clearInterval();
    this.packets.set([]);
    this.cpuLoad.set(0);
    this.packetRate.set(0);
    this.alarmActive.set(false);
    this.syncToSimState([], []);
  }
  resetRouter(): void {
    this.stopTraffic();
    this.simState.routingRules.set(DEFAULT_RULES);
    this.simState.isSystemCrashed.set(false);
  }
  private syncToSimState(inFlight: RoutablePacket[], routed: RoutablePacket[]): void {
    const all = [...inFlight, ...routed];
    this.simState.packets.set(all.map((p) => ({ id: p.id, source: '10.0.0.1', destination: p.dstIp, size: 64, protocol: 'tcp' })));
    this.simState.cpuLoad.set(this.cpuLoad());
    this.simState.packetRate.set(this.packetRate());
    this.simState.alarmActive.set(this.alarmActive());
  }
}
