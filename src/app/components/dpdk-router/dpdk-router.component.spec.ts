import { TestBed } from '@angular/core/testing';
import { ApplicationRef } from '@angular/core';
import { DpdkRouterComponent, RoutingEngine } from './dpdk-router.component';
import { SimulationStateService, RouteRule } from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';

const RULE = (cidr: string, gw: string, port: string): RouteRule => ({ destination: cidr, nextHop: gw, interface: port });

describe('RoutingEngine.longestPrefixMatch', () => {
  const rules: RouteRule[] = [
    RULE('10.10.0.0/16', '192.168.1.1', 'Port 1 (WAN)'),
    RULE('10.10.0.0/24', '10.0.0.1', 'Port 2 (LAN)'),
    RULE('0.0.0.0/0', '192.168.10.1', 'Port 3 (DMZ)'),
  ];
  it('returns the longest matching prefix', () => {
    expect(RoutingEngine.longestPrefixMatch('10.10.0.5', rules)?.interface).toBe('Port 2 (LAN)');
  });
  it('falls back to the default route when no specific prefix matches', () => {
    expect(RoutingEngine.longestPrefixMatch('8.8.8.8', rules)?.interface).toBe('Port 3 (DMZ)');
  });
  it('returns null when no rule matches and there is no default route', () => {
    expect(RoutingEngine.longestPrefixMatch('8.8.8.8', [RULE('10.10.0.0/16', 'gw', 'p')])).toBeNull();
  });
});

describe('RoutingEngine.decrementTtl', () => {
  it('decrements TTL on a live packet', () => {
    expect(RoutingEngine.decrementTtl({ ttl: 64 })?.ttl ?? 0).toBe(63);
  });
  it('drops the packet when TTL reaches zero', () => {
    expect(RoutingEngine.decrementTtl({ ttl: 0 })).toBeNull();
  });
});

describe('RoutingEngine.detectLoop', () => {
  it('detects A->B, B->A gateway bounce', () => {
    expect(RoutingEngine.detectLoop(['192.168.1.1', '10.0.0.1'], '192.168.1.1')).toBe(true);
  });
  it('does not flag a fresh packet with no visited gateways', () => {
    expect(RoutingEngine.detectLoop([], '192.168.1.1')).toBe(false);
  });
});

describe('RoutingEngine.processQueue', () => {
  it('accepts all packets when under capacity', () => {
    const { accepted, dropped } = RoutingEngine.processQueue([{ id: 'a' }, { id: 'b' }], 5);
    expect(accepted).toHaveLength(2);
    expect(dropped).toHaveLength(0);
  });
  it('tail-drops packets beyond capacity', () => {
    const { accepted, dropped } = RoutingEngine.processQueue([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 2);
    expect(accepted).toHaveLength(2);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].id).toBe('c');
  });
});

describe('DpdkRouterComponent', () => {
  let component: DpdkRouterComponent;
  let simState: SimulationStateService;
  let achievements: AchievementService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    component = TestBed.createComponent(DpdkRouterComponent).componentInstance;
    simState = TestBed.inject(SimulationStateService);
    achievements = TestBed.inject(AchievementService);
  });
  afterEach(() => {
    component.ngOnDestroy();
    simState.isSystemCrashed.set(false);
    simState.routingRules.set([]);
  });
  function flushEffects(): void { TestBed.inject(ApplicationRef).tick(); }

  it('reads routing rules from SimulationStateService.routingRules', () => {
    simState.routingRules.set([RULE('10.10.0.0/16', '192.168.1.1', 'Port 1 (WAN)')]);
    flushEffects();
    expect(component.rules()).toHaveLength(1);
    expect(component.rules()[0].destination).toBe('10.10.0.0/16');
  });
  it('addRule writes the new rule into SimulationStateService.routingRules', () => {
    component.newCidr.set('10.20.0.0/24');
    component.newPort.set('Port 1 (WAN)');
    component.newGateway.set('192.168.20.1');
    component.addRule();
    expect(simState.routingRules().some((r) => r.destination === '10.20.0.0/24')).toBe(true);
  });
  it('processTick routes a matching packet and unlocks all-packets-routed on win', () => {
    simState.routingRules.set([RULE('10.10.0.0/16', '192.168.1.1', 'Port 1 (WAN)')]);
    flushEffects();
    component.injectPacket('10.10.0.5');
    expect(component.packets()).toHaveLength(1);
    component.processTick();
    for (let i = 0; i < 10 && component.packets().length > 0; i++) component.processTick();
    expect(achievements.isUnlocked('all-packets-routed')).toBe(true);
  });
  it('crashes the system when a routing loop drives CPU to 100%', () => {
    simState.routingRules.set([
      RULE('10.0.0.0/8', '192.168.1.1', 'Port 1 (WAN)'),
      RULE('192.168.0.0/16', '10.0.0.1', 'Port 2 (LAN)'),
    ]);
    flushEffects();
    for (let i = 0; i < 30; i++) component.injectPacket('10.0.0.5');
    for (let i = 0; i < 200; i++) {
      component.processTick();
      if (simState.isSystemCrashed()) break;
    }
    expect(simState.isSystemCrashed()).toBe(true);
  });
  it('removes the isLoop checkbox (loops emerge from topology, not a toggle)', () => {
    expect((component as any).makeLoop).toBeUndefined();
  });
});
