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

interface GossipNode {
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
  state: 'idle' | 'infected' | 'active'; // active = clicked/showing details
  infectionTime: number;
}

interface ActivePacket {
  fromNode: GossipNode;
  toNode: GossipNode;
  progress: number; // 0 to 1
  speed: number;
}

@Component({
  selector: 'app-gossip-visualizer',
  imports: [CommonModule],
  templateUrl: './gossip-visualizer.component.html',
  styleUrl: './gossip-visualizer.component.scss',
})
export class GossipVisualizerComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly dataService = inject(DataService);
  private readonly ngZone = inject(NgZone);

  @ViewChild('canvasElement') private canvasRef!: ElementRef<HTMLCanvasElement>;

  protected readonly selectedNode = signal<GossipNode | null>(null);
  protected readonly infectionCount = signal(0);
  protected readonly totalNodesCount = signal(0);

  private nodes: GossipNode[] = [];
  private packets: ActivePacket[] = [];
  private animationFrameId: number | null = null;
  private canvasWidth = 800;
  private canvasHeight = 450;
  private ctx!: CanvasRenderingContext2D;

  ngOnInit() {
    this.setupNodes();
  }

  ngAfterViewInit() {
    this.initCanvas();
  }

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private setupNodes() {
    const rawProjects = this.dataService.projects();
    const skills = this.dataService.skills();

    this.nodes = [
      {
        id: 'bio',
        label: 'Bio',
        category: 'about',
        title: 'Deniz Etkar',
        body: [this.dataService.bio()],
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 45,
        state: 'idle',
        infectionTime: 0,
      },
      {
        id: 'bogazici',
        label: 'Boğaziçi',
        category: 'education',
        title: 'Boğaziçi University',
        body: [
          'B.S. Industrial Engineering (2015 - 2019)',
          'Specialized in operations research, algorithmic optimization, and system simulation.',
        ],
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 40,
        state: 'idle',
        infectionTime: 0,
      },
      {
        id: 'tng',
        label: 'TNG',
        category: 'education',
        title: 'TNG Technology Consulting',
        body: [
          'Consultant & Software Engineer (2021 - Present)',
          'Providing elite software consulting services in Munich, Germany, focusing on complex C++ backends, low-latency architectures, and high-performance network stacks.',
        ],
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 40,
        state: 'idle',
        infectionTime: 0,
      },
      // Projects
      ...rawProjects.map((p) => ({
        id: `p-${p.name}`,
        label: p.name,
        category: 'project' as const,
        title: `Repo: ${p.name}`,
        body: [p.description, `Tech: ${p.tech.join(', ')}`, ...p.details],
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 35,
        state: 'idle' as const,
        infectionTime: 0,
      })),
      // Skills
      ...skills.map((s) => ({
        id: `s-${s.category.toLowerCase().replace(/[^a-z]/g, '')}`,
        label: s.category,
        category: 'skill' as const,
        title: `${s.category} Skills`,
        body: s.skills,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 38,
        state: 'idle' as const,
        infectionTime: 0,
      })),
    ];

    this.totalNodesCount.set(this.nodes.length);

    // Give nodes initial random positions & velocities
    this.nodes.forEach((node) => {
      node.x = Math.random() * (this.canvasWidth - 100) + 50;
      node.y = Math.random() * (this.canvasHeight - 100) + 50;
      node.vx = (Math.random() - 0.5) * 0.6;
      node.vy = (Math.random() - 0.5) * 0.6;
    });

    // Mark Bio as active initially
    const bioNode = this.nodes.find((n) => n.id === 'bio');
    if (bioNode) {
      bioNode.state = 'active';
      bioNode.infectionTime = Date.now();
      this.selectedNode.set(bioNode);
      this.infectionCount.set(1);
    }
  }

  private initCanvas() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Run animation outside of Angular to optimize digest cycles
    this.ngZone.runOutsideAngular(() => {
      const render = () => {
        this.updateSimulation();
        this.drawSimulation();
        this.animationFrameId = requestAnimationFrame(render);
      };
      this.animationFrameId = requestAnimationFrame(render);
    });
  }

  private resizeCanvas() {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      this.canvasWidth = rect.width;
      this.canvasHeight = rect.height || 450;
      canvas.width = this.canvasWidth;
      canvas.height = this.canvasHeight;
    }
  }

  private updateSimulation() {
    // 1. Move nodes and handle boundary collisions
    this.nodes.forEach((node) => {
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

      // Check global infect state
      if (this.dataService.isInfected() && node.state === 'idle') {
        this.infectNode(node);
      }
    });

    // 2. Update flying packets
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const packet = this.packets[i];
      packet.progress += packet.speed;

      if (packet.progress >= 1.0) {
        // Arrived! Infect target if idle
        if (packet.toNode.state === 'idle') {
          this.infectNode(packet.toNode);
        }
        // Remove packet
        this.packets.splice(i, 1);
      }
    }

    // 3. Spontaneous gossip exchange (chance based when nodes bounce close to each other)
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const n1 = this.nodes[i];
        const n2 = this.nodes[j];
        const dx = n1.x - n2.x;
        const dy = n1.y - n2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Max transmission distance
        if (dist < 150) {
          // If one is infected/active and other is idle, small chance to transmit packet
          if (n1.state !== 'idle' && n2.state === 'idle' && Math.random() < 0.002) {
            this.sendPacket(n1, n2);
          } else if (n2.state !== 'idle' && n1.state === 'idle' && Math.random() < 0.002) {
            this.sendPacket(n2, n1);
          }
        }
      }
    }
  }

  private infectNode(node: GossipNode) {
    node.state = 'infected';
    node.infectionTime = Date.now();

    // Update Angular signal inside Zone to trigger UI updating
    this.ngZone.run(() => {
      const count = this.nodes.filter((n) => n.state !== 'idle').length;
      this.infectionCount.set(count);
    });

    // Gossip immediately to neighbors
    this.gossipFrom(node);
  }

  private gossipFrom(sourceNode: GossipNode) {
    this.nodes.forEach((targetNode) => {
      if (sourceNode.id === targetNode.id) return;

      const dx = sourceNode.x - targetNode.x;
      const dy = sourceNode.y - targetNode.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Gossip range
      if (dist < 180) {
        this.sendPacket(sourceNode, targetNode);
      }
    });
  }

  private sendPacket(fromNode: GossipNode, toNode: GossipNode) {
    // Avoid duplicate packets
    const exists = this.packets.some(
      (p) => p.fromNode.id === fromNode.id && p.toNode.id === toNode.id,
    );
    if (!exists) {
      this.packets.push({
        fromNode,
        toNode,
        progress: 0,
        speed: 0.015 + Math.random() * 0.01,
      });
    }
  }

  private drawSimulation() {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    const accentColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim();
    const textSecColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-secondary')
      .trim();

    // 1. Draw Connection Lines
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.lineWidth = 1;
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const n1 = this.nodes[i];
        const n2 = this.nodes[j];
        const dx = n1.x - n2.x;
        const dy = n1.y - n2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 150) {
          // Highlight connection if both nodes are infected/active
          if (n1.state !== 'idle' && n2.state !== 'idle') {
            this.ctx.strokeStyle = `rgba(20, 184, 166, 0.15)`; // Teal-ish fade
          } else {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          }
          this.ctx.beginPath();
          this.ctx.moveTo(n1.x, n1.y);
          this.ctx.lineTo(n2.x, n2.y);
          this.ctx.stroke();
        }
      }
    }

    // 2. Draw flying packets
    this.ctx.fillStyle = accentColor || '#14b8a6';
    this.packets.forEach((packet) => {
      const px = packet.fromNode.x + (packet.toNode.x - packet.fromNode.x) * packet.progress;
      const py = packet.fromNode.y + (packet.toNode.y - packet.fromNode.y) * packet.progress;

      this.ctx.beginPath();
      this.ctx.arc(px, py, 4, 0, Math.PI * 2);
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = accentColor || '#14b8a6';
      this.ctx.fill();
      this.ctx.shadowBlur = 0; // Reset shadow
    });

    // 3. Draw Nodes
    this.nodes.forEach((node) => {
      // Glow and colors based on state
      let nodeColor = 'rgba(255, 255, 255, 0.1)';
      let textColor = textSecColor || '#94a3b8';
      let borderGlow = 0;

      if (node.state === 'active') {
        nodeColor = accentColor || '#14b8a6';
        textColor = '#ffffff';
        borderGlow = 15;
      } else if (node.state === 'infected') {
        nodeColor = 'rgba(20, 184, 166, 0.4)';
        textColor = accentColor || '#14b8a6';
        borderGlow = 8;
      }

      this.ctx.shadowBlur = borderGlow;
      this.ctx.shadowColor = accentColor || '#14b8a6';

      // Circle base
      this.ctx.fillStyle = 'rgba(19, 27, 46, 0.85)';
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Border outline
      this.ctx.strokeStyle =
        node.state !== 'idle' ? accentColor || '#14b8a6' : 'rgba(255, 255, 255, 0.1)';
      this.ctx.lineWidth = node.state === 'active' ? 3 : 1.5;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0; // Reset

      // Text labels
      this.ctx.fillStyle = textColor;
      this.ctx.font = `600 12px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono')}`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      // Text scrambling logic if website is in infected state
      let label = node.label;
      if (this.dataService.isInfected() && Math.random() < 0.3) {
        label = Math.random()
          .toString(36)
          .substring(2, 2 + node.label.length);
      }

      this.ctx.fillText(label, node.x, node.y);
    });
  }

  protected handleCanvasClick(event: MouseEvent) {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Find if a node was clicked
    const clicked = this.nodes.find((node) => {
      const dx = node.x - clickX;
      const dy = node.y - clickY;
      return Math.sqrt(dx * dx + dy * dy) < node.radius;
    });

    if (clicked) {
      // Un-activate previous active node
      this.nodes.forEach((n) => {
        if (n.state === 'active') n.state = 'infected';
      });

      clicked.state = 'active';
      this.selectedNode.set(clicked);

      // Trigger gossip packet propagation
      this.gossipFrom(clicked);

      // Update count
      const count = this.nodes.filter((n) => n.state !== 'idle').length;
      this.infectionCount.set(count);
    }
  }

  protected injectEpidemic() {
    // Infect a random idle node
    const idles = this.nodes.filter((n) => n.state === 'idle');
    if (idles.length > 0) {
      const randNode = idles[Math.floor(Math.random() * idles.length)];
      this.infectNode(randNode);
    } else {
      // Re-trigger from bio
      const bio = this.nodes.find((n) => n.id === 'bio');
      if (bio) this.gossipFrom(bio);
    }
  }

  protected resetSimulation() {
    this.setupNodes();
  }
}
