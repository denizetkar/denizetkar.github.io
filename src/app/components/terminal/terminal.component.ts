import { Component, ElementRef, ViewChild, inject, signal, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { ThemeService, AppTheme } from '../../services/theme.service';

interface TerminalLine {
  text: string;
  type: 'input' | 'output' | 'error' | 'success' | 'system';
  isHtml?: boolean;
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

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('cmdInput') private cmdInput!: ElementRef;

  protected readonly inputValue = signal('');
  protected readonly history = signal<TerminalLine[]>([
    { text: 'Welcome to Deniz\'s Interactive CLI (v1.0.0).', type: 'system' },
    { text: 'Type "help" for a list of available commands.', type: 'system' },
    { text: '', type: 'output' }
  ]);

  private commandHistory: string[] = [];
  private historyIndex = -1;

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  protected focusInput() {
    this.cmdInput.nativeElement.focus();
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  protected handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const cmd = this.inputValue().trim();
      if (cmd) {
        this.executeCommand(cmd);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.commandHistory.length > 0) {
        if (this.historyIndex === -1) {
          this.historyIndex = this.commandHistory.length - 1;
        } else if (this.historyIndex > 0) {
          this.historyIndex--;
        }
        this.inputValue.set(this.commandHistory[this.historyIndex]);
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.commandHistory.length > 0) {
        if (this.historyIndex !== -1 && this.historyIndex < this.commandHistory.length - 1) {
          this.historyIndex++;
          this.inputValue.set(this.commandHistory[this.historyIndex]);
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
    const commands = ['help', 'about', 'skills', 'projects', 'theme', 'gossip', 'clear', 'reboot', 'sudo', 'contact'];
    const matches = commands.filter(c => c.startsWith(input));

    if (matches.length === 1) {
      this.inputValue.set(matches[0]);
    } else if (matches.length > 1) {
      this.history.update(h => [
        ...h,
        { text: `deniz@portfolio:~$ ${this.inputValue()}`, type: 'input' },
        { text: matches.join('   '), type: 'system' }
      ]);
    }
  }

  private executeCommand(cmdStr: string) {
    this.history.update(h => [...h, { text: `deniz@portfolio:~$ ${cmdStr}`, type: 'input' }]);
    this.commandHistory.push(cmdStr);
    this.historyIndex = -1;
    this.inputValue.set('');

    const args = cmdStr.split(' ');
    const command = args[0].toLowerCase();
    const subCommand = args[1]?.toLowerCase();

    switch (command) {
      case 'help':
        this.printHelp();
        break;
      case 'about':
        this.printAbout();
        break;
      case 'skills':
        this.printSkills();
        break;
      case 'projects':
        this.printProjects(subCommand);
        break;
      case 'theme':
        this.setThemeCommand(args[1]);
        break;
      case 'gossip':
        this.handleGossipCommand(args);
        break;
      case 'clear':
        this.history.set([]);
        break;
      case 'reboot':
        this.handleReboot();
        break;
      case 'contact':
        this.printContact();
        break;
      case 'sudo':
        this.history.update(h => [
          ...h,
          { text: 'deniz is not in the sudoers file. This incident will be reported.', type: 'error' }
        ]);
        break;
      default:
        this.history.update(h => [
          ...h,
          { text: `Command not found: ${command}. Type "help" for a list of commands.`, type: 'error' }
        ]);
    }
  }

  private printHelp() {
    this.history.update(h => [
      ...h,
      { text: 'Available commands:', type: 'success' },
      { text: '  about             - Learn who Deniz is', type: 'output' },
      { text: '  skills            - List core technical areas and keywords', type: 'output' },
      { text: '  projects          - List GitHub repositories and detail logs', type: 'output' },
      { text: '  projects [name]   - Show specific project architectural details', type: 'output' },
      { text: '  theme [type]      - Switch styling (dark, cyberpunk, terminal)', type: 'output' },
      { text: '  gossip --infect   - Trigger peer-to-peer data scrambler experiment', type: 'output' },
      { text: '  contact           - Display email, linkedin, and github links', type: 'output' },
      { text: '  reboot            - Soft-reset hardware components and system states', type: 'output' },
      { text: '  clear             - Clear terminal logs', type: 'output' }
    ]);
  }

  private printAbout() {
    const bio = this.dataService.bio();
    this.history.update(h => [
      ...h,
      { text: `Profile: Deniz Etkar`, type: 'success' },
      { text: `Title: ${this.dataService.title()} at ${this.dataService.company()}`, type: 'output' },
      { text: `Location: ${this.dataService.location()}`, type: 'output' },
      { text: bio, type: 'output' }
    ]);
  }

  private printSkills() {
    const skillGroups = this.dataService.skills();
    const lines: TerminalLine[] = [{ text: 'Technical Expertise Matrix:', type: 'success' }];
    
    skillGroups.forEach(group => {
      lines.push({ text: `[${group.category}]`, type: 'system' });
      lines.push({ text: `  ${group.skills.join(', ')}`, type: 'output' });
    });

    this.history.update(h => [...h, ...lines]);
  }

  private printProjects(projName?: string) {
    const projects = this.dataService.projects();

    if (!projName) {
      const lines: TerminalLine[] = [
        { text: 'Active Repositories:', type: 'success' },
        ...projects.map(p => ({
          text: `• ${p.name} - ${p.description}`,
          type: 'output' as const
        })),
        { text: 'Type "projects [name]" to read specific architectural logs.', type: 'system' }
      ];
      this.history.update(h => [...h, ...lines]);
      return;
    }

    const matched = projects.find(p => p.name.toLowerCase() === projName.toLowerCase());
    if (!matched) {
      this.history.update(h => [
        ...h,
        { text: `Project "${projName}" not found. Type "projects" for a complete list.`, type: 'error' }
      ]);
      return;
    }

    const detailLines: TerminalLine[] = [
      { text: `Project: ${matched.name}`, type: 'success' },
      { text: `URL: ${matched.url}`, type: 'system' },
      { text: `Tech Stack: ${matched.tech.join(', ')}`, type: 'output' },
      { text: 'Implementation Details:', type: 'system' },
      ...matched.details.map(d => ({ text: `  - ${d}`, type: 'output' as const }))
    ];
    this.history.update(h => [...h, ...detailLines]);
  }

  private setThemeCommand(themeArg?: string) {
    if (!themeArg) {
      this.history.update(h => [
        ...h,
        { text: 'Please specify a theme: theme dark | cyberpunk | terminal', type: 'error' }
      ]);
      return;
    }

    const t = themeArg.toLowerCase() as AppTheme;
    if (t === 'dark' || t === 'cyberpunk' || t === 'terminal') {
      this.themeService.setTheme(t);
      this.history.update(h => [
        ...h,
        { text: `Theme successfully updated to "${t}".`, type: 'success' }
      ]);
    } else {
      this.history.update(h => [
        ...h,
        { text: `Unknown theme: ${themeArg}. Try: dark, cyberpunk, terminal`, type: 'error' }
      ]);
    }
  }

  private handleGossipCommand(args: string[]) {
    if (args.includes('--infect')) {
      this.dataService.isInfected.set(true);
      this.history.update(h => [
        ...h,
        { text: 'ALERT: Injecting gossip epidemic. Node scrambling sequence initiated...', type: 'error' },
        { text: 'Syncing keys across network layers...', type: 'system' }
      ]);
      
      // Auto cure after 8 seconds
      setTimeout(() => {
        if (this.dataService.isInfected()) {
          this.dataService.isInfected.set(false);
          this.history.update(h => [
            ...h,
            { text: 'Gossip protocol convergence complete. All nodes synchronized and decrypted.', type: 'success' }
          ]);
        }
      }, 8000);
    } else {
      this.history.update(h => [
        ...h,
        { text: 'Gossip command requires flags. Try: "gossip --infect"', type: 'error' }
      ]);
    }
  }

  private handleReboot() {
    this.dataService.isCrashed.set(false);
    this.dataService.isInfected.set(false);
    this.history.set([
      { text: 'Hardware reset signal sent.', type: 'system' },
      { text: 'Loading kernel modules...', type: 'system' },
      { text: 'DPDK router restarted. Network links clear.', type: 'success' },
      { text: 'Type "help" for interactive console commands.', type: 'system' }
    ]);
  }

  private printContact() {
    this.history.update(h => [
      ...h,
      { text: 'Get in Touch:', type: 'success' },
      { text: `  Email:    ${this.dataService.email()}`, type: 'output' },
      { text: `  GitHub:   ${this.dataService.githubUrl()}`, type: 'output' },
      { text: `  LinkedIn: ${this.dataService.linkedinUrl()}`, type: 'output' }
    ]);
  }
}
