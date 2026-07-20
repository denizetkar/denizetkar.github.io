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
  prompt?: string;
  command?: string;
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

const PROMPT_USER = 'deniz';
const PROMPT_HOST = 'portfolio';
const HOME = '/home/deniz';

const ENV_VARS: Record<string, string> = {
  HOME,
  USER: 'deniz',
  SHELL: '/bin/bash',
  PATH: '/usr/bin:/bin',
  PS1: `${PROMPT_USER}@${PROMPT_HOST}:\\w$ `,
};

const VALUE_FLAGS = new Set([
  'gw', 'port', 'thrust', 'fuel', 'pitch', 'stage', 'code', 'count',
  'tune', 'channel', 'mode', 'partition', 'fail', 'name', 'type',
]);

const USR_BIN_COMMANDS = [
  'ls', 'cd', 'cat', 'tree', 'find', 'echo', 'pwd', 'whoami', 'hostname',
  'date', 'uname', 'env', 'printenv', 'wc', 'head', 'tail', 'grep', 'which',
  'man', 'history', 'clear', 'reboot',
];

const MAN_PAGES: Record<string, string> = {
  help: 'HELP(1)\n\nNAME\n    help - show available commands or usage for one\n\nSYNOPSIS\n    help [command]\n\nDESCRIPTION\n    Without args, lists every available command. With a command name, shows its usage. --help prints a one-line summary.',
  about: 'ABOUT(1)\n\nNAME\n    about - show profile summary\n\nSYNOPSIS\n    about\n\nDESCRIPTION\n    Prints name, title, location, and bio.',
  skills: 'SKILLS(1)\n\nNAME\n    skills - show technical skill matrix\n\nSYNOPSIS\n    skills\n\nDESCRIPTION\n    Prints the categorized technical expertise matrix.',
  projects: 'PROJECTS(1)\n\nNAME\n    projects - list repositories or show one\n\nSYNOPSIS\n    projects [name]\n\nDESCRIPTION\n    Without args, lists all repositories. With a name, shows architectural details for that project.',
  contact: 'CONTACT(1)\n\nNAME\n    contact - show contact information\n\nSYNOPSIS\n    contact\n\nDESCRIPTION\n    Prints email, GitHub, and LinkedIn URLs.',
  theme: 'THEME(1)\n\nNAME\n    theme - switch UI theme\n\nSYNOPSIS\n    theme <dark|cyberpunk|terminal>\n\nDESCRIPTION\n    Switches the active application theme.',
  clear: 'CLEAR(1)\n\nNAME\n    clear - clear the terminal screen\n\nSYNOPSIS\n    clear\n\nDESCRIPTION\n    Clears the entire terminal history.',
  reboot: 'REBOOT(1)\n\nNAME\n    reboot - restart the simulation\n\nSYNOPSIS\n    reboot\n\nDESCRIPTION\n    Resets all simulation state (rocket, routes, gossip, radio) and clears the terminal.',
  sudo: 'SUDO(8)\n\nNAME\n    sudo - execute a command as another user\n\nSYNOPSIS\n    sudo [command]\n\nDESCRIPTION\n    Deniz is not in the sudoers file. This incident will be reported.',
  ls: 'LS(1)\n\nNAME\n    ls - list directory contents\n\nSYNOPSIS\n    ls [OPTION]... [FILE]...\n\nDESCRIPTION\n    List information about the FILEs (the current directory by default).\n    Options: -a (all, including hidden), -l (long format), -la/-al (both).',
  cd: 'CD(1)\n\nNAME\n    cd - change the shell working directory\n\nSYNOPSIS\n    cd [dir]\n\nDESCRIPTION\n    Change the current directory to DIR. With no DIR, go to $HOME.\n    Special: "cd -" returns to $OLDPWD, "cd ~" or "cd" goes home, ".." goes to parent.',
  cat: 'CAT(1)\n\nNAME\n    cat - concatenate files and print on the standard output\n\nSYNOPSIS\n    cat [OPTION]... [FILE]...\n\nDESCRIPTION\n    Options: -n (number all output lines). Reads piped stdin if no file is given.',
  tree: 'TREE(1)\n\nNAME\n    tree - list contents of directories in a tree-like format\n\nSYNOPSIS\n    tree [path]\n\nDESCRIPTION\n    Recursively prints the directory tree starting at path (default: cwd).',
  find: 'FIND(1)\n\nNAME\n    find - search for files in a directory hierarchy\n\nSYNOPSIS\n    find [path] [-name PATTERN] [-type f|d]\n\nDESCRIPTION\n    Searches starting at path (default: cwd). -name matches by glob pattern, -type filters by f (file) or d (dir).',
  echo: 'ECHO(1)\n\nNAME\n    echo - display a line of text\n\nSYNOPSIS\n    echo [STRING]...\n\nDESCRIPTION\n    Print the STRINGs. Supports $VAR expansion.\n    Option: -n (do not output the trailing newline).',
  pwd: 'PWD(1)\n\nNAME\n    pwd - print name of current/working directory\n\nSYNOPSIS\n    pwd\n\nDESCRIPTION\n    Prints the absolute path of the current working directory.',
  whoami: 'WHOAMI(1)\n\nNAME\n    whoami - print effective userid\n\nSYNOPSIS\n    whoami\n\nDESCRIPTION\n    Prints the current user name (deniz).',
  hostname: 'HOSTNAME(1)\n\nNAME\n    hostname - show or set the system host name\n\nSYNOPSIS\n    hostname\n\nDESCRIPTION\n    Prints the system hostname (portfolio).',
  date: 'DATE(1)\n\nNAME\n    date - print the system date and time\n\nSYNOPSIS\n    date\n\nDESCRIPTION\n    Prints the current UTC date and time.',
  uname: 'UNAME(1)\n\nNAME\n    uname - print system information\n\nSYNOPSIS\n    uname [-a]\n\nDESCRIPTION\n    Prints system name. -a prints full kernel string.',
  env: 'ENV(1)\n\nNAME\n    env - run a program in a modified environment\n\nSYNOPSIS\n    env\n\nDESCRIPTION\n    Prints the current environment variables (HOME, USER, PWD, SHELL, PATH, PS1).',
  printenv: 'PRINTENV(1)\n\nNAME\n    printenv - print environment variables\n\nSYNOPSIS\n    printenv\n\nDESCRIPTION\n    Prints the current environment variables (alias for env).',
  wc: 'WC(1)\n\nNAME\n    wc - print newline, word, and byte counts\n\nSYNOPSIS\n    wc [-l] [FILE]\n\nDESCRIPTION\n    Prints counts. -l prints line count only. Reads piped stdin if no file is given.',
  head: 'HEAD(1)\n\nNAME\n    head - output the first part of files\n\nSYNOPSIS\n    head [-n N] [FILE]\n\nDESCRIPTION\n    Prints the first N lines (default 10). Reads piped stdin if no file is given.',
  tail: 'TAIL(1)\n\nNAME\n    tail - output the last part of files\n\nSYNOPSIS\n    tail [-n N] [FILE]\n\nDESCRIPTION\n    Prints the last N lines (default 10). Reads piped stdin if no file is given.',
  grep: 'GREP(1)\n\nNAME\n    grep - print lines matching a pattern\n\nSYNOPSIS\n    grep PATTERN [FILE]\n\nDESCRIPTION\n    Prints lines containing PATTERN. Reads piped stdin if no file is given.',
  which: 'WHICH(1)\n\nNAME\n    which - locate a command\n\nSYNOPSIS\n    which COMMAND...\n\nDESCRIPTION\n    Locates commands in /usr/bin.',
  man: 'MAN(1)\n\nNAME\n    man - an interface to system manuals\n\nSYNOPSIS\n    man COMMAND\n\nDESCRIPTION\n    Shows the manual page for COMMAND.',
  history: 'HISTORY(1)\n\nNAME\n    history - display command history\n\nSYNOPSIS\n    history\n\nDESCRIPTION\n    Lists previously executed commands with 1-indexed numbers. Use !N to re-run command N, !! to re-run the last.',
  launch: 'LAUNCH(1)\n\nNAME\n    launch - initiate rocket launch sequence\n\nSYNOPSIS\n    launch [--thrust N] [--fuel N] [--pitch N] [--stage N] [--code OMEGA-7]\n\nDESCRIPTION\n    Initiates a launch. --code OMEGA-7 engages the ARG flight profile.',
  route: 'ROUTE(8)\n\nNAME\n    route - show / manipulate the IP routing table\n\nSYNOPSIS\n    route --add CIDR --gw IP --port N | --remove CIDR | --list | --inject [--count N]\n\nDESCRIPTION\n    Manages the simulation routing table.',
  gossip: 'GOSSIP(8)\n\nNAME\n    gossip - gossip protocol control\n\nSYNOPSIS\n    gossip --infect | --partition NODE | --fail NODE | --mode push|pull|push-pull\n\nDESCRIPTION\n    Controls the gossip protocol simulation.',
  radio: 'RADIO(8)\n\nNAME\n    radio - radio transceiver control\n\nSYNOPSIS\n    radio --tune FREQ | --channel N | --ptt\n\nDESCRIPTION\n    Controls the radio simulation: tune frequency, set channel, hold PTT.',
  tab: 'TAB(1)\n\nNAME\n    tab - switch the active widget\n\nSYNOPSIS\n    tab <gossip|rocket|router|radio|portfolio>\n\nDESCRIPTION\n    Switches the visible widget in the simulation dashboard.',
  achievement: 'ACHIEVEMENT(1)\n\nNAME\n    achievement - list unlocked achievements\n\nSYNOPSIS\n    achievement [--list]\n\nDESCRIPTION\n    Lists all achievements that have been unlocked.',
  solve: 'SOLVE(1)\n\nNAME\n    solve - resolve the ARG\n\nSYNOPSIS\n    solve SIGMA-13\n\nDESCRIPTION\n    Resolves the ARG chain. Requires launch OMEGA-7, gossip partition, and convergence preconditions.',
};

const HELP_USAGE: Record<string, string> = {
  help: 'Usage: help [command] - show this help or usage for one command',
  about: 'Usage: about - show bio and role summary',
  skills: 'Usage: skills - show technical skill matrix',
  projects: 'Usage: projects [name] - list repositories or show one',
  contact: 'Usage: contact - print email, LinkedIn, GitHub',
  theme: 'Usage: theme <dark|cyberpunk|terminal> - switch theme',
  clear: 'Usage: clear - clear the terminal screen',
  reboot: 'Usage: reboot - restart the simulation',
  sudo: 'Usage: sudo [command] - run as another user (deniz is not a sudoer)',
  ls: 'Usage: ls [-a|-l|-la] [path...] - list directory contents',
  cd: 'Usage: cd [-|~|..|path] - change working directory',
  cat: 'Usage: cat [-n] file... - print file contents',
  tree: 'Usage: tree [path] - print directory tree',
  find: 'Usage: find [path] [-name PATTERN] [-type f|d] - search files',
  echo: 'Usage: echo [-n] [text] - print text ($VAR expanded)',
  pwd: 'Usage: pwd - print working directory',
  whoami: 'Usage: whoami - print current user',
  hostname: 'Usage: hostname - print system hostname',
  date: 'Usage: date - print current UTC date',
  uname: 'Usage: uname [-a] - print system info',
  env: 'Usage: env - print environment variables',
  printenv: 'Usage: printenv - alias for env',
  wc: 'Usage: wc [-l] file - count lines/words/chars',
  head: 'Usage: head [-n N] file - print first N lines (default 10)',
  tail: 'Usage: tail [-n N] file - print last N lines (default 10)',
  grep: 'Usage: grep PATTERN file - print matching lines',
  which: 'Usage: which command... - locate commands in /usr/bin',
  man: 'Usage: man command - show manual page',
  history: 'Usage: history - list commands (use !N / !! to re-run)',
  launch: 'Usage: launch [--thrust N] [--fuel N] [--pitch N] [--stage N] [--code OMEGA-7]',
  route: 'Usage: route --add CIDR --gw IP --port N | --remove CIDR | --list | --inject',
  gossip: 'Usage: gossip --infect | --partition NODE | --fail NODE | --mode push|pull|push-pull',
  radio: 'Usage: radio --tune FREQ | --channel N | --ptt',
  tab: 'Usage: tab <gossip|rocket|router|radio|portfolio>',
  achievement: 'Usage: achievement --list - list unlocked achievements',
  solve: 'Usage: solve SIGMA-13 - resolve the ARG',
};

export class CommandParser {
  static parse(input: string): ParseResult {
    const tokens = input.trim().split(/\s+/).filter((t) => t.length > 0).map((t) => {
      if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
        return t.slice(1, -1);
      }
      return t;
    });
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
          if (next !== undefined && !next.startsWith('-')) {
            flags[body] = next;
            i++;
          } else {
            flags[body] = true;
          }
        } else {
          flags[body] = true;
        }
      } else if (token.startsWith('-') && token.length > 1 && !isNumeric(token)) {
        const body = token.slice(1);
        const eq = body.indexOf('=');
        if (eq !== -1) {
          flags[body.slice(0, eq)] = body.slice(eq + 1);
        } else if (VALUE_FLAGS.has(body)) {
          const next = tokens[i + 1];
          if (next !== undefined && !next.startsWith('-')) {
            flags[body] = next;
            i++;
          } else {
            flags[body] = true;
          }
        } else if (body.length > 1) {
          for (const ch of body) flags[ch] = true;
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

function isNumeric(s: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(s);
}

export class VirtualFileSystem {
  private root: VfsNode;
  private cwdPath = HOME;
  private oldCwdPath = HOME;
  private readonly achievements: AchievementService;
  private readonly dataService: DataService;

  constructor(dataService: DataService, achievements: AchievementService) {
    this.dataService = dataService;
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
      { name: '.bashrc', type: 'file', content: `export PS1='deniz@portfolio:\\w$ '\nexport HOME=${HOME}\nexport SHELL=/bin/bash` },
      { name: '.bash_history', type: 'file', content: 'ls\ncat resume.txt\nhelp\npwd' },
      { name: '.config', type: 'dir', children: [] },
      { name: '.secrets', type: 'dir', children: secretsChildren },
    ];
    const etcChildren: VfsNode[] = [
      { name: 'hostname', type: 'file', content: 'portfolio' },
      { name: 'os-release', type: 'file', content: 'NAME="DenizOS"\nVERSION="22.0"\nID=denizos' },
      { name: 'profile.d', type: 'dir', children: [] },
    ];
    const logChildren: VfsNode[] = [
      { name: 'syslog', type: 'file', content: [
        'Jul 20 12:00:01 portfolio gossipd[42]: mesh initialized',
        'Jul 20 12:00:02 portfolio rocketd[7]: prelaunch standby',
        'Jul 20 12:00:03 portfolio routerd[11]: routing table loaded',
        'Jul 20 12:00:04 portfolio radiod[5]: channel 1 idle',
      ].join('\n') },
      { name: 'auth.log', type: 'file', content: 'Jul 20 12:00:01 portfolio sshd[1]: Connection from 127.0.0.1' },
    ];
    const usrBinChildren: VfsNode[] = USR_BIN_COMMANDS.map((c) => ({
      name: c, type: 'file' as VfsNodeType, content: '',
    }));
    return {
      name: '', type: 'dir',
      children: [
        { name: 'home', type: 'dir', children: [
          { name: 'deniz', type: 'dir', children: homeChildren },
        ]},
        { name: 'etc', type: 'dir', children: etcChildren },
        { name: 'var', type: 'dir', children: [
          { name: 'log', type: 'dir', children: logChildren },
        ]},
        { name: 'tmp', type: 'dir', children: [] },
        { name: 'usr', type: 'dir', children: [
          { name: 'bin', type: 'dir', children: usrBinChildren },
        ]},
      ],
    };
  }

  private mirrorAchievements(): string {
    return JSON.stringify({ achievements: this.achievements.achievements() }, null, 2);
  }

  rebuild(): void { this.root = this.buildTree(); }
  cwd(): string { return this.cwdPath; }
  oldCwd(): string { return this.oldCwdPath; }

  private expandUser(path: string): string {
    if (path === '~') return HOME;
    if (path.startsWith('~/')) return `${HOME}${path.slice(1)}`;
    return path;
  }

  resolve(path: string): VfsNode | null {
    const expanded = this.expandUser(path);
    const absolute = this.normalize(expanded);
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

  private isSecretPath(path: string): boolean {
    return this.normalize(this.expandUser(path)).includes('/.secrets');
  }

  ls(path?: string): string[] {
    const target = this.resolve(path ?? this.cwdPath);
    if (!target || target.type !== 'dir' || !target.children) return [];
    if (path !== undefined && this.isSecretPath(path) && !this.achievements.isUnlocked('apogee-reached')) {
      return [];
    }
    return target.children.map((c) => (c.type === 'dir' ? `${c.name}/` : c.name));
  }

  lsNodes(path?: string): VfsNode[] {
    const target = this.resolve(path ?? this.cwdPath);
    if (!target || target.type !== 'dir' || !target.children) return [];
    if (path !== undefined && this.isSecretPath(path) && !this.achievements.isUnlocked('apogee-reached')) {
      return [];
    }
    return target.children.slice();
  }

  cd(path: string): { ok: boolean; error?: string } {
    if (path === '-') {
      const prev = this.oldCwdPath;
      const target = this.resolve(prev);
      if (!target) return { ok: false, error: `cd: no such file or directory: ${prev}` };
      if (target.type !== 'dir') return { ok: false, error: `cd: not a directory: ${prev}` };
      this.oldCwdPath = this.cwdPath;
      this.cwdPath = prev;
      return { ok: true };
    }
    const expanded = this.expandUser(path);
    const target = this.resolve(expanded);
    if (!target) return { ok: false, error: `cd: no such file or directory: ${path}` };
    if (target.type !== 'dir') return { ok: false, error: `cd: not a directory: ${path}` };
    this.oldCwdPath = this.cwdPath;
    this.cwdPath = this.normalize(expanded);
    return { ok: true };
  }

  cat(path: string): { ok: boolean; output?: string; error?: string } {
    const target = this.resolve(path);
    if (!target) return { ok: false, error: `cat: ${path}: no such file` };
    if (target.type === 'dir') return { ok: false, error: `cat: ${path}: is a directory` };
    return { ok: true, output: target.content ?? '' };
  }

  write(path: string, content: string, append: boolean): { ok: boolean; error?: string } {
    const expanded = this.expandUser(path);
    const absolute = this.normalize(expanded);
    if (!absolute.startsWith('/tmp/') && absolute !== '/tmp') {
      return { ok: false, error: `write: ${path}: only /tmp is writable` };
    }
    const parentPath = absolute.split('/').slice(0, -1).join('/') || '/';
    const parent = this.resolve(parentPath);
    if (!parent || parent.type !== 'dir' || !parent.children) {
      return { ok: false, error: `write: ${path}: no such directory` };
    }
    const name = absolute.split('/').pop()!;
    const existing = parent.children.find((c) => c.name === name);
    if (existing) {
      if (existing.type !== 'file') return { ok: false, error: `write: ${path}: is a directory` };
      existing.content = append ? (existing.content ?? '') + content : content;
    } else {
      parent.children.push({ name, type: 'file', content });
    }
    return { ok: true };
  }

  read(path: string): { ok: boolean; error?: string } {
    const target = this.resolve(path);
    if (!target) return { ok: false, error: `no such file or directory: ${path}` };
    if (this.isSecretPath(path) && !this.achievements.isUnlocked('apogee-reached')) {
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

  findAt(startPath: string, opts: { name?: string; type?: 'f' | 'd' }): string[] {
    const start = this.resolve(startPath);
    if (!start) return [];
    const results: string[] = [];
    this.walkFindOpts(start, startPath === '/' ? '' : startPath, opts, results);
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

  private matchesName(pattern: string, name: string): boolean {
    if (!pattern.includes('*')) return name.includes(pattern);
    const regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'));
    return regex.test(name);
  }

  private walkFindOpts(node: VfsNode, currentPath: string, opts: { name?: string; type?: 'f' | 'd' }, results: string[]): void {
    const fullPath = node.name === '' ? currentPath : `${currentPath}/${node.name}`;
    const typeOk = !opts.type || (opts.type === 'd' ? node.type === 'dir' : node.type === 'file');
    const nameOk = !opts.name || this.matchesName(opts.name, node.name);
    if (node.name !== '' && typeOk && nameOk) {
      results.push(fullPath);
    }
    if (node.type === 'dir' && node.children) {
      const childPath = node.name === '' ? currentPath : `${currentPath}/${node.name}`;
      for (const child of node.children) {
        this.walkFindOpts(child, childPath, opts, results);
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

  protected readonly currentPrompt = computed<string>(() => this.promptString());

  protected readonly history = signal<TerminalLine[]>([
    { text: 'Welcome to Deniz\'s Interactive CLI (v2.0.0).', type: 'system' },
    { text: 'Type "help" for a list of available commands.', type: 'system' },
    { text: '', type: 'output' },
  ]);
  protected historyIndex = -1;

  private captureBuffer: string[] | null = null;
  private pipedInput: string | null = null;
  private hadError = false;

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

  protected promptString(): string {
    const cwd = this.vfs.cwd();
    let display = cwd;
    if (cwd === HOME) {
      display = '~';
    } else if (cwd.startsWith(`${HOME}/`)) {
      display = `~${cwd.slice(HOME.length)}`;
    }
    return `${PROMPT_USER}@${PROMPT_HOST}:${display}$ `;
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
    const input = this.inputValue();
    const lastSpace = input.lastIndexOf(' ');
    if (lastSpace === -1) {
      const lower = input.toLowerCase();
      const commands = this.knownCommands();
      const matches = commands.filter((c) => c.startsWith(lower));
      this.applyMatches('', matches, '');
      return;
    }
    const prefix = input.slice(0, lastSpace + 1);
    const token = input.slice(lastSpace + 1);
    const slashIdx = token.lastIndexOf('/');
    const dirPart = slashIdx >= 0 ? token.slice(0, slashIdx + 1) : '';
    const namePart = slashIdx >= 0 ? token.slice(slashIdx + 1) : token;
    const dirPath = dirPart.length > 0 ? dirPart : this.vfs.cwd();
    const nodes = this.vfs.lsNodes(dirPath);
    const matches = nodes
      .map((n) => (n.type === 'dir' ? `${n.name}/` : n.name))
      .filter((name) => name.startsWith(namePart));
    this.applyMatches(prefix + dirPart, matches, '');
  }

  private applyMatches(prefix: string, matches: string[], suffix: string): void {
    if (matches.length === 1) {
      this.inputValue.set(`${prefix}${matches[0]}${suffix}`);
    } else if (matches.length > 1) {
      this.history.update((h) => [
        ...h,
        { text: '', type: 'input', prompt: this.promptString(), command: this.inputValue() },
        { text: matches.join('   '), type: 'system' },
      ]);
    }
  }

  private knownCommands(): string[] {
    return [
      'help', 'about', 'skills', 'projects', 'contact', 'theme', 'clear', 'reboot', 'sudo',
      'launch', 'route', 'gossip', 'radio', 'tab', 'achievement', 'solve',
      'ls', 'cd', 'cat', 'tree', 'find',
      'echo', 'pwd', 'whoami', 'hostname', 'date', 'uname', 'env', 'printenv',
      'wc', 'head', 'tail', 'grep', 'which', 'man', 'history',
    ];
  }

  private print(lines: TerminalLine[]): void {
    if (this.captureBuffer !== null) {
      for (const line of lines) this.captureBuffer.push(line.text);
      return;
    }
    this.history.update((h) => [...h, ...lines]);
  }

  private printLine(text: string, type: TerminalLine['type'] = 'output'): void {
    if (type === 'error') this.hadError = true;
    this.print([{ text, type }]);
  }

  protected executeCommand(cmdStr: string) {
    const trimmed = cmdStr.trim();
    const expanded = this.expandHistory(trimmed);
    this.history.update((h) => [...h, { text: '', type: 'input', prompt: this.promptString(), command: expanded }]);
    this.simState.commandHistory.update((h) => [...h, expanded]);
    this.historyIndex = -1;
    this.inputValue.set('');
    for (const chain of this.splitChains(expanded)) {
      this.runChain(chain);
    }
  }

  private expandHistory(input: string): string {
    if (input === '!!') {
      const hist = this.simState.commandHistory();
      if (hist.length === 0) return input;
      return hist[hist.length - 1];
    }
    const m = /^!(\d+)$/.exec(input);
    if (m) {
      const idx = Number(m[1]) - 1;
      const hist = this.simState.commandHistory();
      if (idx >= 0 && idx < hist.length) return hist[idx];
    }
    return input;
  }

  private splitChains(input: string): string[] {
    return input.split(';').map((c) => c.trim()).filter((c) => c.length > 0);
  }

  private runChain(chain: string): void {
    const parts = this.splitAndChain(chain);
    for (const part of parts) {
      if (part.op === '&&' && this.lastExitCode !== 0) break;
      this.runCommand(part.cmd);
    }
  }

  private lastExitCode = 0;

  private splitAndChain(chain: string): { cmd: string; op: string }[] {
    const tokens = chain.split('&&');
    const results: { cmd: string; op: string }[] = [];
    tokens.forEach((t, i) => {
      const trimmed = t.trim();
      if (trimmed.length > 0) results.push({ cmd: trimmed, op: i === 0 ? '' : '&&' });
    });
    return results;
  }

  private runCommand(cmdStr: string): void {
    this.hadError = false;
    const redirect = this.parseRedirect(cmdStr);
    const cmdWithoutRedirect = redirect.cmd;
    const stages = this.splitPipes(cmdWithoutRedirect);
    let stdin: string | null = null;
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i].trim();
      const isLast = i === stages.length - 1;
      this.pipedInput = stdin;
      if (isLast && redirect.target) {
        this.captureBuffer = [];
        this.executeStage(stage);
        const captured = this.captureBuffer.join('\n');
        this.captureBuffer = null;
        const content = captured.length > 0 ? `${captured}\n` : '';
        const w = this.vfs.write(redirect.target, content, redirect.append);
        if (!w.ok) {
          this.printLine(w.error!, 'error');
        }
      } else if (!isLast) {
        this.captureBuffer = [];
        this.executeStage(stage);
        stdin = this.captureBuffer.join('\n');
        this.captureBuffer = null;
      } else {
        this.executeStage(stage);
      }
      this.pipedInput = null;
    }
    this.lastExitCode = this.hadError ? 1 : 0;
  }

  private parseRedirect(cmdStr: string): { cmd: string; target: string | null; append: boolean } {
    const appendMatch = /^(.*?)\s*>>\s*(\S+)\s*$/.exec(cmdStr);
    if (appendMatch) return { cmd: appendMatch[1].trim(), target: appendMatch[2], append: true };
    const overMatch = /^(.*?)\s*>\s*(\S+)\s*$/.exec(cmdStr);
    if (overMatch) return { cmd: overMatch[1].trim(), target: overMatch[2], append: false };
    return { cmd: cmdStr, target: null, append: false };
  }

  private splitPipes(cmdStr: string): string[] {
    const result: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < cmdStr.length; i++) {
      const ch = cmdStr[i];
      if (ch === "'" && !inDouble) inSingle = !inSingle;
      else if (ch === '"' && !inSingle) inDouble = !inDouble;
      else if (ch === '|' && !inSingle && !inDouble) {
        result.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    result.push(current);
    return result;
  }

  private executeStage(stageStr: string): void {
    const parsed = CommandParser.parse(stageStr);
    if (parsed.command === '' ) return;
    if (parsed.flags['help'] === true && parsed.command !== 'help') {
      const usage = HELP_USAGE[parsed.command];
      if (usage) { this.printLine(usage); return; }
    }
    this.dispatch(parsed);
  }

  private dispatch(p: ParseResult): void {
    switch (p.command) {
      case 'help': this.cmdHelp(p.flags['help'] === true); break;
      case 'about': this.cmdAbout(); break;
      case 'skills': this.cmdSkills(); break;
      case 'projects': this.cmdProjects(p.args[0]); break;
      case 'contact': this.cmdContact(); break;
      case 'theme': this.cmdTheme(p.args[0]); break;
      case 'clear': this.history.set([]); break;
      case 'reboot': this.cmdReboot(); break;
      case 'sudo': this.printLine('deniz is not in the sudoers file. This incident will be reported.', 'error'); break;
      case 'ls': this.cmdLs(p.flags, p.args); break;
      case 'cd': this.cmdCd(p.args[0]); break;
      case 'cat': this.cmdCat(p.flags, p.args); break;
      case 'tree': this.cmdTree(p.args[0]); break;
      case 'find': this.cmdFind(p.flags, p.args); break;
      case 'echo': this.cmdEcho(p.flags, p.args); break;
      case 'pwd': this.cmdPwd(); break;
      case 'whoami': this.printLine('deniz'); break;
      case 'hostname': this.printLine('portfolio'); break;
      case 'date': this.printLine(new Date().toUTCString()); break;
      case 'uname': this.cmdUname(p.flags); break;
      case 'env': this.cmdEnv(); break;
      case 'printenv': this.cmdEnv(); break;
      case 'wc': this.cmdWc(p.flags, p.args); break;
      case 'head': this.cmdHead(p.flags, p.args); break;
      case 'tail': this.cmdTail(p.flags, p.args); break;
      case 'grep': this.cmdGrep(p.args); break;
      case 'which': this.cmdWhich(p.args); break;
      case 'man': this.cmdMan(p.args[0]); break;
      case 'history': this.cmdHistory(); break;
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

  private cmdHelp(showUsage: boolean): void {
    if (showUsage) {
      this.print([
        { text: 'Usage: help [command]', type: 'output' },
        { text: 'Show help for a command. Without args, lists all commands.', type: 'output' },
      ]);
      return;
    }
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
      { text: '  ls [-l|-a|-la] [path...] / cd [-|~|path] / cat [-n] file... / tree [path]', type: 'output' },
      { text: '  find [path] [-name PATTERN] [-type f|d]', type: 'output' },
      { text: '  echo [text] / pwd / whoami / hostname / date / uname [-a]', type: 'output' },
      { text: '  env / printenv / wc [-l] file / head [-n N] file / tail [-n N] file', type: 'output' },
      { text: '  grep PATTERN file / which command / man command / history', type: 'output' },
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

  private cmdLs(flags: Record<string, string | boolean>, args: string[]): void {
    const longFmt = flags['l'] === true || flags['la'] === true || flags['al'] === true;
    const showAll = flags['a'] === true || flags['la'] === true || flags['al'] === true;
    const paths = args.length > 0 ? args : [undefined as string | undefined];
    const multi = paths.length > 1;
    let firstOutput = true;
    for (const p of paths) {
      const guard = p !== undefined ? this.vfs.read(p) : { ok: true };
      if (!guard.ok) { this.printLine(`ls: cannot access '${p}': ${guard.error}`, 'error'); continue; }
      const nodes = this.vfs.lsNodes(p);
      if (nodes.length === 0 && !multi) {
        if (p !== undefined) this.printLine(`ls: cannot access '${p}': no such directory`, 'error');
        continue;
      }
      if (multi && !firstOutput) { this.printLine(''); }
      if (multi) { this.printLine(`${p ?? '.'}:`); }
      firstOutput = false;
      let visible = nodes;
      if (!showAll) {
        visible = nodes.filter((n) => !n.name.startsWith('.'));
      }
      if (longFmt) {
        for (const n of visible) {
          const perms = n.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--';
          const size = n.type === 'dir' ? 4096 : (n.content?.length ?? 0);
          this.printLine(`${perms} 2 deniz deniz ${String(size).padStart(5)} Jul 20 12:00 ${n.name}${n.type === 'dir' ? '/' : ''}`);
        }
      } else {
        const names = visible.map((n) => (n.type === 'dir' ? `${n.name}/` : n.name));
        if (names.length > 0) this.printLine(names.join('   '));
      }
    }
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

  private cmdCat(flags: Record<string, string | boolean>, args: string[]): void {
    if (args.length === 0) {
      if (this.pipedInput !== null) {
        const content = this.pipedInput;
        const showNum = flags['n'] === true;
        if (showNum) {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            this.printLine(`${String(i + 1).padStart(6)}\t${lines[i]}`);
          }
        } else {
          this.printLine(content);
        }
        return;
      }
      this.printLine('cat: missing file operand', 'error');
      return;
    }
    const showNum = flags['n'] === true;
    let triggeredSecret = false;
    for (const path of args) {
      const guard = this.vfs.read(path);
      if (!guard.ok) { this.printLine(guard.error!, 'error'); continue; }
      const r = this.vfs.cat(path);
      if (!r.ok) { this.printLine(r.error!, 'error'); continue; }
      const content = r.output ?? '';
      if (showNum) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          this.printLine(`${String(i + 1).padStart(6)}\t${lines[i]}`);
        }
      } else {
        this.printLine(content);
      }
      if (path.includes('.secrets')) {
        triggeredSecret = true;
      }
    }
    if (triggeredSecret) {
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

  private cmdFind(flags: Record<string, string | boolean>, args: string[]): void {
    const startPos = args.find((a) => !a.startsWith('-') && !a.includes('=')) ?? '.';
    const nameVal = typeof flags['name'] === 'string' ? flags['name'] : undefined;
    const typeVal = typeof flags['type'] === 'string' ? flags['type'] : undefined;
    if (!nameVal && !typeVal) {
      const results = this.vfs.find(startPos === '.' ? '' : startPos);
      if (results.length === 0) { this.printLine('find: no matches', 'system'); return; }
      this.printLine(results.join('\n'));
      return;
    }
    const opts: { name?: string; type?: 'f' | 'd' } = {};
    if (nameVal) opts.name = nameVal;
    if (typeVal === 'f' || typeVal === 'd') opts.type = typeVal;
    const results = this.vfs.findAt(startPos, opts);
    if (results.length === 0) { this.printLine('', 'system'); return; }
    this.printLine(results.join('\n'));
  }

  private expandVars(text: string): string {
    return text.replace(/\$(\w+)/g, (_, name: string) => {
      if (name === 'PWD') return this.vfs.cwd();
      return ENV_VARS[name] ?? `$${name}`;
    });
  }

  private cmdEcho(flags: Record<string, string | boolean>, args: string[]): void {
    const text = args.map((a) => this.expandVars(a)).join(' ');
    if (flags['n'] === true) {
      this.history.update((h) => [...h, { text, type: 'output' }]);
    } else {
      this.printLine(text);
    }
  }

  private cmdPwd(): void {
    this.printLine(this.vfs.cwd());
  }

  private cmdUname(flags: Record<string, string | boolean>): void {
    if (flags['a'] === true) {
      this.printLine('DenizOS portfolio 22.0 #1 SMP x86_64 GNU/Linux');
    } else {
      this.printLine('DenizOS');
    }
  }

  private cmdEnv(): void {
    this.print([
      { text: `HOME=${ENV_VARS['HOME']}`, type: 'output' },
      { text: `USER=${ENV_VARS['USER']}`, type: 'output' },
      { text: `PWD=${this.vfs.cwd()}`, type: 'output' },
      { text: `SHELL=${ENV_VARS['SHELL']}`, type: 'output' },
      { text: `PATH=${ENV_VARS['PATH']}`, type: 'output' },
      { text: `PS1=${ENV_VARS['PS1']}`, type: 'output' },
    ]);
  }

  private cmdWc(flags: Record<string, string | boolean>, args: string[]): void {
    let content: string;
    let fileLabel = '';
    if (args.length === 0 || (args.length === 1 && this.pipedInput !== null)) {
      if (this.pipedInput === null) {
        this.printLine('wc: missing file operand', 'error');
        return;
      }
      content = this.pipedInput;
    } else {
      const file = args[0];
      fileLabel = ` ${file}`;
      const guard = this.vfs.read(file);
      if (!guard.ok) { this.printLine(`wc: ${file}: ${guard.error}`, 'error'); return; }
      const r = this.vfs.cat(file);
      if (!r.ok) { this.printLine(`wc: ${file}: ${r.error}`, 'error'); return; }
      content = r.output ?? '';
    }
    const lines = content === '' ? 0 : content.split('\n').length;
    const words = content.trim().split(/\s+/).filter((w) => w.length > 0).length;
    const chars = content.length;
    if (flags['l'] === true) {
      this.printLine(`${lines}${fileLabel}`);
    } else {
      this.printLine(`${lines} ${words} ${chars}${fileLabel}`);
    }
  }

  private cmdHead(flags: Record<string, string | boolean>, args: string[]): void {
    let n = 10;
    let file: string | undefined;
    if (flags['n'] === true) {
      const numArg = args.find((a) => isNumeric(a));
      if (numArg !== undefined) {
        n = Number(numArg);
        file = args.find((a) => a !== numArg && !a.startsWith('-'));
      } else {
        file = args.find((a) => !a.startsWith('-'));
      }
    } else {
      file = args.find((a) => !a.startsWith('-'));
    }
    let content: string;
    if (!file) {
      if (this.pipedInput === null) { this.printLine('head: missing file operand', 'error'); return; }
      content = this.pipedInput;
    } else {
      const guard = this.vfs.read(file);
      if (!guard.ok) { this.printLine(`head: cannot open '${file}' for reading: ${guard.error}`, 'error'); return; }
      const r = this.vfs.cat(file);
      if (!r.ok) { this.printLine(`head: ${file}: ${r.error}`, 'error'); return; }
      content = r.output ?? '';
    }
    const lines = content.split('\n');
    this.printLine(lines.slice(0, n).join('\n'));
  }

  private cmdTail(flags: Record<string, string | boolean>, args: string[]): void {
    let n = 10;
    let file: string | undefined;
    if (flags['n'] === true) {
      const numArg = args.find((a) => isNumeric(a));
      if (numArg !== undefined) {
        n = Number(numArg);
        file = args.find((a) => a !== numArg && !a.startsWith('-'));
      } else {
        file = args.find((a) => !a.startsWith('-'));
      }
    } else {
      file = args.find((a) => !a.startsWith('-'));
    }
    let content: string;
    if (!file) {
      if (this.pipedInput === null) { this.printLine('tail: missing file operand', 'error'); return; }
      content = this.pipedInput;
    } else {
      const guard = this.vfs.read(file);
      if (!guard.ok) { this.printLine(`tail: cannot open '${file}' for reading: ${guard.error}`, 'error'); return; }
      const r = this.vfs.cat(file);
      if (!r.ok) { this.printLine(`tail: ${file}: ${r.error}`, 'error'); return; }
      content = r.output ?? '';
    }
    const lines = content.split('\n');
    this.printLine(lines.slice(-n).join('\n'));
  }

  private cmdGrep(args: string[]): void {
    const pattern = args[0];
    if (!pattern) { this.printLine('grep: missing pattern', 'error'); return; }
    let content: string;
    const file = args[1];
    if (!file) {
      if (this.pipedInput === null) { this.printLine('grep: missing file operand', 'error'); return; }
      content = this.pipedInput;
    } else {
      const guard = this.vfs.read(file);
      if (!guard.ok) { this.printLine(`grep: ${file}: ${guard.error}`, 'error'); return; }
      const r = this.vfs.cat(file);
      if (!r.ok) { this.printLine(`grep: ${file}: ${r.error}`, 'error'); return; }
      content = r.output ?? '';
    }
    const lines = content.split('\n').filter((l) => l.includes(pattern));
    if (lines.length === 0) { this.printLine('', 'system'); return; }
    this.printLine(lines.join('\n'));
  }

  private cmdWhich(args: string[]): void {
    if (args.length === 0) { this.printLine('which: missing operand', 'error'); return; }
    for (const cmd of args) {
      const node = this.vfs.resolve(`/usr/bin/${cmd}`);
      if (node && node.type === 'file') {
        this.printLine(`/usr/bin/${cmd}`);
      } else {
        this.printLine(`which: no ${cmd} in (/usr/bin:/bin)`, 'error');
      }
    }
  }

  private cmdMan(cmd?: string): void {
    if (!cmd) { this.printLine('What manual page do you want?', 'error'); return; }
    const page = MAN_PAGES[cmd];
    if (page) {
      this.printLine(page);
    } else {
      this.printLine(`No manual entry for ${cmd}`, 'error');
    }
  }

  private cmdHistory(): void {
    const hist = this.simState.commandHistory();
    if (hist.length === 0) { this.printLine('', 'system'); return; }
    const lines: TerminalLine[] = hist.map((cmd, i) => ({ text: `${String(i + 1).padStart(5)}  ${cmd}`, type: 'output' as const }));
    this.print(lines);
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
