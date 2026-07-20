import { TestBed } from '@angular/core/testing';
import type { WritableSignal } from '@angular/core';
import { TerminalComponent, VirtualFileSystem, CommandParser } from './terminal.component';
import { SimulationStateService } from '../../services/simulation-state.service';
import { AchievementService } from '../../services/achievement.service';
import { DataService } from '../../services/data.service';

interface TerminalLine {
  text: string;
  type: 'input' | 'output' | 'error' | 'success' | 'system';
  isHtml?: boolean;
  prompt?: string;
  command?: string;
}

/**
 * Test-only mirror of TerminalComponent's protected/private members
 * (each member re-declared with the same type as on the component).
 * `as unknown as TerminalHandle` re-exposes them to the spec without weakening
 * their types — every member must exist on TerminalComponent itself.
 */
type TerminalHandle = {
  historyIndex: number;
  history: WritableSignal<TerminalLine[]>;
  inputValue: WritableSignal<string>;
  executeCommand(cmdStr: string): void;
  handleKeyDown(event: KeyboardEvent): void;
};

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
    expect(vfs.read('/home/deniz/.secrets').ok).toBe(false);
    expect(vfs.ls('/home/deniz/.secrets').length).toBe(0);
    expect(vfs.lsNodes('/home/deniz/.secrets').length).toBe(0);
    achievements.unlock('apogee-reached');
    const vfs2 = new VirtualFileSystem(dataService, achievements);
    const dir = vfs2.resolve('/home/deniz/.secrets');
    expect(dir?.type).toBe('dir');
    expect(dir?.children?.some((c) => c.name === 'launch-codes.txt')).toBe(true);
    expect(vfs2.read('/home/deniz/.secrets').ok).toBe(true);
  });

  it('always exposes .secrets in the tree even before achievement unlock', () => {
    expect(achievements.isUnlocked('apogee-reached')).toBe(false);
    const dir = vfs.resolve('/home/deniz/.secrets');
    expect(dir).not.toBeNull();
    expect(dir?.type).toBe('dir');
  });

  it('expands VFS with /etc/hostname, /etc/os-release, /var/log/syslog, /tmp, /usr/bin', () => {
    expect(vfs.resolve('/etc/hostname')?.content).toBe('portfolio');
    expect(vfs.resolve('/etc/os-release')?.content).toContain('DenizOS');
    expect(vfs.resolve('/etc/profile.d')?.type).toBe('dir');
    expect(vfs.resolve('/var/log/syslog')?.content).toContain('gossipd');
    expect(vfs.resolve('/var/log/auth.log')?.content).toContain('sshd');
    expect(vfs.resolve('/tmp')?.type).toBe('dir');
    expect(vfs.resolve('/usr/bin/ls')?.type).toBe('file');
  });

  it('seeds .bashrc and .bash_history in $HOME', () => {
    expect(vfs.resolve('/home/deniz/.bashrc')?.content).toContain('PS1');
    expect(vfs.resolve('/home/deniz/.bash_history')?.content).toContain('ls');
    expect(vfs.resolve('/home/deniz/.config')?.type).toBe('dir');
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
    const h = component as unknown as TerminalHandle;
    h.executeCommand(cmd);
    return h.history();
  };

  it('persists command history in SimulationStateService (not a local array)', () => {
    run('help');
    expect(simState.commandHistory().length).toBeGreaterThan(0);
    expect(simState.commandHistory()[0]).toBe('help');
  });

  it('arrow-up recalls the previous command from the persistent history', () => {
    run('about');
    run('skills');
    const h = component as unknown as TerminalHandle;
    h.historyIndex = -1;
    h.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(h.inputValue()).toBe('skills');
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
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
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
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('not in the sudoers file');
  });

  it('clear empties the terminal history signal', () => {
    run('help');
    run('clear');
    expect((component as unknown as TerminalHandle).history().length).toBe(0);
  });

  it('cat /home/deniz/.secrets/launch-codes.txt is a hidden command that unlocks hidden-command-found', () => {
    achievements.unlock('apogee-reached');
    component.rebuildVfs();
    run('cat /home/deniz/.secrets/launch-codes.txt');
    expect(achievements.isUnlocked('hidden-command-found')).toBe(true);
  });

  it('help expands with new commands as achievements unlock', () => {
    const h = component as unknown as TerminalHandle;
    run('clear');
    run('help');
    const before = h.history().map((l: TerminalLine) => l.text).join('\n');
    expect(before).not.toContain('launch-codes');
    achievements.unlock('apogee-reached');
    run('clear');
    run('help');
    const after = h.history().map((l: TerminalLine) => l.text).join('\n');
    expect(after).toContain('launch');
  });

  it('context-aware help mentions the active widget', () => {
    simState.activeTab.set('rocket');
    const h = component as unknown as TerminalHandle;
    run('clear');
    run('help');
    const joined = h.history().map((l: TerminalLine) => l.text).join('\n');
    expect(joined.toLowerCase()).toContain('rocket');
  });

  it('stores input lines with prompt + command fields (no substring offset)', () => {
    const h = component as unknown as TerminalHandle;
    run('clear');
    run('pwd');
    const inputLine = h.history().find((l: TerminalLine) => l.type === 'input');
    expect(inputLine).toBeDefined();
    expect(inputLine?.command).toBe('pwd');
    expect(inputLine?.prompt).toContain('deniz@portfolio:');
    expect(inputLine?.prompt).toContain('$ ');
  });

  it('pwd prints the current working directory', () => {
    const lines = run('pwd');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('/home/deniz');
  });

  it('echo prints its arguments', () => {
    const lines = run('echo hello world');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('hello world');
  });

  it('echo expands $HOME, $USER, $SHELL, $PATH', () => {
    const lines = run('echo $HOME $USER $SHELL $PATH');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('/home/deniz');
    expect(joined).toContain('deniz ');
    expect(joined).toContain('/bin/bash');
    expect(joined).toContain('/usr/bin:/bin');
  });

  it('whoami prints deniz', () => {
    const lines = run('whoami');
    expect(lines.some((l: TerminalLine) => l.text === 'deniz')).toBe(true);
  });

  it('hostname prints portfolio', () => {
    const lines = run('hostname');
    expect(lines.some((l: TerminalLine) => l.text === 'portfolio')).toBe(true);
  });

  it('date prints a UTC date string', () => {
    const lines = run('date');
    expect(lines.some((l: TerminalLine) => l.text.includes('GMT'))).toBe(true);
  });

  it('uname without flags prints DenizOS', () => {
    const lines = run('uname');
    expect(lines.some((l: TerminalLine) => l.text === 'DenizOS')).toBe(true);
  });

  it('uname -a prints the full kernel string', () => {
    const lines = run('uname -a');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('DenizOS portfolio 22.0');
    expect(joined).toContain('GNU/Linux');
  });

  it('env prints HOME, USER, PWD, SHELL, PATH, PS1', () => {
    const lines = run('env');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('HOME=/home/deniz');
    expect(joined).toContain('USER=deniz');
    expect(joined).toContain('SHELL=/bin/bash');
    expect(joined).toContain('PATH=/usr/bin:/bin');
    expect(joined).toContain('PS1=');
  });

  it('printenv aliases env', () => {
    const lines = run('printenv');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('HOME=/home/deniz');
  });

  it('wc -l prints line count for resume.txt', () => {
    const lines = run('wc -l /home/deniz/resume.txt');
    const wcLine = lines.find((l: TerminalLine) => l.text.includes('resume.txt'));
    expect(wcLine?.text).toMatch(/^\d+ /);
    expect(wcLine?.text).toContain('resume.txt');
  });

  it('wc without -l prints lines words chars file', () => {
    const lines = run('wc /etc/hostname');
    const wcLine = lines.find((l: TerminalLine) => l.text.includes('/etc/hostname'));
    expect(wcLine?.text).toContain('/etc/hostname');
    const nums = wcLine?.text.split(' ').filter((t) => /^\d+$/.test(t)) ?? [];
    expect(nums.length).toBeGreaterThanOrEqual(3);
  });

  it('head -n 2 prints first 2 lines', () => {
    const lines = run('head -n 2 /var/log/syslog');
    const outputLine = lines.find((l: TerminalLine) => l.type === 'output' && l.text.includes('gossipd'));
    expect(outputLine?.text).toContain('gossipd');
  });

  it('tail -n 1 prints last line', () => {
    const lines = run('tail -n 1 /var/log/syslog');
    const outputLine = lines.find((l: TerminalLine) => l.type === 'output' && l.text.includes('radiod'));
    expect(outputLine?.text).toContain('radiod');
  });

  it('grep filters matching lines from a file', () => {
    const lines = run('grep gossipd /var/log/syslog');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('mesh initialized');
  });

  it('which finds /usr/bin/ls and /usr/bin/cat', () => {
    const lines = run('which ls cat');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('/usr/bin/ls');
    expect(joined).toContain('/usr/bin/cat');
  });

  it('man with no command asks which page', () => {
    const lines = run('man');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined.toLowerCase()).toContain('what manual page');
  });

  it('man ls prints the LS(1) page', () => {
    const lines = run('man ls');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('LS(1)');
    expect(joined).toContain('list directory contents');
  });

  it('history lists previously executed commands with numbers', () => {
    run('pwd');
    run('whoami');
    const lines = run('history');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('pwd');
    expect(joined).toContain('whoami');
    expect(joined).toMatch(/\d+\s+pwd/);
  });

  it('ls -a shows hidden files (.bashrc, .bash_history)', () => {
    const lines = run('ls -a /home/deniz');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('.bashrc');
    expect(joined).toContain('.bash_history');
  });

  it('ls -l prints long format with permissions', () => {
    const lines = run('ls -l /home/deniz');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('drwxr-xr-x');
    expect(joined).toContain('deniz deniz');
  });

  it('ls -la combines -l and -a', () => {
    const lines = run('ls -la /home/deniz');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('drwxr-xr-x');
    expect(joined).toContain('.bashrc');
  });

  it('cd with no args returns home', () => {
    run('cd /etc');
    run('cd');
    const lines = run('pwd');
    const pwdLine = lines.find((l: TerminalLine) => l.text.includes('/home/deniz'));
    expect(pwdLine?.text).toContain('/home/deniz');
  });

  it('cd ~ returns home', () => {
    run('cd /etc');
    run('cd ~');
    const lines = run('pwd');
    const pwdLine = lines.filter((l: TerminalLine) => l.type === 'output').pop();
    expect(pwdLine?.text).toBe('/home/deniz');
  });

  it('cd ~/projects navigates to home-relative path', () => {
    run('cd ~/projects');
    const lines = run('pwd');
    const pwdLine = lines.filter((l: TerminalLine) => l.type === 'output').pop();
    expect(pwdLine?.text).toBe('/home/deniz/projects');
  });

  it('cd - returns to previous directory', () => {
    run('cd /etc');
    run('cd /var/log');
    run('cd -');
    const lines = run('pwd');
    const pwdLine = lines.filter((l: TerminalLine) => l.type === 'output').pop();
    expect(pwdLine?.text).toBe('/etc');
  });

  it('cd .. navigates to parent', () => {
    run('cd /home/deniz/projects');
    run('cd ..');
    const lines = run('pwd');
    const pwdLine = lines.filter((l: TerminalLine) => l.type === 'output').pop();
    expect(pwdLine?.text).toBe('/home/deniz');
  });

  it('cat -n prints numbered lines', () => {
    const lines = run('cat -n /etc/hostname');
    const numLine = lines.find((l: TerminalLine) => l.text.includes('portfolio'));
    expect(numLine?.text).toMatch(/^\s+1\tportfolio/);
  });

  it('cat concatenates multiple files', () => {
    const lines = run('cat /etc/hostname /etc/os-release');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('portfolio');
    expect(joined).toContain('DenizOS');
  });

  it('find / -name "*.txt" locates text files', () => {
    const lines = run('find / -name "*.txt"');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('resume.txt');
  });

  it('find / -type d locates directories', () => {
    const lines = run('find / -type d');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('projects');
    expect(joined).toContain('log');
  });

  it('find / -name "*.md" -type f locates markdown files', () => {
    const lines = run('find / -name "*.md" -type f');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('.md');
  });

  it('help --help shows usage text', () => {
    const lines = run('help --help');
    const joined = lines.map((l: TerminalLine) => l.text).join('\n');
    expect(joined).toContain('Usage: help');
  });

  it('dynamic prompt reflects current cwd', () => {
    run('cd /etc');
    const h = component as unknown as TerminalHandle;
    run('pwd');
    const inputLine = [...h.history()].reverse().find((l: TerminalLine) => l.type === 'input');
    expect(inputLine?.prompt).toContain('/etc');
    expect(inputLine?.prompt).not.toContain('~');
  });

  it('dynamic prompt shows ~ for home', () => {
    run('cd ~');
    const h = component as unknown as TerminalHandle;
    run('pwd');
    const inputLine = [...h.history()].reverse().find((l: TerminalLine) => l.type === 'input');
    expect(inputLine?.prompt).toContain(':~$');
  });

  describe('tab completion', () => {
    const pressTab = (h: TerminalHandle) =>
      h.handleKeyDown(new KeyboardEvent('keydown', { key: 'Tab' }));

    it('completes a single matching command', () => {
      const h = component as unknown as TerminalHandle;
      h.inputValue.set('pw');
      pressTab(h);
      expect(h.inputValue()).toBe('pwd');
    });

    it('lists multiple matches without completing (bash-style)', () => {
      const h = component as unknown as TerminalHandle;
      run('clear');
      h.inputValue.set('c');
      pressTab(h);
      const joined = h.history().map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('cd');
      expect(joined).toContain('cat');
      expect(joined).toContain('clear');
      expect(h.inputValue()).toBe('c');
    });

    it('shows nothing and does not complete when no match exists', () => {
      const h = component as unknown as TerminalHandle;
      run('clear');
      h.inputValue.set('zzz');
      pressTab(h);
      expect(h.inputValue()).toBe('zzz');
      expect(h.history().filter((l) => l.type === 'system').length).toBe(0);
    });

    it('completes a unique path in the current directory', () => {
      const h = component as unknown as TerminalHandle;
      run('cd /etc');
      h.inputValue.set('cat host');
      pressTab(h);
      expect(h.inputValue()).toBe('cat hostname');
    });

    it('adds a trailing slash when completing a directory', () => {
      const h = component as unknown as TerminalHandle;
      run('cd /');
      h.inputValue.set('ls ho');
      pressTab(h);
      expect(h.inputValue()).toBe('ls home/');
    });
  });

  describe('pipes', () => {
    it('cat resume.txt | grep TNG prints only matching lines', () => {
      const lines = run('cat /home/deniz/resume.txt | grep TNG');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('TNG');
      expect(joined).not.toContain('whoami');
    });

    it('ls | wc -l counts the entries in the directory', () => {
      const lines = run('ls /etc | wc -l');
      const wcLine = lines.find((l: TerminalLine) => /^\d+$/.test(l.text.trim()) || /^\d+\s*$/.test(l.text));
      expect(wcLine).toBeDefined();
      const n = Number(wcLine?.text.trim());
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    });

    it('echo text | grep token filters the piped input', () => {
      const lines = run('echo "alpha beta" | grep beta');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('beta');
      expect(joined).toContain('alpha');
    });

    it('grep on piped multi-line input keeps only matching lines', () => {
      run('clear');
      run('echo "line one match" > /tmp/pipe1.txt');
      run('echo "line two" >> /tmp/pipe1.txt');
      run('echo "line three match" >> /tmp/pipe1.txt');
      const lines = run('cat /tmp/pipe1.txt | grep match');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('line one match');
      expect(joined).toContain('line three match');
      expect(joined).not.toContain('line two');
    });

    it('head reads piped stdin when no file is given', () => {
      const lines = run('echo "one two three" | head -n 1');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('one two three');
    });

    it('cat reads piped stdin when no file is given', () => {
      const lines = run('echo "piped hello" | cat');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('piped hello');
    });
  });

  describe('redirects', () => {
    it('echo "test" > /tmp/test.txt writes to a VFS file', () => {
      run('clear');
      run('echo "test" > /tmp/test.txt');
      const lines = run('cat /tmp/test.txt');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('test');
    });

    it('echo "world" >> /tmp/test.txt appends to the file', () => {
      run('clear');
      run('echo "first" > /tmp/append.txt');
      run('echo "second" >> /tmp/append.txt');
      const lines = run('cat /tmp/append.txt');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('first');
      expect(joined).toContain('second');
    });

    it('refuses to write outside /tmp', () => {
      const lines = run('echo "nope" > /etc/host');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined.toLowerCase()).toContain('only /tmp');
    });

    it('overwrites on the second single-redirect', () => {
      run('clear');
      run('echo "v1" > /tmp/ow.txt');
      run('echo "v2" > /tmp/ow.txt');
      const lines = run('cat /tmp/ow.txt');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('v2');
      expect(joined).not.toContain('v1');
    });
  });

  describe('command chaining', () => {
    it('cd /tmp && ls runs the second command when the first succeeds', () => {
      const lines = run('cd /tmp && pwd');
      const pwdLine = lines.filter((l: TerminalLine) => l.type === 'output').pop();
      expect(pwdLine?.text).toBe('/tmp');
    });

    it('&& stops the chain when the first command fails', () => {
      run('clear');
      const lines = run('cat /no/such/file && echo "should-not-print"');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('no such file');
      expect(joined).not.toContain('should-not-print');
    });

    it('; always runs the next command even after a failure', () => {
      run('clear');
      const lines = run('cat /no/such/file ; echo "should-print"');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('no such file');
      expect(joined).toContain('should-print');
    });

    it('multiple ; chains all execute', () => {
      run('clear');
      const lines = run('echo a ; echo b ; echo c');
      const outputs = lines.filter((l: TerminalLine) => l.type === 'output').map((l) => l.text);
      expect(outputs).toContain('a');
      expect(outputs).toContain('b');
      expect(outputs).toContain('c');
    });
  });

  describe('man pages and --help', () => {
    it('man ls prints the LS(1) page', () => {
      const lines = run('man ls');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('LS(1)');
      expect(joined).toContain('list directory contents');
    });

    it('man cat covers the CAT(1) page', () => {
      const lines = run('man cat');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('CAT(1)');
    });

    it('man history documents !N and !!', () => {
      const lines = run('man history');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('HISTORY(1)');
      expect(joined).toContain('!!');
      expect(joined).toContain('!N');
    });

    it('man solve documents the ARG chain', () => {
      const lines = run('man solve');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('SOLVE(1)');
      expect(joined).toContain('SIGMA-13');
    });

    it('man for an unknown command reports no manual entry', () => {
      const lines = run('man nosuchcmd');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined.toLowerCase()).toContain('no manual entry');
    });

    it('every known command has a man page entry', () => {
      const known = [
        'help', 'about', 'skills', 'projects', 'contact', 'theme', 'clear', 'reboot', 'sudo',
        'ls', 'cd', 'cat', 'tree', 'find', 'echo', 'pwd', 'whoami', 'hostname', 'date',
        'uname', 'env', 'printenv', 'wc', 'head', 'tail', 'grep', 'which', 'man', 'history',
        'launch', 'route', 'gossip', 'radio', 'tab', 'achievement', 'solve',
      ];
      const missing: string[] = [];
      for (const cmd of known) {
        run('clear');
        const out = run(`man ${cmd}`);
        const joined = out.map((l: TerminalLine) => l.text).join('\n');
        if (joined.includes('No manual entry')) missing.push(cmd);
      }
      expect(missing).toEqual([]);
    });

    it('ls --help prints a one-line usage summary', () => {
      const lines = run('ls --help');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('Usage: ls');
    });

    it('grep --help prints a one-line usage summary', () => {
      const lines = run('grep --help');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('Usage: grep');
    });

    it('echo --help prints a one-line usage summary', () => {
      const lines = run('echo --help');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('Usage: echo');
    });
  });

  describe('history replay', () => {
    it('history output is numbered 1-indexed', () => {
      run('clear');
      run('pwd');
      run('whoami');
      const lines = run('history');
      const numbered = lines.filter((l: TerminalLine) => /^\s*\d+\s+/.test(l.text));
      expect(numbered.length).toBeGreaterThan(0);
      const firstNum = Number(numbered[0]?.text.trim().split(/\s+/)[0]);
      expect(firstNum).toBe(1);
    });

    it('!2 re-executes the second command from history', () => {
      run('clear');
      run('echo first-command');
      run('echo second');
      const lines = run('!2');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      const inputLines = lines.filter((l) => l.type === 'input').map((l) => l.command ?? '');
      expect(inputLines.some((c) => c.includes('echo first-command'))).toBe(true);
      expect(joined).toContain('first-command');
    });

    it('!! re-executes the last command from history', () => {
      run('clear');
      run('echo last-line');
      const lines = run('!!');
      const joined = lines.map((l: TerminalLine) => l.text).join('\n');
      expect(joined).toContain('last-line');
    });

    it('!! echoes the expanded command before running it', () => {
      run('clear');
      run('echo expanded');
      const lines = run('!!');
      const inputLine = lines.find((l: TerminalLine) => l.type === 'input');
      expect(inputLine?.command).toBe('echo expanded');
    });
  });
});
