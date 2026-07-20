import { TestBed } from '@angular/core/testing';
import { TerminalComponent, VirtualFileSystem, CommandParser } from './terminal.component';
import { SimulationStateService } from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';
import { DataService } from '../../services/data.service';

describe('VirtualFileSystem', () => {
  let dataService: DataService;
  let achievements: AchievementService;
  let vfs: VirtualFileSystem;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    dataService = TestBed.inject(DataService);
    achievements = TestBed.inject(AchievementService);
    vfs = new VirtualFileSystem(dataService, achievements);
  });

  it('initializes /home/deniz/ with resume.txt containing bio', () => {
    const node = vfs.resolve('/home/deniz/resume.txt');
    expect(node).not.toBeNull();
    expect(node?.type).toBe('file');
    expect(node?.content).toContain('Senior Consultant');
  });

  it('initializes /home/deniz/projects/ with one README per project', () => {
    const dir = vfs.resolve('/home/deniz/projects');
    expect(dir?.type).toBe('dir');
    const readmeFiles = dir?.children?.filter((c) => c.name.endsWith('.md')) ?? [];
    expect(readmeFiles.length).toBe(dataService.projects().length);
  });

  it('initializes contact.vcf with email, linkedin, github urls', () => {
    const node = vfs.resolve('/home/deniz/contact.vcf');
    expect(node?.type).toBe('file');
    const content = node?.content ?? '';
    expect(content).toContain(dataService.email());
    expect(content).toContain(dataService.linkedinUrl());
    expect(content).toContain(dataService.githubUrl());
  });

  it('locks .secrets/ directory until apogee-reached achievement unlocks', () => {
    expect(achievements.isUnlocked('apogee-reached')).toBe(false);
    const result = vfs.read('/home/deniz/.secrets');
    expect(result.ok).toBe(false);
    achievements.unlock('apogee-reached');
    const vfs2 = new VirtualFileSystem(dataService, achievements);
    const dir = vfs2.resolve('/home/deniz/.secrets');
    expect(dir?.type).toBe('dir');
    expect(dir?.children?.some((c) => c.name === 'launch-codes.txt')).toBe(true);
  });

  it('mirrors AchievementService state into achievements.json (read-only)', () => {
    const node = vfs.resolve('/home/deniz/achievements.json');
    expect(node?.type).toBe('file');
    const parsed = JSON.parse(node?.content ?? '{}');
    expect(Array.isArray(parsed.achievements)).toBe(true);
    expect(parsed.achievements.length).toBeGreaterThan(0);
  });

  it('ls lists directory entries', () => {
    const entries = vfs.ls('/home/deniz');
    expect(entries.some((e: string) => e === 'resume.txt')).toBe(true);
    expect(entries.some((e: string) => e === 'projects/')).toBe(true);
    expect(entries.some((e: string) => e === 'contact.vcf')).toBe(true);
  });

  it('cat returns file content', () => {
    const r = vfs.cat('/home/deniz/resume.txt');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output).toContain('Senior Consultant');
    }
  });

  it('cd changes the cwd and tree renders the subtree', () => {
    expect(vfs.cwd()).toBe('/home/deniz');
    vfs.cd('projects');
    expect(vfs.cwd()).toBe('/home/deniz/projects');
    const tree = vfs.tree();
    expect(tree).toContain('.md');
  });

  it('find locates a node by name anywhere under cwd', () => {
    const results = vfs.find('resume.txt');
    expect(results.some((p: string) => p.endsWith('/resume.txt'))).toBe(true);
  });
});

describe('CommandParser', () => {
  it('parses command + positional args + flags', () => {
    const p = CommandParser.parse('route --add 10.0.0.0/8 --gw 192.168.1.1 --port 2');
    expect(p.command).toBe('route');
    expect(p.args).toContain('10.0.0.0/8');
    expect(p.flags['add']).toBe(true);
    expect(p.flags['gw']).toBe('192.168.1.1');
    expect(p.flags['port']).toBe('2');
  });

  it('parses flags with = syntax', () => {
    const p = CommandParser.parse('launch --thrust=95 --fuel=40');
    expect(p.command).toBe('launch');
    expect(p.flags['thrust']).toBe('95');
    expect(p.flags['fuel']).toBe('40');
  });

  it('treats bare tokens as positional args', () => {
    const p = CommandParser.parse('solve SIGMA-13');
    expect(p.command).toBe('solve');
    expect(p.args).toContain('SIGMA-13');
  });
});

describe('TerminalComponent', () => {
  let component: TerminalComponent;
  let simState: SimulationStateService;
  let achievements: AchievementService;
  let dataService: DataService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    component = TestBed.createComponent(TerminalComponent).componentInstance;
    simState = TestBed.inject(SimulationStateService);
    achievements = TestBed.inject(AchievementService);
    dataService = TestBed.inject(DataService);
  });

  const run = (cmd: string) => {
    (component as any).executeCommand(cmd);
    return (component as any).history();
  };

  it('persists command history in SimulationStateService (not a local array)', () => {
    run('help');
    expect(simState.commandHistory().length).toBeGreaterThan(0);
    expect(simState.commandHistory()[0]).toBe('help');
  });

  it('arrow-up recalls the previous command from the persistent history', () => {
    run('about');
    run('skills');
    (component as any).historyIndex = -1;
    (component as any).handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect((component as any).inputValue()).toBe('skills');
  });

  it('launch sets rocketConfig fields and flightState to launching', () => {
    run('launch --thrust 95 --fuel 60 --pitch 88 --stage 3');
    const cfg = simState.rocketConfig();
    expect(cfg.thrust).toBe(95);
    expect(cfg.fuelRatio).toBe(60);
    expect(cfg.pitchAngle).toBe(88);
    expect(cfg.stages).toBe(3);
    expect(simState.rocketState().flightState).toBe('launching');
  });

  it('route --add/--list/--remove mutates SimulationStateService.routingRules', () => {
    run('route --add 10.0.0.0/8 --gw 192.168.1.1 --port 2');
    expect(simState.routingRules().some((r) => r.destination === '10.0.0.0/8')).toBe(true);
    run('route --list');
    run('route --remove 10.0.0.0/8');
    expect(simState.routingRules().some((r) => r.destination === '10.0.0.0/8')).toBe(false);
  });

  it('route --inject sets the dpdk traffic-injection flag', () => {
    run('route --inject --count 5');
    expect(simState.routeInjectRequested()).toBe(true);
  });

  it('gossip --infect sets gossipInfected=true (site-wide scramble)', () => {
    run('gossip --infect');
    expect(simState.gossipInfected()).toBe(true);
  });

  it('gossip --partition NODE adds to gossipArgPartition', () => {
    run('gossip --partition node-7');
    expect(simState.gossipArgPartition()).toContain('node-7');
  });

  it('gossip --mode push sets gossipMode', () => {
    run('gossip --mode push');
    expect(simState.gossipMode()).toBe('push');
  });

  it('radio --channel N sets radioState.activeChannel', () => {
    run('radio --channel 7');
    expect(simState.radioState().activeChannel).toBe(7);
  });

  it('radio --ptt triggers PTT (isPttHeld toggles true)', () => {
    run('radio --ptt');
    expect(simState.radioState().isPttHeld).toBe(true);
  });

  it('tab [name] switches SimulationStateService.activeTab', () => {
    run('tab rocket');
    expect(simState.activeTab()).toBe('rocket');
    run('tab router');
    expect(simState.activeTab()).toBe('router');
  });

  it('achievement --list shows unlocked achievements', () => {
    achievements.unlock('apogee-reached');
    const lines = run('achievement --list');
    const joined = lines.map((l: any) => l.text).join('\n');
    expect(joined).toContain('apogee-reached');
  });

  it('solve SIGMA-13 unlocks arg-solved when gossipArgSolved is true and sets argCompleted', () => {
    simState.gossipArgSolved.set(true);
    run('solve SIGMA-13');
    expect(achievements.isUnlocked('arg-solved')).toBe(true);
    expect(simState.argCompleted()).toBe(true);
  });

  it('solve SIGMA-13 refuses when gossipArgSolved is false', () => {
    simState.gossipArgSolved.set(false);
    run('solve SIGMA-13');
    expect(achievements.isUnlocked('arg-solved')).toBe(false);
    expect(simState.argCompleted()).toBe(false);
  });

  it('launch --code OMEGA-7 sets rocketConfig.specialProfile to "arg"', () => {
    run('launch --code OMEGA-7');
    expect(simState.rocketConfig().specialProfile).toBe('arg');
  });

  it('sudo returns the sudoers joke', () => {
    const lines = run('sudo');
    const joined = lines.map((l: any) => l.text).join('\n');
    expect(joined).toContain('not in the sudoers file');
  });

  it('clear empties the terminal history signal', () => {
    run('help');
    run('clear');
    expect((component as any).history().length).toBe(0);
  });

  it('cat /home/deniz/.secrets/launch-codes.txt is a hidden command that unlocks hidden-command-found', () => {
    achievements.unlock('apogee-reached');
    (component as any).rebuildVfs();
    run('cat /home/deniz/.secrets/launch-codes.txt');
    expect(achievements.isUnlocked('hidden-command-found')).toBe(true);
  });

  it('help expands with new commands as achievements unlock', () => {
    run('clear');
    run('help');
    const before = (component as any).history().map((l: any) => l.text).join('\n');
    expect(before).not.toContain('launch-codes');
    achievements.unlock('apogee-reached');
    run('clear');
    run('help');
    const after = (component as any).history().map((l: any) => l.text).join('\n');
    expect(after).toContain('launch');
  });

  it('context-aware help mentions the active widget', () => {
    simState.activeTab.set('rocket');
    run('clear');
    run('help');
    const joined = (component as any).history().map((l: any) => l.text).join('\n');
    expect(joined.toLowerCase()).toContain('rocket');
  });
});
