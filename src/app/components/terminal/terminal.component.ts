import { Component, ElementRef, ViewChild, inject, signal, computed, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { ThemeService, AppTheme } from '../../services/theme.service';
import { SimulationStateService } from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';

interface TerminalLine {
  text: string;
  type: 'input' | 'output' | 'error' | 'success' | 'system';
  isHtml?: boolean;
}

type VfsNodeType = 'dir' | 'file';

interface VfsNode {
  name: string;
  type: VfsNodeType;
  content?: string;
  children?: VfsNode[];
}

interface ParseResult {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

const PROMPT = 'deniz@portfolio:~$ ';
const HOME = '/home/deniz';

const VALUE_FLAGS = new Set([
  'gw', 'port', 'thrust', 'fuel', 'pitch', 'stage', 'code', 'count',
  'tune', 'channel', 'mode', 'partition', 'fail',
]);

export class CommandParser {
  static parse(input: string): ParseResult {
    const tokens = input.trim().split(/\s+/).filter((t) => t.length > 0);
    const command = tokens.shift()?.toLowerCase() ?? '';
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.startsWith('--')) {
        const body = token.slice(2);
        const eq = body.indexOf('=');
        if (eq !== -1) {
          flags[body.slice(0, eq)] = body.slice(eq + 1);
        } else if (VALUE_FLAGS.has(body)) {
          const next = tokens[i + 1];
          if (next !== undefined && !next.startsWith('--')) {
            flags[body] = next;
            i++;
          } else {
            flags[body] = true;
          }
        } else {
          flags[body] = true;
        }
      } else {
        args.push(token);
      }
    }
    return { command, args, flags };
  }
}

export class VirtualFileSystem {
  private root: VfsNode;
  private cwdPath = HOME;
  private readonly achievements: AchievementService;

  constructor(private readonly dataService: DataService, achievements: AchievementService) {
    this.achievements = achievements;
    this.root = this.buildTree();
  }

  private buildTree(): VfsNode {
    const projects: VfsNode[] = this.dataService.projects().map((p) => ({
      name: `${p.name}.md`,
      type: 'file' as VfsNodeType,
      content: `# ${p.name}\n\n${p.description}\n\nURL: ${p.url}\nTech: ${p.tech.join(', ')}\n\n${p.details.map((d) => `- ${d}`).join('\n')}`,
    }));
    const projectsDir: VfsNode = { name: 'projects', type: 'dir', children: projects };
    const contact = [
      'BEGIN:VCARD', 'VERSION:3.0',
      `FN:${this.dataService.name()}`,
      `EMAIL:${this.dataService.email()}`,
      `URL:${this.dataService.linkedinUrl()}`,
      `URL:${this.dataService.githubUrl()}`,
      'END:VCARD',
    ].join('\n');
    const secretsChildren: VfsNode[] = [
      { name: 'launch-codes.txt', type: 'file', content: 'OMEGA-7 // SIGMA-13\nUse "launch --code OMEGA-7" then "solve SIGMA-13" to resolve the ARG.' },
    ];
    const homeChildren: VfsNode[] = [
      { name: 'resume.txt', type: 'file', content: this.dataService.bio() },
      projectsDir,
      { name: 'contact.vcf', type: 'file', content: contact },
      { name: 'achievements.json', type: 'file', content: this.mirrorAchievements() },
    ];
    if (this.achievements.isUnlocked('apogee-reached')) {
      homeChildren.push({ name: '.secrets', type: 'dir', children: secretsChildren });
    }
    return {
      name: '', type: 'dir',
      children: [
        { name: 'home', type: 'dir', children: [
          { name: 'deniz', type: 'dir', children: homeChildren },
        ]},
      ],
    };
  }

  private mirrorAchievements(): string {
    return JSON.stringify({ achievements: this.achievements.achievements() }, null, 2);
  }

  rebuild(): void { this.root = this.buildTree(); }
  cwd(): string { return this.cwdPath; }

  resolve(path: string): VfsNode | null {
    const absolute = this.normalize(path);
    const parts = absolute.split('/').filter((p) => p.length > 0);
    let current: VfsNode = this.root;
    for (const part of parts) {
      if (current.type !== 'dir' || !current.children) return null;
      const next = current.children.find((c) => c.name === part);
      if (!next) return null;
      current = next;
    }
    return current;
  }

  private normalize(path: string): string {
    if (!path.startsWith('/')) path = `${this.cwdPath}/${path}`;
    const parts: string[] = [];
    for (const p of path.split('/')) {
      if (p === '' || p === '.') continue;
      if (p === '..') parts.pop();
      else parts.push(p);
    }
    return `/${parts.join('/')}`;
  }

  ls(path?: string): string[] {
    const target = this.resolve(path ?? this.cwdPath);
    if (!target || target.type !== 'dir' || !target.children) return [];
    return target.children.map((c) => (c.type === 'dir' ? `${c.name}/` : c.name));
  }

  cd(path: string): { ok: boolean; error?: string } {
    const target = this.resolve(path);
    if (!target) return { ok: false, error: `cd: no such directory: ${path}` };
    if (target.type !== 'dir') return { ok: false, error: `cd: not a directory: ${path}` };
    this.cwdPath = this.normalize(path);
    return { ok: true };
  }

  cat(path: string): { ok: boolean; output?: string; error?: string } {
    const target = this.resolve(path);
    if (!target) return { ok: false, error: `cat: ${path}: no such file` };
    if (target.type === 'dir') return { ok: false, error: `cat: ${path}: is a directory` };
    return { ok: true, output: target.content ?? '' };
  }

  read(path: string): { ok: boolean; error?: string } {
    const target = this.resolve(path);
    if (!target) return { ok: false, error: `no such file or directory: ${path}` };
    const normalized = this.normalize(path);
    if (normalized.includes('/.secrets') && !this.achievements.isUnlocked('apogee-reached')) {
      return { ok: false, error: 'permission denied: .secrets is locked' };
    }
    return { ok: true };
  }

  tree(path?: string): string {
    const root = this.resolve(path ?? this.cwdPath);
    if (!root) return '';
    const lines: string[] = [];
    this.renderTree(root, '', lines);
    return lines.join('\n');
  }

  private renderTree(node: VfsNode, prefix: string, out: string[]): void {
    out.push(`${prefix}${node.name}${node.type === 'dir' ? '/' : ''}`);
    if (node.type === 'dir' && node.children) {
      node.children.forEach((child, idx) => {
        const isLast = idx === node.children!.length - 1;
        this.renderTree(child, `${prefix}${isLast ? '    ' : '|   '}`, out);
      });
    }
  }

  find(name: string): string[] {
    const results: string[] = [];
    const start = this.resolve(this.cwdPath);
    if (!start) return results;
    this.walkFind(start, this.cwdPath, name, results);
    return results;
  }

  private walkFind(node: VfsNode, currentPath: string, name: string, results: string[]): void {
    if (node.name.includes(name)) {
      const fullPath = node.name === '' ? currentPath : `${currentPath}/${node.name}`;
      results.push(fullPath);
    }
    if (node.type === 'dir' && node.children) {
      const childPath = node.name === '' ? currentPath : `${currentPath}/${node.name}`;
      for (const child of node.children) {
        this.walkFind(child, childPath, name, results);
      }
    }
  }
}

@Component({
  selector: 'app-terminal',
  imports: [CommonModule, FormsModule],
  templateUrl: './terminal.component.html',
  styleUrl: './terminal.component.scss',
})
export class TerminalComponent implements AfterViewChecked {
  private readonly dataService = inject(DataService);
  private readonly themeService = inject(ThemeService);
  private readonly simState = inject(SimulationStateService);
  private readonly achievements = inject(AchievementService);
  private vfs = new VirtualFileSystem(this.dataService, this.achievements);

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('cmdInput') private cmdInput!: ElementRef;

  protected readonly inputValue = signal('');

  protected readonly unlockedAchievementCount = computed<number>(() =>
    this.achievements.achievements().filter((a) => a.unlocked).length,
  );

  protected readonly totalAchievementCount = computed<number>(() =>
    this.achievements.achievements().length,
  );

  protected readonly history = signal<TerminalLine[]>([
    { text: 'Welcome to Deniz\'s Interactive CLI (v2.0.0).', type: 'system' },
    { text: 'Type "help" for a list of available commands.', type: 'system' },
    { text: '', type: 'output' },
  ]);
  protected historyIndex = -1;

  ngAfterViewChecked() { this.scrollToBottom(); }
  protected focusInput() { this.cmdInput.nativeElement.focus(); }
  rebuildVfs(): void { this.vfs.rebuild(); }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch {
      // View not yet ready (e.g. in tests without a host element).
    }
  }

  protected handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const cmd = this.inputValue().trim();
      if (cmd) this.executeCommand(cmd);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const hist = this.simState.commandHistory();
      if (hist.length > 0) {
        if (this.historyIndex === -1) this.historyIndex = hist.length - 1;
        else if (this.historyIndex > 0) this.historyIndex--;
        this.inputValue.set(hist[this.historyIndex]);
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      const hist = this.simState.commandHistory();
      if (hist.length > 0) {
        if (this.historyIndex !== -1 && this.historyIndex < hist.length - 1) {
          this.historyIndex++;
          this.inputValue.set(hist[this.historyIndex]);
        } else {
          this.historyIndex = -1;
          this.inputValue.set('');
        }
      }
    } else if (event.key === 'Tab') {
      event.preventDefault();
      this.autocompleteCommand();
    }
  }

  private autocompleteCommand() {
    const input = this.inputValue().toLowerCase();
    const commands = this.knownCommands();
    const matches = commands.filter((c) => c.startsWith(input));
    if (matches.length === 1) {
      this.inputValue.set(matches[0]);
    } else if (matches.length > 1) {
      this.history.update((h) => [
        ...h,
        { text: `${PROMPT}${this.inputValue()}`, type: 'input' },
        { text: matches.join('   '), type: 'system' },
      ]);
    }
  }

  private knownCommands(): string[] {
    return [
      'help', 'about', 'skills', 'projects', 'contact', 'theme', 'clear', 'reboot', 'sudo',
      'launch', 'route', 'gossip', 'radio', 'tab', 'achievement', 'solve',
      'ls', 'cd', 'cat', 'tree', 'find',
    ];
  }

  private print(lines: TerminalLine[]): void { this.history.update((h) => [...h, ...lines]); }
  private printLine(text: string, type: TerminalLine['type'] = 'output'): void { this.print([{ text, type }]); }

  protected executeCommand(cmdStr: string) {
    this.history.update((h) => [...h, { text: `${PROMPT}${cmdStr}`, type: 'input' }]);
    this.simState.commandHistory.update((h) => [...h, cmdStr]);
    this.historyIndex = -1;
    this.inputValue.set('');
    const parsed = CommandParser.parse(cmdStr);
    this.dispatch(parsed);
  }

  private dispatch(p: ParseResult): void {
    switch (p.command) {
      case 'help': this.cmdHelp(); break;
      case 'about': this.cmdAbout(); break;
      case 'skills': this.cmdSkills(); break;
      case 'projects': this.cmdProjects(p.args[0]); break;
      case 'contact': this.cmdContact(); break;
      case 'theme': this.cmdTheme(p.args[0]); break;
      case 'clear': this.history.set([]); break;
      case 'reboot': this.cmdReboot(); break;
      case 'sudo': this.printLine('deniz is not in the sudoers file. This incident will be reported.', 'error'); break;
      case 'ls': this.cmdLs(p.args[0]); break;
      case 'cd': this.cmdCd(p.args[0]); break;
      case 'cat': this.cmdCat(p.args[0]); break;
      case 'tree': this.cmdTree(p.args[0]); break;
      case 'find': this.cmdFind(p.args[0]); break;
      case 'launch': this.cmdLaunch(p.flags, p.args); break;
      case 'route': this.cmdRoute(p.flags, p.args); break;
      case 'gossip': this.cmdGossip(p.flags, p.args); break;
      case 'radio': this.cmdRadio(p.flags); break;
      case 'tab': this.cmdTab(p.args[0]); break;
      case 'achievement': this.cmdAchievement(); break;
      case 'solve': this.cmdSolve(p.args[0]); break;
      default: this.printLine(`Command not found: ${p.command}. Type "help" for a list of commands.`, 'error');
    }
  }

  private cmdHelp(): void {
    const active = this.simState.activeTab();
    const lines: TerminalLine[] = [
      { text: `Available commands (active widget: ${active}):`, type: 'success' },
      { text: '  help                - Show this help', type: 'output' },
      { text: '  about               - Bio and role summary', type: 'output' },
      { text: '  skills              - Technical skill matrix', type: 'output' },
      { text: '  projects [name]     - List repositories or show one', type: 'output' },
      { text: '  contact             - Email, LinkedIn, GitHub', type: 'output' },
      { text: '  theme [type]        - Switch theme (dark, cyberpunk, terminal)', type: 'output' },
      { text: '  launch [--thrust N] [--fuel N] [--pitch N] [--stage N]', type: 'output' },
      { text: '  route --add CIDR --gw IP --port N | --remove CIDR | --list | --inject', type: 'output' },
      { text: '  gossip --infect | --partition NODE | --fail NODE | --mode push|pull|push-pull', type: 'output' },
      { text: '  radio --tune FREQ | --channel N | --ptt', type: 'output' },
      { text: '  tab [gossip|rocket|router|radio|portfolio]', type: 'output' },
      { text: '  achievement --list  - List unlocked achievements', type: 'output' },
      { text: '  solve SIGMA-13      - Resolve the ARG (requires gossip preconditions)', type: 'output' },
      { text: '  ls / cd / cat / tree / find  - Virtual file system', type: 'output' },
      { text: '  clear | reboot | sudo', type: 'output' },
    ];
    if (this.achievements.isUnlocked('apogee-reached')) {
      lines.push({ text: 'Hidden: explore /home/deniz/.secrets/ for launch-codes.', type: 'system' });
    }
    this.print(lines);
  }

  private cmdAbout(): void {
    this.print([
      { text: 'Profile: Deniz Etkar', type: 'success' },
      { text: `Title: ${this.dataService.title()} at ${this.dataService.company()}`, type: 'output' },
      { text: `Location: ${this.dataService.location()}`, type: 'output' },
      { text: this.dataService.bio(), type: 'output' },
    ]);
  }

  private cmdSkills(): void {
    const lines: TerminalLine[] = [{ text: 'Technical Expertise Matrix:', type: 'success' }];
    for (const group of this.dataService.skills()) {
      lines.push({ text: `[${group.category}]`, type: 'system' });
      lines.push({ text: `  ${group.skills.join(', ')}`, type: 'output' });
    }
    this.print(lines);
  }

  private cmdProjects(projName?: string): void {
    const projects = this.dataService.projects();
    if (!projName) {
      const lines: TerminalLine[] = [{ text: 'Active Repositories:', type: 'success' }];
      for (const p of projects) lines.push({ text: `• ${p.name} - ${p.description}`, type: 'output' });
      lines.push({ text: 'Type "projects [name]" for architectural details.', type: 'system' });
      this.print(lines);
      return;
    }
    const matched = projects.find((p) => p.name.toLowerCase() === projName.toLowerCase());
    if (!matched) { this.printLine(`Project "${projName}" not found. Type "projects" for a list.`, 'error'); return; }
    this.print([
      { text: `Project: ${matched.name}`, type: 'success' },
      { text: `URL: ${matched.url}`, type: 'system' },
      { text: `Tech Stack: ${matched.tech.join(', ')}`, type: 'output' },
      { text: 'Implementation Details:', type: 'system' },
      ...matched.details.map((d) => ({ text: `  - ${d}`, type: 'output' as const })),
    ]);
  }

  private cmdContact(): void {
    this.print([
      { text: 'Get in Touch:', type: 'success' },
      { text: `  Email:    ${this.dataService.email()}`, type: 'output' },
      { text: `  GitHub:   ${this.dataService.githubUrl()}`, type: 'output' },
      { text: `  LinkedIn: ${this.dataService.linkedinUrl()}`, type: 'output' },
    ]);
  }

  private cmdTheme(themeArg?: string): void {
    if (!themeArg) { this.printLine('Please specify a theme: theme dark | cyberpunk | terminal', 'error'); return; }
    const t = themeArg.toLowerCase() as AppTheme;
    if (t === 'dark' || t === 'cyberpunk' || t === 'terminal') {
      this.themeService.setTheme(t);
      this.printLine(`Theme updated to "${t}".`, 'success');
    } else {
      this.printLine(`Unknown theme: ${themeArg}. Try: dark, cyberpunk, terminal`, 'error');
    }
  }

  private cmdLs(path?: string): void {
    const entries = this.vfs.ls(path);
    if (entries.length === 0) { this.printLine('ls: no such directory', 'error'); return; }
    this.printLine(entries.join('   '));
  }

  private cmdCd(path?: string): void {
    if (!path) {
      const r = this.vfs.cd(HOME);
      if (!r.ok) this.printLine(r.error!, 'error');
      return;
    }
    const r = this.vfs.cd(path);
    if (!r.ok) this.printLine(r.error!, 'error');
  }

  private cmdCat(path?: string): void {
    if (!path) { this.printLine('cat: missing file operand', 'error'); return; }
    const guard = this.vfs.read(path);
    if (!guard.ok) { this.printLine(guard.error!, 'error'); return; }
    const r = this.vfs.cat(path);
    if (!r.ok) { this.printLine(r.error!, 'error'); return; }
    this.printLine(r.output ?? '');
    if (path.includes('.secrets')) {
      this.achievements.unlock('hidden-command-found');
      this.printLine('[hidden command discovered — achievement unlocked]', 'system');
      this.vfs.rebuild();
    }
  }

  private cmdTree(path?: string): void {
    const out = this.vfs.tree(path);
    if (!out) { this.printLine('tree: no such directory', 'error'); return; }
    this.printLine(out);
  }

  private cmdFind(name?: string): void {
    if (!name) { this.printLine('find: missing pattern', 'error'); return; }
    const results = this.vfs.find(name);
    if (results.length === 0) { this.printLine('find: no matches', 'system'); return; }
    this.printLine(results.join('\n'));
  }

  private cmdLaunch(flags: Record<string, string | boolean>, args: string[]): void {
    const cfg = { ...this.simState.rocketConfig() };
    if (flags['thrust'] !== undefined) cfg.thrust = Number(flags['thrust']);
    if (flags['fuel'] !== undefined) cfg.fuelRatio = Number(flags['fuel']);
    if (flags['pitch'] !== undefined) cfg.pitchAngle = Number(flags['pitch']);
    if (flags['stage'] !== undefined) cfg.stages = Number(flags['stage']);
    const code = args.find((a) => a === 'OMEGA-7') ?? (typeof flags['code'] === 'string' ? flags['code'] : undefined);
    if (code === 'OMEGA-7') {
      cfg.specialProfile = 'arg';
      this.printLine('Special ARG profile engaged: OMEGA-7.', 'system');
    }
    this.simState.rocketConfig.set(cfg);
    this.simState.rocketState.update((s) => ({ ...s, flightState: 'launching' }));
    this.printLine(`Launch sequence initiated (thrust=${cfg.thrust}, fuel=${cfg.fuelRatio}, pitch=${cfg.pitchAngle}, stages=${cfg.stages}).`, 'success');
  }

  private cmdRoute(flags: Record<string, string | boolean>, args: string[]): void {
    if (flags['add']) {
      const cidr = args[0];
      const gw = typeof flags['gw'] === 'string' ? flags['gw'] : '';
      const port = typeof flags['port'] === 'string' ? flags['port'] : '';
      if (!cidr || !gw || !port) { this.printLine('route --add requires CIDR --gw IP --port N', 'error'); return; }
      this.simState.routingRules.update((rules) => [
        ...rules.filter((r) => r.destination !== cidr),
        { destination: cidr, nextHop: gw, interface: port },
      ]);
      this.printLine(`Route added: ${cidr} → ${gw} via ${port}.`, 'success');
      return;
    }
    if (flags['remove']) {
      const cidr = args[0];
      if (!cidr) { this.printLine('route --remove requires a CIDR', 'error'); return; }
      this.simState.routingRules.update((rules) => rules.filter((r) => r.destination !== cidr));
      this.printLine(`Route removed: ${cidr}.`, 'system');
      return;
    }
    if (flags['list']) {
      const rules = this.simState.routingRules();
      if (rules.length === 0) { this.printLine('No routes configured.', 'system'); return; }
      const lines: TerminalLine[] = [{ text: 'Routing table:', type: 'success' }];
      for (const r of rules) lines.push({ text: `  ${r.destination} → ${r.nextHop} via ${r.interface}`, type: 'output' });
      this.print(lines);
      return;
    }
    if (flags['inject']) {
      const count = typeof flags['count'] === 'string' ? Number(flags['count']) : 1;
      this.simState.routeInjectRequested.set(true);
      this.printLine(`Injected ${count} test packet(s) into the router queue.`, 'success');
      return;
    }
    this.printLine('route: unknown subcommand. Try --add | --remove | --list | --inject', 'error');
  }

  private cmdGossip(flags: Record<string, string | boolean>, args: string[]): void {
    if (flags['infect']) {
      this.simState.gossipInfected.set(true);
      this.printLine('ALERT: gossip epidemic injected. Site-wide scramble initiated.', 'error');
      return;
    }
    if (flags['partition']) {
      const raw = typeof flags['partition'] === 'string' ? flags['partition'] : (args[0] ?? '');
      if (!raw) { this.printLine('gossip --partition requires a node id', 'error'); return; }
      const cuts = raw.split(',').map((c) => c.trim()).filter((c) => c.length > 0);
      this.simState.gossipArgPartition.update((p) => [...p, ...cuts]);
      this.printLine(`Partitioned ${cuts.length} link(s) from the gossip cluster.`, 'system');
      return;
    }
    if (flags['fail']) {
      const node = typeof flags['fail'] === 'string' ? flags['fail'] : (args[0] ?? '');
      if (!node) { this.printLine('gossip --fail requires a node id', 'error'); return; }
      this.simState.gossipNodes.update((nodes) =>
        nodes.map((n) => (n.id === node || n.name === node ? { ...n, failed: true } : n)),
      );
      this.printLine(`Marked gossip node "${node}" as failed.`, 'system');
      return;
    }
    if (flags['mode']) {
      const mode = typeof flags['mode'] === 'string' ? flags['mode'] : '';
      if (mode !== 'push' && mode !== 'pull' && mode !== 'push-pull') {
        this.printLine('gossip --mode requires push | pull | push-pull', 'error'); return;
      }
      this.simState.gossipMode.set(mode);
      this.printLine(`Gossip mode set to "${mode}".`, 'success');
      return;
    }
    this.printLine('gossip: unknown subcommand. Try --infect | --partition | --fail | --mode', 'error');
  }

  private cmdRadio(flags: Record<string, string | boolean>): void {
    if (flags['tune'] !== undefined) {
      const freq = typeof flags['tune'] === 'string' ? flags['tune'] : '';
      const channel = this.frequencyToChannel(freq);
      this.simState.radioState.update((r) => ({ ...r, activeChannel: channel }));
      this.printLine(`Tuned to ${freq} MHz (channel ${channel}).`, 'success');
      return;
    }
    if (flags['channel'] !== undefined) {
      const ch = Number(flags['channel']);
      this.simState.radioState.update((r) => ({ ...r, activeChannel: ch }));
      this.printLine(`Radio channel set to ${ch}.`, 'success');
      return;
    }
    if (flags['ptt']) {
      this.simState.radioState.update((r) => ({ ...r, isPttHeld: true }));
      this.printLine('PTT held.', 'system');
      return;
    }
    this.printLine('radio: unknown subcommand. Try --tune | --channel | --ptt', 'error');
  }

  private frequencyToChannel(freq: string): number {
    const n = Number(freq);
    if (Number.isNaN(n)) return 1;
    return Math.max(1, Math.min(22, Math.round(n)));
  }

  private cmdTab(name?: string): void {
    const valid = ['gossip', 'rocket', 'router', 'radio', 'portfolio'];
    if (!name || !valid.includes(name)) {
      this.printLine(`tab: unknown widget. Valid: ${valid.join(', ')}`, 'error'); return;
    }
    this.simState.activeTab.set(name);
    this.printLine(`Switched to "${name}" widget.`, 'success');
  }

  private cmdAchievement(): void {
    const unlocked = this.achievements.getUnlocked();
    if (unlocked.length === 0) { this.printLine('No achievements unlocked yet.', 'system'); return; }
    const lines: TerminalLine[] = [{ text: 'Unlocked achievements:', type: 'success' }];
    for (const a of unlocked) lines.push({ text: `  ${a.id} — ${a.title}`, type: 'output' });
    this.print(lines);
  }

  private cmdSolve(token?: string): void {
    if (token !== 'SIGMA-13') { this.printLine('solve: unknown token. Hint: try SIGMA-13.', 'error'); return; }
    if (!this.simState.gossipArgSolved()) {
      this.print([
        { text: 'solve: preconditions not met. The ARG chain is incomplete.', type: 'error' },
        { text: '', type: 'output' },
        { text: 'The full chain requires:', type: 'system' },
        { text: '  1. launch --code OMEGA-7   (sets ARG flight profile)', type: 'output' },
        { text: '  2. gossip --partition A-B,B-C,C-D  (severs the ARG partition)', type: 'output' },
        { text: '  3. Achieve gossip convergence with the partition active', type: 'output' },
        { text: '  4. solve SIGMA-13          (this command)', type: 'output' },
        { text: '', type: 'output' },
        { text: 'Hint: read /home/deniz/.secrets/launch-codes.txt for details.', type: 'system' },
      ]);
      return;
    }
    this.achievements.unlock('arg-solved');
    this.simState.argCompleted.set(true);
    this.print([
      { text: '  ___ ___ ___ _  _ ___ _    _   _    ___ ___', type: 'success' },
      { text: ' | _ \\ __/ __| || | __| |  | | | |  | __| _ \\', type: 'success' },
      { text: ' |  _/ _|\\__ \\ __ | _|| |__| |_| |__| _||   /', type: 'success' },
      { text: ' |_| |___|___/_||_|___|____|\\___/____|___|_|', type: 'success' },
      { text: '', type: 'output' },
      { text: '*** MISSION COMPLETE — ARG CHAIN RESOLVED ***', type: 'success' },
      { text: 'OMEGA-7 launched. Partition [A-B,B-C,C-D] healed. SIGMA-13 accepted.', type: 'system' },
    ]);
  }

  private cmdReboot(): void {
    this.simState.isSystemCrashed.set(false);
    this.simState.gossipInfected.set(false);
    this.simState.rocketState.update((s) => ({
      ...s, flightState: 'prelaunch', altitude: 0, velocity: 0, fuelRemaining: 100, trajectoryPoints: [],
    }));
    this.simState.routingRules.set([]);
    this.simState.commandHistory.set([]);
    this.history.set([
      { text: 'Hardware reset signal sent.', type: 'system' },
      { text: 'Loading kernel modules...', type: 'system' },
      { text: 'Simulation state reinitialized.', type: 'success' },
      { text: 'Type "help" for interactive console commands.', type: 'system' },
    ]);
    this.vfs.rebuild();
  }
}
