import { TestBed } from '@angular/core/testing';
import {
  GossipProtocol,
  type ProtocolNode,
  type ProtocolLink,
  type GossipMode,
} from './gossip-visualizer.component';
import { GossipVisualizerComponent } from './gossip-visualizer.component';
import { DataService } from '../../services/data.service';
import { SimulationStateService } from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';
import type { WritableSignal } from '@angular/core';

/**
 * Test-only mirror of GossipVisualizerComponent's protected/private members
 * (each member re-declared with the same type as on the component).
 * `as unknown as GossipHandle` re-exposes them to the spec without weakening
 * their types — every member must exist on GossipVisualizerComponent.
 */
type GossipHandle = {
  protocol: GossipProtocol;
  nodes: ProtocolNode[];
  simState: SimulationStateService;
  tickCount: WritableSignal<number>;
  messagesSent: WritableSignal<number>;
  argCode: WritableSignal<string | null>;
  checkWinCondition(): void;
  injectEpidemic(): void;
};

// ---- helpers --------------------------------------------------------------

function makeNodes(ids: string[]): ProtocolNode[] {
  return ids.map((id) => ({
    id,
    label: id,
    category: 'about',
    title: id,
    body: [],
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 30,
    state: 'idle',
    infectionTime: 0,
    failed: false,
    messages: new Set<string>(),
  }));
}

function makeLink(a: string, b: string): ProtocolLink {
  return { from: a, to: b, severed: false };
}

function starTopology(center: string, leaves: string[]): { nodes: ProtocolNode[]; links: ProtocolLink[] } {
  const nodes = makeNodes([center, ...leaves]);
  const links = leaves.map((l) => makeLink(center, l));
  return { nodes, links };
}

// ---- GossipProtocol (pure logic) ------------------------------------------

describe('GossipProtocol', () => {
  let proto: GossipProtocol;

  beforeEach(() => {
    proto = new GossipProtocol();
  });

  describe('push', () => {
    it('Given infected source + 2 targets, When push, Then targets receive the rumor', () => {
      const nodes = makeNodes(['A', 'B', 'C']);
      const source = nodes[0]!;
      source.messages.add('rumor');
      source.state = 'infected';
      const packets = proto.push(source, [nodes[1]!, nodes[2]!]);
      expect(packets).toHaveLength(2);
      // After push, targets now hold the message.
      expect(nodes[1]!.messages.has('rumor')).toBe(true);
      expect(nodes[2]!.messages.has('rumor')).toBe(true);
    });

    it('Given target already has the rumor, When push, Then no packet is sent (dedup)', () => {
      const nodes = makeNodes(['A', 'B']);
      const source = nodes[0]!;
      source.messages.add('rumor');
      source.state = 'infected';
      nodes[1]!.messages.add('rumor');
      const packets = proto.push(source, [nodes[1]!]);
      expect(packets).toHaveLength(0);
    });
  });

  describe('pull', () => {
    it('Given idle requester + peer with rumor, When pull, Then requester receives rumor', () => {
      const nodes = makeNodes(['A', 'B']);
      const peer = nodes[1]!;
      peer.messages.add('rumor');
      peer.state = 'infected';
      const packets = proto.pull(nodes[0]!, [peer]);
      expect(packets).toHaveLength(1);
      expect(nodes[0]!.messages.has('rumor')).toBe(true);
    });

    it('Given requester already has rumor, When pull, Then no packet (already converged)', () => {
      const nodes = makeNodes(['A', 'B']);
      nodes[0]!.messages.add('rumor');
      nodes[1]!.messages.add('rumor');
      const packets = proto.pull(nodes[0]!, [nodes[1]!]);
      expect(packets).toHaveLength(0);
    });
  });

  describe('pushPull', () => {
    it('Given A has rumor and B does not, When pushPull(A,[B]), Then B receives rumor (bidirectional)', () => {
      const nodes = makeNodes(['A', 'B']);
      nodes[0]!.messages.add('rumor');
      nodes[0]!.state = 'infected';
      const packets = proto.pushPull(nodes[0]!, [nodes[1]!]);
      expect(packets.length).toBeGreaterThan(0);
      expect(nodes[1]!.messages.has('rumor')).toBe(true);
    });

    it('Given B has rumor and A does not, When pushPull(A,[B]), Then A receives rumor via pull direction', () => {
      const nodes = makeNodes(['A', 'B']);
      nodes[1]!.messages.add('rumor');
      nodes[1]!.state = 'infected';
      const packets = proto.pushPull(nodes[0]!, [nodes[1]!]);
      expect(packets.length).toBeGreaterThan(0);
      expect(nodes[0]!.messages.has('rumor')).toBe(true);
    });
  });

  describe('runAntiEntropy', () => {
    it('Given partial infection, When runAntiEntropy, Then all nodes converge to full set', () => {
      const nodes = makeNodes(['A', 'B', 'C']);
      nodes[0]!.messages.add('rumor');
      nodes[0]!.state = 'infected';
      const packets = proto.runAntiEntropy(nodes, 1);
      expect(packets.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.messages.has('rumor'))).toBe(true);
    });
  });

  describe('detectPartition', () => {
    it('Given fully connected graph, When detectPartition, Then single component', () => {
      const { nodes, links } = starTopology('A', ['B', 'C']);
      const comps = proto.detectPartition(nodes, links);
      expect(comps).toHaveLength(1);
      expect(comps[0]!.sort()).toEqual(['A', 'B', 'C']);
    });

    it('Given severed link splits graph, When detectPartition, Then two components', () => {
      // A-B-C with B-C severed -> {A,B} and {C}
      const nodes = makeNodes(['A', 'B', 'C']);
      const links: ProtocolLink[] = [
        makeLink('A', 'B'),
        { from: 'B', to: 'C', severed: true },
      ];
      const comps = proto.detectPartition(nodes, links);
      expect(comps).toHaveLength(2);
    });

    it('Given all nodes failed except one, When detectPartition, Then single survivor component', () => {
      const nodes = makeNodes(['A', 'B', 'C']);
      nodes[1]!.failed = true;
      nodes[2]!.failed = true;
      const links = [makeLink('A', 'B'), makeLink('B', 'C')];
      const comps = proto.detectPartition(nodes, links);
      expect(comps).toHaveLength(1);
      expect(comps[0]).toEqual(['A']);
    });
  });

  describe('calculateConvergence', () => {
    it('Given 0 of 4 nodes have rumor, When calculateConvergence, Then 0%', () => {
      const nodes = makeNodes(['A', 'B', 'C', 'D']);
      expect(proto.calculateConvergence(nodes)).toBe(0);
    });

    it('Given 4 of 4 nodes have rumor, When calculateConvergence, Then 100', () => {
      const nodes = makeNodes(['A', 'B', 'C', 'D']);
      nodes.forEach((n) => n.messages.add('rumor'));
      expect(proto.calculateConvergence(nodes)).toBe(100);
    });

    it('Given 2 of 4 nodes have rumor, When calculateConvergence, Then 50', () => {
      const nodes = makeNodes(['A', 'B', 'C', 'D']);
      nodes[0]!.messages.add('rumor');
      nodes[1]!.messages.add('rumor');
      expect(proto.calculateConvergence(nodes)).toBe(50);
    });

    it('Given failed nodes, When calculateConvergence, Then failed nodes excluded from total', () => {
      const nodes = makeNodes(['A', 'B', 'C']);
      nodes[0]!.messages.add('rumor');
      nodes[2]!.failed = true;
      // 1 of 2 live = 50
      expect(proto.calculateConvergence(nodes)).toBe(50);
    });
  });

  describe('handleNodeFailure', () => {
    it('Given live node, When handleNodeFailure, Then node.failed=true and messages cleared', () => {
      const nodes = makeNodes(['A', 'B']);
      nodes[0]!.messages.add('rumor');
      const removed = proto.handleNodeFailure(nodes[0]!, nodes);
      expect(removed.failed).toBe(true);
      expect(removed.messages.size).toBe(0);
    });
  });

  describe('tick', () => {
    it('Given push mode + star topology + center infected, When tick, Then leaves receive rumor', () => {
      const { nodes, links } = starTopology('A', ['B', 'C', 'D']);
      nodes[0]!.messages.add('rumor');
      nodes[0]!.state = 'infected';
      const stats = proto.tick(nodes, links, 'push');
      expect(stats.messagesSent).toBeGreaterThan(0);
      // At least one leaf should now have the rumor.
      const leaves = nodes.filter((n) => n.id !== 'A');
      expect(leaves.some((n) => n.messages.has('rumor'))).toBe(true);
    });

    it('Given pull mode + center infected, When tick, Then leaves pull from center', () => {
      const { nodes, links } = starTopology('A', ['B', 'C']);
      nodes[0]!.messages.add('rumor');
      nodes[0]!.state = 'infected';
      const stats = proto.tick(nodes, links, 'pull');
      expect(stats.messagesSent).toBeGreaterThan(0);
      expect(nodes[1]!.messages.has('rumor') || nodes[2]!.messages.has('rumor')).toBe(true);
    });

    it('Given push-pull mode, When tick, Then propagation occurs (fastest convergence)', () => {
      const { nodes, links } = starTopology('A', ['B', 'C', 'D', 'E']);
      nodes[0]!.messages.add('rumor');
      nodes[0]!.state = 'infected';
      const stats = proto.tick(nodes, links, 'push-pull');
      expect(stats.messagesSent).toBeGreaterThan(0);
    });

    it('Given severed partition isolating rumor source, When tick repeatedly, Then convergence < 100', () => {
      // A-B-C, B-C severed, rumor starts at A. Only A,B can ever get it.
      const nodes = makeNodes(['A', 'B', 'C']);
      const links: ProtocolLink[] = [makeLink('A', 'B'), { from: 'B', to: 'C', severed: true }];
      nodes[0]!.messages.add('rumor');
      nodes[0]!.state = 'infected';
      for (let i = 0; i < 10; i++) proto.tick(nodes, links, 'push-pull');
      expect(proto.calculateConvergence(nodes)).toBeLessThan(100);
    });
  });

  describe('convergence via repeated tick', () => {
    it('Given connected topology + push-pull, When tick until stable, Then 100% convergence', () => {
      const { nodes, links } = starTopology('A', ['B', 'C', 'D']);
      nodes[0]!.messages.add('rumor');
      nodes[0]!.state = 'infected';
      for (let i = 0; i < 20; i++) proto.tick(nodes, links, 'push-pull');
      expect(proto.calculateConvergence(nodes)).toBe(100);
    });
  });
});

// ---- Component integration -------------------------------------------------

describe('GossipVisualizerComponent', () => {
  let fixture: GossipVisualizerComponent;
  let dataService: DataService;
  let simState: SimulationStateService;
  let achievements: AchievementService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(GossipVisualizerComponent).componentInstance;
    dataService = TestBed.inject(DataService);
    simState = TestBed.inject(SimulationStateService);
    achievements = TestBed.inject(AchievementService);
    fixture.ngOnInit();
  });

  afterEach(() => {
    fixture.ngOnDestroy();
  });

  it('sources the bio node body from DataService.bio()', () => {
    const nodes: ProtocolNode[] = (fixture as unknown as GossipHandle).nodes;
    const bioNode = nodes.find((n) => n.id === 'bio');
    expect(bioNode).toBeDefined();
    expect(bioNode!.body).toEqual([dataService.bio()]);
  });

  it('sources the tng node body from DataService.currentRole()', () => {
    const tngNode: ProtocolNode | undefined = (fixture as unknown as GossipHandle).nodes.find((n: ProtocolNode) => n.id === 'tng');
    expect(tngNode).toBeDefined();
    expect(tngNode!.body).toEqual([dataService.currentRole()]);
  });

  it('maps the bogazici node from BOTH Boğaziçi EducationEntry degrees', () => {
    const bogNode: ProtocolNode | undefined = (fixture as unknown as GossipHandle).nodes.find((n: ProtocolNode) => n.id === 'bogazici');
    expect(bogNode).toBeDefined();
    const bodyJoined = bogNode!.body.join('\n');
    const bogEntries = dataService
      .education()
      .filter((e) => e.institution === 'Boğaziçi University');
    expect(bogEntries).toHaveLength(2);
    expect(bodyJoined).toContain('Industrial Engineering');
    expect(bodyJoined).toContain('Computer Engineering');
  });

  it('writes gossipNodes into SimulationStateService at init', () => {
    expect(simState.gossipNodes().length).toBeGreaterThan(0);
    expect(simState.gossipNodes()[0]!.messages).toBeInstanceOf(Set);
  });

  it('exposes the GossipProtocol instance and supports tick', () => {
    const proto: GossipProtocol = (fixture as unknown as GossipHandle).protocol;
    expect(proto).toBeInstanceOf(GossipProtocol);
    // infect the bio node and tick once -> messages sent should be >= 0 (no throw)
    const nodes: ProtocolNode[] = (fixture as unknown as GossipHandle).nodes;
    nodes[0]!.messages.add('rumor');
    nodes[0]!.state = 'infected';
    expect(() => proto.tick(nodes, [], 'push-pull')).not.toThrow();
  });

  it('sets gossipArgSolved=true when convergence reaches 100 with ARG partition active', () => {
    // Force partition active then reach 100% convergence via anti-entropy.
    simState.gossipArgPartition.set(['A-B']);
    const proto: GossipProtocol = (fixture as unknown as GossipHandle).protocol;
    const nodes: ProtocolNode[] = (fixture as unknown as GossipHandle).nodes;
    nodes.forEach((n) => n.messages.add('rumor'));
    // Trigger the win-check path manually (component method).
    (fixture as unknown as GossipHandle).checkWinCondition();
    expect(simState.gossipArgSolved()).toBe(true);
  });

  it('unlocks gossip-converged achievement when convergence is 100', () => {
    const nodes: ProtocolNode[] = (fixture as unknown as GossipHandle).nodes;
    nodes.forEach((n) => n.messages.add('rumor'));
    (fixture as unknown as GossipHandle).checkWinCondition();
    expect(achievements.isUnlocked('gossip-converged')).toBe(true);
  });

  it('exposes simState as protected for template access', () => {
    expect((fixture as unknown as GossipHandle).simState).toBe(simState);
  });

  describe('injectEpidemic (user-driven tick)', () => {
    it('Given fresh mesh, When injectEpidemic called once, Then tickCount advances by exactly 1', () => {
      const before = (fixture as unknown as GossipHandle).tickCount();
      (fixture as unknown as GossipHandle).injectEpidemic();
      expect((fixture as unknown as GossipHandle).tickCount()).toBe(before + 1);
    });

    it('Given fresh mesh with bio node infected, When injectEpidemic, Then messagesSent increments (rumor propagates)', () => {
      const before = (fixture as unknown as GossipHandle).messagesSent();
      (fixture as unknown as GossipHandle).injectEpidemic();
      expect((fixture as unknown as GossipHandle).messagesSent()).toBeGreaterThan(before);
    });

    it('Given fresh mesh, When injectEpidemic called twice in a row, Then tickCount is 2', () => {
      (fixture as unknown as GossipHandle).injectEpidemic();
      (fixture as unknown as GossipHandle).injectEpidemic();
      expect((fixture as unknown as GossipHandle).tickCount()).toBe(2);
    });

    it('Given fresh mesh, When no user action, Then protocol does NOT auto-tick (messagesSent stays 0)', () => {
      expect((fixture as unknown as GossipHandle).messagesSent()).toBe(0);
      expect((fixture as unknown as GossipHandle).tickCount()).toBe(0);
    });

    it('Given bio node rumor cleared, When injectEpidemic, Then bio node re-infected and protocol advances', () => {
      const nodes: ProtocolNode[] = (fixture as unknown as GossipHandle).nodes;
      const bio = nodes.find((n) => n.id === 'bio')!;
      bio.messages.clear();
      bio.state = 'idle';
      (fixture as unknown as GossipHandle).injectEpidemic();
      expect(bio.messages.has('rumor')).toBe(true);
      expect((fixture as unknown as GossipHandle).tickCount()).toBe(1);
    });
  });
});
