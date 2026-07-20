import { Component, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SimulationStateService, RouteRule, Packet as SimPacket } from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';

export interface RoutablePacket {
  id: string; dstIp: string; currentHop: string; ttl: number; port: string;
  status: 'in_flight' | 'routed' | 'looping' | 'dropped'; position: number; visitedHops: string[];
}

export interface RouteLogEntry {
  id: string;
  packetId: string;
  dstIp: string;
  outcome: 'ROUTED' | 'DROPPED' | 'NO_ROUTE';
  detail: string;
  timestamp: number;
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
  { destination: '172.16.0.0/12', nextHop: '10.0.0.1', interface: 'Port 2 (LAN)' },
  { destination: '192.168.0.0/16', nextHop: '192.168.10.1', interface: 'Port 3 (DMZ)' },
];
const INITIAL_TTL = 64;
const QUEUE_CAPACITY = 8;
const PROCESSING_COST = 4;
const TICK_MS = 200;
const INJECT_BATCH = ['10.10.5.20', '172.16.8.4', '192.168.50.10', '8.8.8.8'];
const INJECT_INTERVAL_MS = 2000;
const MAX_LOG_ENTRIES = 30;

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
  public readonly droppedPackets = signal<RoutablePacket[]>([]);
  public readonly cpuLoad = signal(0);
  public readonly packetRate = signal(0);
  public readonly alarmActive = signal(false);
  public readonly routedCount = signal(0);
  public readonly droppedCount = signal(0);
  public readonly routeLogs = signal<RouteLogEntry[]>([]);
  public readonly isStreaming = signal(false);
  public readonly newCidr = signal('10.10.0.0/16');
  public readonly newPort = signal('Port 1 (WAN)');
  public readonly newGateway = signal('192.168.1.1');
  private tickIntervalId: ReturnType<typeof setInterval> | null = null;
  private injectIntervalId: ReturnType<typeof setInterval> | null = null;
  private packetIdCounter = 0;
  private logIdCounter = 0;
  private achievementUnlocked = false;

  constructor() {
    if (this.simState.routingRules().length === 0) this.simState.routingRules.set(DEFAULT_RULES);
  }

  ngOnDestroy(): void { this.clearIntervals(); }
  private clearIntervals(): void {
    if (this.tickIntervalId !== null) { clearInterval(this.tickIntervalId); this.tickIntervalId = null; }
    if (this.injectIntervalId !== null) { clearInterval(this.injectIntervalId); this.injectIntervalId = null; }
    this.isStreaming.set(false);
  }

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
      port: 'RX', status: 'in_flight', position: 0, visitedHops: [],
    }]);
  }

  private injectBatch(): void {
    for (const dst of INJECT_BATCH) this.injectPacket(dst);
  }

  private addLog(entry: Omit<RouteLogEntry, 'id' | 'timestamp'>): void {
    this.logIdCounter++;
    const full: RouteLogEntry = { ...entry, id: `log-${this.logIdCounter}`, timestamp: Date.now() };
    this.routeLogs.update((prev) => [full, ...prev].slice(0, MAX_LOG_ENTRIES));
  }

  /** LPM on currentHop, TTL decrement, A-B-A loop detect, tail-drop, emergent GSOD on CPU=100%+loop. */
  processTick(): void {
    if (this.simState.isSystemCrashed()) return;
    const rules = this.rules();
    let processed = 0;
    let loopingCount = 0;
    const routed: RoutablePacket[] = [];
    const dropped: RoutablePacket[] = [];
    const stillInFlight: RoutablePacket[] = [];

    for (const pkt of this.packets()) {
      const match = RoutingEngine.longestPrefixMatch(pkt.currentHop, rules);
      if (match === null) {
        processed++;
        if (pkt.visitedHops.length > 0) {
          routed.push({ ...pkt, position: 100, status: 'routed' });
          this.addLog({
            packetId: pkt.id, dstIp: pkt.dstIp, outcome: 'ROUTED',
            detail: `ROUTED ${pkt.dstIp} → ${pkt.visitedHops[pkt.visitedHops.length - 1]}`,
          });
        } else {
          const droppedPkt: RoutablePacket = { ...pkt, position: 50, status: 'dropped' };
          dropped.push(droppedPkt);
          this.addLog({
            packetId: pkt.id, dstIp: pkt.dstIp, outcome: 'NO_ROUTE',
            detail: `NO ROUTE — PACKET DROPPED (dst ${pkt.dstIp})`,
          });
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
      if (nextPosition >= 100) {
        routed.push({ ...pkt, position: 100, status: 'routed' });
        this.addLog({
          packetId: pkt.id, dstIp: pkt.dstIp, outcome: 'ROUTED',
          detail: `ROUTED ${pkt.dstIp} → ${match.nextHop} via ${match.interface}`,
        });
        continue;
      }
      stillInFlight.push({ ...pkt, ttl: decremented.ttl, currentHop: match.nextHop,
        port: match.interface, status: 'in_flight', position: nextPosition,
        visitedHops: [...pkt.visitedHops, match.nextHop] });
    }

    const { accepted, dropped: queueDropped } = RoutingEngine.processQueue(stillInFlight, QUEUE_CAPACITY);
    processed += queueDropped.length;

    if (routed.length > 0) this.routedCount.update((n) => n + routed.length);
    if (dropped.length > 0) this.droppedCount.update((n) => n + dropped.length);
    if (queueDropped.length > 0) {
      for (const pkt of queueDropped) {
        this.addLog({
          packetId: pkt.id, dstIp: pkt.dstIp, outcome: 'DROPPED',
          detail: `QUEUE FULL — TAIL DROP (dst ${pkt.dstIp})`,
        });
      }
      this.droppedCount.update((n) => n + queueDropped.length);
    }

    const totalAttempted = routed.length + accepted.length + dropped.length + queueDropped.length;
    if (totalAttempted > 0 && routed.length === totalAttempted && loopingCount === 0 && dropped.length === 0 && queueDropped.length === 0 && !this.achievementUnlocked) {
      this.achievementUnlocked = true;
      this.achievements.unlock('all-packets-routed');
    }
    const cpu = Math.min(100, processed * PROCESSING_COST);
    this.cpuLoad.set(cpu);
    const packetsPerSec = (processed * 1000) / TICK_MS;
    const mpps = packetsPerSec / 1_000_000;
    this.packetRate.set(Math.round(packetsPerSec * mpps > 0 ? packetsPerSec : 0));
    this.alarmActive.set(loopingCount > 0 || cpu >= 100 || dropped.length > 0);
    if (loopingCount > 0 && accepted.length >= QUEUE_CAPACITY) {
      this.clearIntervals();
      this.simState.isSystemCrashed.set(true);
    }
    this.packets.set(accepted);
    this.droppedPackets.set(dropped.slice(0, 4));
    this.syncToSimState(accepted, routed);
  }

  injectTraffic(): void {
    this.clearIntervals();
    this.routedCount.set(0);
    this.droppedCount.set(0);
    this.routeLogs.set([]);
    this.packets.set([]);
    this.achievementUnlocked = false;
    this.isStreaming.set(true);
    this.injectBatch();
    this.tickIntervalId = setInterval(() => this.processTick(), TICK_MS);
    this.injectIntervalId = setInterval(() => this.injectBatch(), INJECT_INTERVAL_MS);
  }
  stopTraffic(): void {
    this.clearIntervals();
    this.packets.set([]);
    this.cpuLoad.set(0);
    this.packetRate.set(0);
    this.alarmActive.set(false);
    this.routedCount.set(0);
    this.droppedCount.set(0);
    this.syncToSimState([], []);
  }
  resetRouter(): void {
    this.stopTraffic();
    this.routeLogs.set([]);
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
