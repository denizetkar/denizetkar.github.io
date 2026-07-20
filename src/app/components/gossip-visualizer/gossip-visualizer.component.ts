import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
  OnInit,
  OnDestroy,
  NgZone,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data.service';
import { SimulationStateService } from '../../services/simulation-state.service';

export type GossipMode = 'push' | 'pull' | 'push-pull';
import { AchievementService } from '../../services/achievement.service';

// ---- Protocol types -------------------------------------------------------

export type GossipProtocolMode = GossipMode; // 'push' | 'pull' | 'push-pull'

export interface ProtocolNode {
  id: string;
  label: string;
  category: 'about' | 'project' | 'skill' | 'education';
  title: string;
  body: string[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  state: 'idle' | 'infected' | 'active';
  infectionTime: number;
  failed: boolean;
  /** Set of rumor ids this node currently holds. */
  messages: Set<string>;
}

export interface ProtocolLink {
  from: string;
  to: string;
  /** User- or ARG-severed link. Severed links do not carry traffic. */
  severed: boolean;
}

export interface ActivePacket {
  fromId: string;
  toId: string;
  progress: number;
  speed: number;
}

export interface TickStats {
  messagesSent: number;
  convergencePercent: number;
}

// ---- Pure protocol logic (no Angular deps) --------------------------------

/**
 * Pure push/pull/push-pull gossip protocol with anti-entropy, partition
 * detection, node-failure handling, and convergence metrics.
 *
 * Exported for unit testing — does not touch Angular.
 */
export class GossipProtocol {
  /** Rumor id currently being gossiped. The visualizer only tracks one at a time. */
  readonly rumorId = 'rumor';

  /**
   * PUSH: source sends the rumor to each target that does not yet have it.
   * Returns the list of (fromId,toId) packets generated.
   */
  push(source: ProtocolNode, targets: ProtocolNode[]): ActivePacket[] {
    if (source.failed || !source.messages.has(this.rumorId)) {
      return [];
    }
    const packets: ActivePacket[] = [];
    for (const target of targets) {
      if (target.failed || target.id === source.id) continue;
      if (target.messages.has(this.rumorId)) continue; // dedup
      target.messages.add(this.rumorId);
      if (target.state === 'idle') {
        target.state = 'infected';
        target.infectionTime = Date.now();
      }
      packets.push({ fromId: source.id, toId: target.id, progress: 0, speed: 0.02 });
    }
    return packets;
  }

  /**
   * PULL: requester asks each peer for the rumor; peers that have it push back.
   */
  pull(requester: ProtocolNode, peers: ProtocolNode[]): ActivePacket[] {
    if (requester.failed) return [];
    if (requester.messages.has(this.rumorId)) return []; // already has it
    const packets: ActivePacket[] = [];
    for (const peer of peers) {
      if (peer.failed || peer.id === requester.id) continue;
      if (!peer.messages.has(this.rumorId)) continue;
      requester.messages.add(this.rumorId);
      if (requester.state === 'idle') {
        requester.state = 'infected';
        requester.infectionTime = Date.now();
      }
      packets.push({ fromId: peer.id, toId: requester.id, progress: 0, speed: 0.02 });
      break; // one peer is enough to satisfy the pull
    }
    return packets;
  }

  /**
   * PUSH-PULL: bidirectional exchange in one round — both directions are tried.
   */
  pushPull(source: ProtocolNode, targets: ProtocolNode[]): ActivePacket[] {
    const pushPackets = this.push(source, targets);
    const pullPackets: ActivePacket[] = [];
    if (!source.messages.has(this.rumorId)) {
      // source lacks rumor — pull from any target that has it
      pullPackets.push(...this.pull(source, targets));
    }
    return [...pushPackets, ...pullPackets];
  }

  /**
   * Anti-entropy: every node exchanges its FULL message set with every other node.
   * Guarantees convergence in one round (full-state sync).
   */
  runAntiEntropy(nodes: ProtocolNode[], _interval: number): ActivePacket[] {
    const live = nodes.filter((n) => !n.failed);
    const packets: ActivePacket[] = [];
    for (const node of live) {
      for (const other of live) {
        if (other.id === node.id) continue;
        const before = node.messages.size;
        for (const m of other.messages) node.messages.add(m);
        if (node.messages.size > before) {
          if (node.state === 'idle' && node.messages.has(this.rumorId)) {
            node.state = 'infected';
            node.infectionTime = Date.now();
          }
          packets.push({ fromId: other.id, toId: node.id, progress: 0, speed: 0.03 });
        }
      }
    }
    return packets;
  }

  /**
   * Returns connected components (array of node-id arrays) computed via BFS over
   * the non-severed link graph. Failed nodes form their own singleton components
   * but are otherwise excluded from traversal.
   */
  detectPartition(nodes: ProtocolNode[], links: ProtocolLink[]): string[][] {
    const live = nodes.filter((n) => !n.failed);
    const adj = new Map<string, Set<string>>();
    for (const n of live) adj.set(n.id, new Set());
    for (const link of links) {
      if (link.severed) continue;
      const a = nodes.find((n) => n.id === link.from);
      const b = nodes.find((n) => n.id === link.to);
      if (!a || !b || a.failed || b.failed) continue;
      adj.get(a.id)!.add(b.id);
      adj.get(b.id)!.add(a.id);
    }
    const visited = new Set<string>();
    const components: string[][] = [];
    for (const node of live) {
      if (visited.has(node.id)) continue;
      const comp: string[] = [];
      const queue = [node.id];
      visited.add(node.id);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        comp.push(cur);
        for (const next of adj.get(cur) ?? []) {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
      }
      components.push(comp);
    }
    return components;
  }

  /**
   * % of live nodes holding the rumor / total live nodes.
   * Returns 0 if there are no live nodes.
   */
  calculateConvergence(nodes: ProtocolNode[]): number {
    const live = nodes.filter((n) => !n.failed);
    if (live.length === 0) return 0;
    const infected = live.filter((n) => n.messages.has(this.rumorId)).length;
    return Math.round((infected / live.length) * 100);
  }

  /**
   * Marks a node as failed, clears its message set, and returns the (now-failed) node.
   * Topology re-evaluation happens implicitly via detectPartition on the next tick.
   */
  handleNodeFailure(node: ProtocolNode, _allNodes: ProtocolNode[]): ProtocolNode {
    node.failed = true;
    node.messages.clear();
    node.state = 'idle';
    node.infectionTime = 0;
    return node;
  }

  /**
   * One round of the protocol. For each infected live node, gather its live
   * neighbors (via non-severed links) and apply the selected mode.
   * Returns aggregated stats (messagesSent this round, convergencePercent).
   */
  tick(nodes: ProtocolNode[], links: ProtocolLink[], mode: GossipProtocolMode): TickStats {
    const neighbors = this.buildNeighborMap(nodes, links);
    const allPackets: ActivePacket[] = [];
    // Push/push-pull: every infected node gossips outward.
    if (mode === 'push' || mode === 'push-pull') {
      for (const node of nodes) {
        if (node.failed) continue;
        if (!node.messages.has(this.rumorId)) continue;
        const peers = (neighbors.get(node.id) ?? []).filter((n) => !n.failed);
        const packets =
          mode === 'push' ? this.push(node, peers) : this.pushPull(node, peers);
        allPackets.push(...packets);
      }
    }
    // Pull: every non-infected node pulls from peers.
    if (mode === 'pull') {
      for (const node of nodes) {
        if (node.failed) continue;
        if (node.messages.has(this.rumorId)) continue;
        const peers = (neighbors.get(node.id) ?? []).filter((n) => !n.failed);
        allPackets.push(...this.pull(node, peers));
      }
    }
    // Push-pull also already ran the pull direction above (source lacks rumor).
    return {
      messagesSent: allPackets.length,
      convergencePercent: this.calculateConvergence(nodes),
    };
  }

  private buildNeighborMap(
    nodes: ProtocolNode[],
    links: ProtocolLink[],
  ): Map<string, ProtocolNode[]> {
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const map = new Map<string, ProtocolNode[]>();
    for (const n of nodes) map.set(n.id, []);
    for (const link of links) {
      if (link.severed) continue;
      const a = byId.get(link.from);
      const b = byId.get(link.to);
      if (!a || !b) continue;
      map.get(a.id)!.push(b);
      map.get(b.id)!.push(a);
    }
    return map;
  }
}

// ---- Visualizer component -------------------------------------------------

interface CachedComputedStyle {
  accent: string;
  textSecondary: string;
  fontMono: string;
}

@Component({
  selector: 'app-gossip-visualizer',
  imports: [CommonModule],
  templateUrl: './gossip-visualizer.component.html',
  styleUrl: './gossip-visualizer.component.scss',
})
export class GossipVisualizerComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly dataService = inject(DataService);
  protected readonly simState = inject(SimulationStateService);
  private readonly achievements = inject(AchievementService);
  private readonly ngZone = inject(NgZone);

  @ViewChild('canvasElement') private canvasRef!: ElementRef<HTMLCanvasElement>;

  protected readonly selectedNode = signal<ProtocolNode | null>(null);
  protected readonly infectionCount = signal(0);
  protected readonly totalNodesCount = signal(0);
  protected readonly messagesSent = signal(0);
  protected readonly tickCount = signal(0);
  protected readonly partitions = signal<string[][]>([]);
  protected readonly isPartitioned = signal(false);
  protected readonly argCode = signal<string | null>(null);

  /** Protocol instance — public for unit testing. */
  protected readonly protocol = new GossipProtocol();

  private nodes: ProtocolNode[] = [];
  private links: ProtocolLink[] = [];
  private packets: ActivePacket[] = [];
  private animationFrameId: number | null = null;
  private canvasWidth = 800;
  private canvasHeight = 450;
  private ctx!: CanvasRenderingContext2D;
  private winAchievementFired = false;
  private argSolvedFired = false;

  private cachedStyle: CachedComputedStyle | null = null;
  private readonly resizeHandler = () => {
    this.resizeCanvas();
    this.refreshComputedStyle();
  };
  private readonly themeObserver = new MutationObserver(() => this.refreshComputedStyle());

  ngOnInit() {
    this.setupNodes();
  }

  ngAfterViewInit() {
    this.initCanvas();
  }

  ngOnDestroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.resizeHandler);
    this.themeObserver.disconnect();
  }

  private setupNodes(): void {
    const rawProjects = this.dataService.projects();
    const skills = this.dataService.skills();
    const bogaziciEntries = this.dataService
      .education()
      .filter((e) => e.institution === 'Boğaziçi University');

    const makeNode = (
      id: string,
      label: string,
      category: ProtocolNode['category'],
      title: string,
      body: string[],
      radius: number,
    ): ProtocolNode => ({
      id,
      label,
      category,
      title,
      body,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius,
      state: 'idle',
      infectionTime: 0,
      failed: false,
      messages: new Set<string>(),
    });

    this.nodes = [
      makeNode('bio', 'Bio', 'about', 'Deniz Etkar', [this.dataService.bio()], 45),
      makeNode(
        'bogazici',
        'Boğaziçi',
        'education',
        'Boğaziçi University',
        bogaziciEntries.map(
          (e) => `${e.degree} ${e.field} (${e.startYear} - ${e.endYear})`,
        ),
        40,
      ),
      makeNode(
        'tng',
        'TNG',
        'education',
        'TNG Technology Consulting',
        [this.dataService.currentRole()],
        40,
      ),
      ...rawProjects.map((p) =>
        makeNode(
          `p-${p.name}`,
          p.name,
          'project',
          `Repo: ${p.name}`,
          [p.description, `Tech: ${p.tech.join(', ')}`, ...p.details],
          35,
        ),
      ),
      ...skills.map((s) =>
        makeNode(
          `s-${s.category.toLowerCase().replace(/[^a-z]/g, '')}`,
          s.category,
          'skill',
          `${s.category} Skills`,
          s.skills,
          38,
        ),
      ),
    ];

    this.totalNodesCount.set(this.nodes.length);

    // Initial layout: ring + jitter (physics still drifts afterward).
    const cx = this.canvasWidth / 2;
    const cy = this.canvasHeight / 2;
    const ringR = Math.min(cx, cy) - 60;
    this.nodes.forEach((node, i) => {
      const angle = (i / this.nodes.length) * Math.PI * 2;
      node.x = cx + Math.cos(angle) * ringR + (Math.random() - 0.5) * 20;
      node.y = cy + Math.sin(angle) * ringR + (Math.random() - 0.5) * 20;
      node.vx = (Math.random() - 0.5) * 0.6;
      node.vy = (Math.random() - 0.5) * 0.6;
    });

    // Default topology: each node links to its two ring neighbors (cycle) plus a
    // chord to the bio node so the graph is well-connected.
    this.links = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i]!;
      const b = this.nodes[(i + 1) % this.nodes.length]!;
      this.links.push({ from: a.id, to: b.id, severed: false });
    }
    for (let i = 1; i < this.nodes.length; i++) {
      this.links.push({ from: 'bio', to: this.nodes[i]!.id, severed: false });
    }

    // Mark Bio as the rumor source (active + infected).
    const bioNode = this.nodes.find((n) => n.id === 'bio');
    if (bioNode) {
      bioNode.messages.add(this.protocol.rumorId);
      bioNode.state = 'active';
      bioNode.infectionTime = Date.now();
      this.selectedNode.set(bioNode);
      this.infectionCount.set(1);
    }

    this.applyArgPartition();
    this.syncSimState();
  }

  private applyArgPartition(): void {
    const cuts = this.simState.gossipArgPartition();
    if (cuts.length === 0) return;
    for (const cut of cuts) {
      // Format: "A-B" or "node1-node2"
      const parts = cut.split('-');
      if (parts.length < 2) continue;
      const from = parts[0]!;
      const to = parts.slice(1).join('-');
      for (const link of this.links) {
        if (
          (link.from === from && link.to === to) ||
          (link.from === to && link.to === from)
        ) {
          link.severed = true;
        }
      }
    }
  }

  private initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;

    this.resizeCanvas();
    this.refreshComputedStyle();
    window.addEventListener('resize', this.resizeHandler);
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    this.ngZone.runOutsideAngular(() => {
      const render = () => {
        this.updateSimulation();
        this.drawSimulation();
        this.animationFrameId = requestAnimationFrame(render);
      };
      this.animationFrameId = requestAnimationFrame(render);
    });
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      this.canvasWidth = rect.width;
      this.canvasHeight = rect.height || 450;
      canvas.width = this.canvasWidth;
      canvas.height = this.canvasHeight;
    }
  }

  private refreshComputedStyle(): void {
    if (typeof document === 'undefined') return;
    const style = getComputedStyle(document.documentElement);
    this.cachedStyle = {
      accent: style.getPropertyValue('--accent').trim(),
      textSecondary: style.getPropertyValue('--text-secondary').trim(),
      fontMono: style.getPropertyValue('--font-mono').trim(),
    };
  }

  private updateSimulation(): void {
    // 1. Physics movement (mutates in place — do NOT replace the array).
    for (const node of this.nodes) {
      if (node.failed) continue;
      node.x += node.vx;
      node.y += node.vy;
      if (node.x - node.radius < 0) {
        node.x = node.radius;
        node.vx *= -1;
      }
      if (node.x + node.radius > this.canvasWidth) {
        node.x = this.canvasWidth - node.radius;
        node.vx *= -1;
      }
      if (node.y - node.radius < 0) {
        node.y = node.radius;
        node.vy *= -1;
      }
      if (node.y + node.radius > this.canvasHeight) {
        node.y = this.canvasHeight - node.radius;
        node.vy *= -1;
      }
      // Site-wide epidemic flag from terminal `gossip --infect`.
      if (this.simState.gossipInfected() && node.state === 'idle') {
        this.infectNode(node);
      }
    }

    // 2. Animate flying packets.
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const packet = this.packets[i]!;
      packet.progress += packet.speed;
      if (packet.progress >= 1.0) {
        this.packets.splice(i, 1);
      }
    }

    // 3. Protocol advances only on explicit user click (injectEpidemic); render loop keeps canvas alive.
    this.ngZone.run(() => {
      const conv = this.protocol.calculateConvergence(this.nodes);
      this.simState.convergencePercent.set(conv);
      const infected = this.nodes.filter(
        (n) => !n.failed && n.messages.has(this.protocol.rumorId),
      ).length;
      this.infectionCount.set(infected);
      const components = this.protocol.detectPartition(this.nodes, this.links);
      const liveComponents = components.filter((c) => c.length > 0);
      this.partitions.set(liveComponents);
      this.isPartitioned.set(liveComponents.length > 1);
      this.simState.gossipPackets.set([...this.packets]);
    });
  }

  /** Generate visual packets for newly-infected nodes this frame. */
  private collectVisualPackets(): ActivePacket[] {
    const out: ActivePacket[] = [];
    for (const node of this.nodes) {
      if (node.failed) continue;
      if (!node.messages.has(this.protocol.rumorId)) continue;
      if (node.state === 'idle') continue;
      // Pick a random non-infected neighbor to visualize a packet toward.
      const neighbors = this.links
        .filter(
          (l) =>
            !l.severed &&
            ((l.from === node.id && l.to !== node.id) ||
              (l.to === node.id && l.from !== node.id)),
        )
        .map((l) => (l.from === node.id ? l.to : l.from))
        .map((id) => this.nodes.find((n) => n.id === id))
        .filter((n): n is ProtocolNode => !!n && !n.failed && !n.messages.has(this.protocol.rumorId));
      if (neighbors.length === 0) continue;
      if (Math.random() < 0.3) {
        const target = neighbors[Math.floor(Math.random() * neighbors.length)]!;
        out.push({ fromId: node.id, toId: target.id, progress: 0, speed: 0.015 + Math.random() * 0.01 });
      }
    }
    return out;
  }

  private infectNode(node: ProtocolNode): void {
    node.messages.add(this.protocol.rumorId);
    node.state = 'infected';
    node.infectionTime = Date.now();
    this.ngZone.run(() => {
      const count = this.nodes.filter(
        (n) => !n.failed && n.messages.has(this.protocol.rumorId),
      ).length;
      this.infectionCount.set(count);
    });
  }

  private drawSimulation(): void {
    if (!this.ctx) return;
    const style = this.cachedStyle ?? { accent: '', textSecondary: '', fontMono: '' };
    const accentColor = style.accent || '#14b8a6';
    const textSecColor = style.textSecondary || '#94a3b8';
    const fontMono = style.fontMono || 'monospace';

    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    // 1. Draw links.
    const byId = new Map(this.nodes.map((n) => [n.id, n] as const));
    for (const link of this.links) {
      const a = byId.get(link.from);
      const b = byId.get(link.to);
      if (!a || !b) continue;
      if (link.severed) {
        this.ctx.strokeStyle = 'rgba(255, 80, 80, 0.4)';
        this.ctx.setLineDash([4, 6]);
      } else if (a.messages.has(this.protocol.rumorId) && b.messages.has(this.protocol.rumorId)) {
        this.ctx.strokeStyle = 'rgba(20, 184, 166, 0.25)';
        this.ctx.setLineDash([]);
      } else {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.setLineDash([]);
      }
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.stroke();
    }
    this.ctx.setLineDash([]);

    // 2. Draw flying packets.
    this.ctx.fillStyle = accentColor;
    for (const packet of this.packets) {
      const from = byId.get(packet.fromId);
      const to = byId.get(packet.toId);
      if (!from || !to) continue;
      const px = from.x + (to.x - from.x) * packet.progress;
      const py = from.y + (to.y - from.y) * packet.progress;
      this.ctx.beginPath();
      this.ctx.arc(px, py, 4, 0, Math.PI * 2);
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = accentColor;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    // 3. Draw nodes.
    for (const node of this.nodes) {
      let nodeColor = 'rgba(255, 255, 255, 0.1)';
      let textColor = textSecColor;
      let borderGlow = 0;
      if (node.failed) {
        nodeColor = 'rgba(60, 60, 60, 0.4)';
        textColor = 'rgba(150, 150, 150, 0.5)';
      } else if (node.state === 'active') {
        nodeColor = accentColor;
        textColor = '#ffffff';
        borderGlow = 15;
      } else if (node.state === 'infected' || node.messages.has(this.protocol.rumorId)) {
        nodeColor = 'rgba(20, 184, 166, 0.4)';
        textColor = accentColor;
        borderGlow = 8;
      }

      this.ctx.shadowBlur = borderGlow;
      this.ctx.shadowColor = accentColor;
      this.ctx.fillStyle = 'rgba(19, 27, 46, 0.85)';
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle =
        node.failed
          ? 'rgba(150, 150, 150, 0.3)'
          : node.state !== 'idle' || node.messages.has(this.protocol.rumorId)
            ? accentColor
            : 'rgba(255, 255, 255, 0.1)';
      this.ctx.lineWidth = node.state === 'active' ? 3 : 1.5;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;

      this.ctx.fillStyle = textColor;
      this.ctx.font = `600 12px ${fontMono}`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      let label = node.label;
      if (this.dataService.isInfected() && !node.failed && Math.random() < 0.3) {
        label = Math.random().toString(36).substring(2, 2 + node.label.length);
      }
      this.ctx.fillText(label, node.x, node.y);
    }
  }

  /** Called when convergence / ARG state changes — fires achievement + ARG flags. */
  protected checkWinCondition(): void {
    const conv = this.protocol.calculateConvergence(this.nodes);
    if (conv >= 100) {
      if (!this.winAchievementFired) {
        this.winAchievementFired = true;
        this.achievements.unlock('gossip-converged');
      }
      // ARG puzzle: only solved if convergence reached WITH an ARG partition active.
      if (this.simState.gossipArgPartition().length > 0 && !this.argSolvedFired) {
        this.argSolvedFired = true;
        this.simState.gossipArgSolved.set(true);
        this.argCode.set('SIGMA-13');
      }
    } else {
      // Reset firing flags if convergence drops (e.g. after partition / failure).
      this.winAchievementFired = false;
      this.argSolvedFired = false;
    }
  }

  private syncSimState(): void {
    // gossipNodes is a signal<any[]> set at init-time and mutated in place thereafter.
    this.simState.gossipNodes.set(this.nodes);
    this.simState.gossipPackets.set([...this.packets]);
    this.simState.convergencePercent.set(this.protocol.calculateConvergence(this.nodes));
  }

  // ---- user interactions -------------------------------------------------

  protected handleCanvasClick(event: MouseEvent): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // First: did the user click a link (to sever it)?
    const byId = new Map(this.nodes.map((n) => [n.id, n] as const));
    for (const link of this.links) {
      if (link.severed) continue;
      const a = byId.get(link.from);
      const b = byId.get(link.to);
      if (!a || !b) continue;
      if (this.distanceToSegment(clickX, clickY, a.x, a.y, b.x, b.y) < 6) {
        link.severed = true;
        this.simState.gossipArgPartition.update((p) => [...p, `${link.from}-${link.to}`]);
        return;
      }
    }

    // Otherwise: did the user click a node?
    const clicked = this.nodes.find((node) => {
      const dx = node.x - clickX;
      const dy = node.y - clickY;
      return Math.sqrt(dx * dx + dy * dy) < node.radius;
    });

    if (clicked) {
      // Right-click (or shift-click) toggles node failure.
      if (event.shiftKey) {
        this.protocol.handleNodeFailure(clicked, this.nodes);
        this.syncSimState();
        return;
      }
      if (clicked.failed) {
        clicked.failed = false;
        clicked.state = 'idle';
        clicked.infectionTime = 0;
        clicked.messages.clear();
        for (const link of this.links) {
          if (link.from === clicked.id || link.to === clicked.id) {
            link.severed = false;
          }
        }
        this.selectedNode.set(clicked);
        this.syncSimState();
        return;
      }
      // Otherwise: activate + gossip from this node.
      for (const n of this.nodes) {
        if (n.state === 'active') n.state = 'infected';
      }
      clicked.messages.add(this.protocol.rumorId);
      clicked.state = 'active';
      this.selectedNode.set(clicked);
      this.infectNode(clicked);
      const count = this.nodes.filter(
        (n) => !n.failed && n.messages.has(this.protocol.rumorId),
      ).length;
      this.infectionCount.set(count);
      this.syncSimState();
    }
  }

  private distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  }

  protected setMode(mode: GossipMode): void {
    this.simState.gossipMode.set(mode);
  }

  protected injectEpidemic(): void {
    // Ensure the rumor source (bio) is infected on the very first spread
    // so the user can advance the protocol even before clicking a node.
    const bioNode = this.nodes.find((n) => n.id === 'bio');
    if (bioNode && !bioNode.failed && !bioNode.messages.has(this.protocol.rumorId)) {
      bioNode.messages.add(this.protocol.rumorId);
      bioNode.state = bioNode.state === 'idle' ? 'infected' : bioNode.state;
      bioNode.infectionTime = Date.now();
    }
    const mode = this.simState.gossipMode();
    const stats = this.protocol.tick(this.nodes, this.links, mode);
    this.packets.push(...this.collectVisualPackets());
    this.ngZone.run(() => {
      this.messagesSent.update((n) => n + stats.messagesSent);
      this.tickCount.update((n) => n + 1);
      const conv = this.protocol.calculateConvergence(this.nodes);
      this.simState.convergencePercent.set(conv);
      const infected = this.nodes.filter(
        (n) => !n.failed && n.messages.has(this.protocol.rumorId),
      ).length;
      this.infectionCount.set(infected);
      const components = this.protocol.detectPartition(this.nodes, this.links);
      const liveComponents = components.filter((c) => c.length > 0);
      this.partitions.set(liveComponents);
      this.isPartitioned.set(liveComponents.length > 1);
      this.simState.gossipPackets.set([...this.packets]);
      this.checkWinCondition();
    });
  }

  protected runAntiEntropy(): void {
    const packets = this.protocol.runAntiEntropy(this.nodes, 1);
    this.packets.push(...packets);
    this.messagesSent.update((n) => n + packets.length);
    this.syncSimState();
    this.checkWinCondition();
  }

  protected resetSimulation(): void {
    this.winAchievementFired = false;
    this.argSolvedFired = false;
    this.packets = [];
    this.messagesSent.set(0);
    this.tickCount.set(0);
    this.partitions.set([]);
    this.isPartitioned.set(false);
    this.simState.gossipArgSolved.set(false);
    this.simState.convergencePercent.set(0);
    this.argCode.set(null);
    this.setupNodes();
  }
}
