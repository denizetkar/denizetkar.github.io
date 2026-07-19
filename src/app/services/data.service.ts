import { Injectable, signal } from '@angular/core';

export interface Project {
  name: string;
  description: string;
  url: string;
  tech: string[];
  details: string[];
}

export interface Milestone {
  year: string;
  title: string;
  description: string;
  altitude: number; // For the rocket simulator
}

export interface SkillGroup {
  category: string;
  skills: string[];
}

@Injectable({
  providedIn: 'root',
})
export class DataService {
  public readonly isCrashed = signal(false);
  public readonly isInfected = signal(false);
  public readonly name = signal('Deniz Etkar');
  public readonly title = signal('Software Engineer & IT Consultant');
  public readonly company = signal('TNG Technology Consulting GmbH');
  public readonly location = signal('Munich, Germany');
  public readonly email = signal('25102252+denizetkar@users.noreply.github.com');
  public readonly githubUrl = signal('https://github.com/denizetkar');
  public readonly linkedinUrl = signal('https://linkedin.com/in/deniz-etkar-placeholder');

  public readonly bio = signal(
    'I am a passionate software engineer and consultant based in Munich. ' +
    'I specialize in low-level networking, high-performance C++, mobile and frontend development. ' +
    'I have a strong love for building highly optimized systems, exploring modern browser standards, ' +
    'and creating reactive single-page applications using Angular.'
  );

  public readonly skills = signal<SkillGroup[]>([
    {
      category: 'Languages',
      skills: ['C++', 'TypeScript', 'JavaScript', 'Python', 'C', 'HTML5/CSS3'],
    },
    {
      category: 'Frontend & Frameworks',
      skills: ['Angular 22 (Signals, Deferrable Views)', 'RxJS', 'SCSS', 'Vite', 'Node.js'],
    },
    {
      category: 'Systems & Networking',
      skills: ['DPDK (Data Plane Development Kit)', 'Gossip Protocols', 'BLE (Bluetooth Low Energy)', 'Linux', 'Docker'],
    },
    {
      category: 'Academic & Methods',
      skills: ['Industrial Engineering (Optimization)', 'IoT Architectures', 'Algorithms & Data Structures'],
    },
  ]);

  public readonly projects = signal<Project[]>([
    {
      name: 'gossip-protocol',
      description: 'A decentralized gossip protocol agent utilizing Proof-of-Work (PoW) and trusted identity signatures.',
      url: 'https://github.com/denizetkar/gossip-protocol',
      tech: ['C++', 'Cryptography', 'Networking'],
      details: [
        'Implemented PoW-based anti-spam authentication for nodes.',
        'Uses local trusted signatures to verify node authenticity.',
        'Simulates peer discovery, epidemic spreading, and self-healing topologies.'
      ]
    },
    {
      name: 'dpdk-router',
      description: 'A high-performance Layer-3 network router leveraging DPDK for kernel-bypass packet forwarding.',
      url: 'https://github.com/denizetkar/dpdk-router',
      tech: ['C', 'DPDK', 'Computer Networks', 'Linux'],
      details: [
        'Utilizes Data Plane Development Kit (DPDK) for high-throughput, low-latency processing.',
        'Handles ARP requests, routes IPv4 packets, and manages static/dynamic routing tables.',
        'Designed to run on bare-metal systems bypassing Linux kernel networking overhead.'
      ]
    },
    {
      name: 'walkie-talkie-app',
      description: 'An offline Android application enabling secure voice communication over Bluetooth Low Energy.',
      url: 'https://github.com/denizetkar/walkie-talkie-app',
      tech: ['Android', 'Kotlin', 'Bluetooth Low Energy', 'Audio Processing'],
      details: [
        'Allows direct peer-to-peer walkie-talkie functionality without internet or cellular coverage.',
        'Uses BLE advertising and scanning for discovery and payload transfer.',
        'Features raw audio streaming and custom compression to fit BLE packet size constraints.'
      ]
    },
    {
      name: 'OptimizationTools',
      description: 'A library of C++ optimization tools for resource allocation and operations research problems.',
      url: 'https://github.com/denizetkar/OptimizationTools',
      tech: ['C++', 'Linear Programming', 'Metaheuristics'],
      details: [
        'Solves complex scheduling and bin-packing problems.',
        'Implements customized genetic algorithms, simulated annealing, and branch-and-bound strategies.',
        'Highly optimized C++ templates for maximum execution speed.'
      ]
    },
    {
      name: 'TeknofestFlightSoftware',
      description: 'Archived flight computer software for the Teknofest Rocket Competition.',
      url: 'https://github.com/denizetkar/TeknofestFlightSoftware',
      tech: ['C++', 'Embedded C', 'Real-Time Operating Systems (RTOS)', 'Sensors'],
      details: [
        'Runs real-time sensor fusion algorithms (IMU, Barometer, GPS).',
        'Implements apogee detection logic and double-stage parachute deployment triggers.',
        'Includes flash-memory logging for post-flight telemetry analysis.'
      ]
    }
  ]);

  public readonly timeline = signal<Milestone[]>([
    {
      year: '2015',
      title: 'Boğaziçi University Admission',
      description: 'Started Industrial Engineering degree at Boğaziçi University, Istanbul, focusing on operations research and optimization.',
      altitude: 1500
    },
    {
      year: '2018',
      title: 'Software Engineering Project Co-Author',
      description: 'Contributed to memory-sharing apps and IoT architectures for construction industry research.',
      altitude: 3500
    },
    {
      year: '2019',
      title: 'Graduated from Boğaziçi University',
      description: 'Received B.S. in Industrial Engineering with research focus in optimization tools.',
      altitude: 5000
    },
    {
      year: '2021',
      title: 'Joined TNG Technology Consulting',
      description: 'Began work as an IT Consultant / Software Engineer at TNG in Munich, Germany.',
      altitude: 7500
    },
    {
      year: '2026',
      title: 'Exploring Future Frontiers',
      description: 'Continually designing low-level systems, high-speed routing engines, and modular reactive frontends.',
      altitude: 10000
    }
  ]);
}
