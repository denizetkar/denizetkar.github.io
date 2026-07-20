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

export interface Certification {
  name: string;
  issuer: string;
  year: string;
}

export interface Language {
  name: string;
  proficiency: string;
}

export interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  startYear: number;
  endYear: number;
  grade?: string;
  thesis?: string;
}

@Injectable({
  providedIn: 'root',
})
export class DataService {
  public readonly isCrashed = signal(false);
  public readonly isInfected = signal(false);
  public readonly name = signal('Deniz Etkar');
  public readonly title = signal('Senior Consultant');
  public readonly currentRole = signal(
    'Senior Consultant at TNG Technology Consulting GmbH (since Sep 2024)',
  );
  public readonly company = signal('TNG Technology Consulting GmbH');
  public readonly location = signal('Munich, Germany');
  public readonly email = signal('25102252+denizetkar@users.noreply.github.com');
  public readonly githubUrl = signal('https://github.com/denizetkar');
  public readonly linkedinUrl = signal('https://linkedin.com/in/deniz-etkar');

  public readonly bio = signal(
    'I am a Senior Consultant at TNG Technology Consulting in Munich, working fullstack across Python, Angular, TypeScript, and Kotlin/Java. ' +
    'My academic and personal projects span low-level networking (DPDK), embedded flight software, and decentralized protocols — the playground for the interactive widgets on this site.',
  );

  public readonly skills = signal<SkillGroup[]>([
    {
      category: 'Languages',
      skills: ['C++', 'TypeScript', 'JavaScript', 'Python', 'C', 'Go', 'Kotlin', 'Java', 'HTML5/CSS3'],
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

  public readonly certifications = signal<Certification[]>([
    {
      name: 'iSAQB Certified Professional for Software Architecture - Foundation Level (CPSA-F)',
      issuer: 'iSAQB',
      year: '2026',
    },
  ]);

  public readonly languages = signal<Language[]>([
    { name: 'Turkish', proficiency: 'Native' },
    { name: 'English', proficiency: 'Fluent' },
    { name: 'German', proficiency: 'B1' },
  ]);

  public readonly education = signal<EducationEntry[]>([
    {
      institution: 'Technical University of Munich',
      degree: 'M.Sc.',
      field: 'Informatics',
      startYear: 2020,
      endYear: 2022,
      grade: '1.3',
      thesis: 'Domain Adaptive Online Defect Classification for Wire Arc Additive Manufacturing',
    },
    {
      institution: 'Boğaziçi University',
      degree: 'B.Sc.',
      field: 'Industrial Engineering',
      startYear: 2013,
      endYear: 2019,
      grade: '3.68/4.00',
    },
    {
      institution: 'Boğaziçi University',
      degree: 'B.Sc.',
      field: 'Computer Engineering',
      startYear: 2015,
      endYear: 2019,
      grade: '3.68/4.00',
    },
  ]);

  public readonly projects = signal<Project[]>([
    {
      name: 'gossip-protocol',
      description: 'A decentralized gossip protocol agent utilizing Proof-of-Work (PoW) and trusted identity signatures.',
      url: 'https://github.com/denizetkar/gossip-protocol',
      tech: ['Go', 'Cryptography', 'Networking'],
      details: [
        'Implemented PoW-based anti-spam authentication for nodes.',
        'Uses local trusted signatures to verify node authenticity.',
        'Simulates peer discovery, epidemic spreading, and self-healing topologies.',
        'University distributed-systems project (Sep 2020), co-authored with dangerfish96. Written in Go.',
      ],
    },
    {
      name: 'dpdk-router',
      description: 'A high-performance Layer-3 network router leveraging DPDK for kernel-bypass packet forwarding.',
      url: 'https://github.com/denizetkar/dpdk-router',
      tech: ['C', 'DPDK', 'Computer Networks', 'Linux'],
      details: [
        'Utilizes Data Plane Development Kit (DPDK) for high-throughput, low-latency processing.',
        'Handles ARP requests, routes IPv4 packets, and manages static/dynamic routing tables.',
        'Designed to run on bare-metal systems bypassing Linux kernel networking overhead.',
        'Course project built on the TUM ININET framework (by gallenmu/emmericp); custom routing logic and DPDK integration are my own contributions (Jan 2021).',
      ],
    },
    {
      name: 'walkie-talkie-app',
      description: 'An offline Android application enabling secure voice communication over Bluetooth Low Energy.',
      url: 'https://github.com/denizetkar/walkie-talkie-app',
      tech: ['Android', 'Kotlin', 'Bluetooth Low Energy', 'Audio Processing'],
      details: [
        'Allows direct peer-to-peer walkie-talkie functionality without internet or cellular coverage.',
        'Uses BLE advertising and scanning for discovery and payload transfer.',
        'Audio is Opus-encoded at 48 kHz via a Rust audio engine (Oboe/AAudio) with a jitter buffer for mesh stability.',
      ],
    },
    {
      name: 'OptimizationTools',
      description: 'A library of C++ optimization tools for resource allocation and operations research problems.',
      url: 'https://github.com/denizetkar/OptimizationTools',
      tech: ['C++', 'Linear Programming', 'Metaheuristics'],
      details: [
        'Solves complex scheduling and bin-packing problems.',
        'Implements customized genetic algorithms, simulated annealing, and branch-and-bound strategies.',
        'C++ library of optimization solvers (genetic algorithm, simplex, PSO) developed during a 2017 industry internship at SC3 Electronics, Istanbul.',
      ],
    },
    {
      name: 'TeknofestFlightSoftware',
      description: 'Archived flight computer software for the Teknofest Rocket Competition.',
      url: 'https://github.com/denizetkar/TeknofestFlightSoftware',
      tech: ['C++', 'Embedded C', 'Real-Time Operating Systems (RTOS)', 'Sensors'],
      details: [
        'Runs real-time sensor fusion algorithms (IMU, Barometer, GPS).',
        'Implements apogee detection logic and double-stage parachute deployment triggers.',
        'Archived (May 2020). Runs on STM32F103C8T6 with MPU9250 IMU, NEO-6M GPS, and 4× MG995 fin servos. Implements Madgwick AHRS sensor fusion and quaternion PID fin control.',
      ],
    },
  ]);

  public readonly timeline = signal<Milestone[]>([
    {
      year: '2013',
      title: 'Boğaziçi University Admission',
      description: 'Started B.Sc. in Industrial Engineering at Boğaziçi University, Istanbul.',
      altitude: 1000,
    },
    {
      year: '2015',
      title: 'Second Major & Siemens Internship',
      description: 'Added Computer Engineering as a second B.Sc. major at Boğaziçi; completed a Siemens internship.',
      altitude: 2000,
    },
    {
      year: '2017',
      title: 'SC3 Electronics Internship',
      description: 'Industry internship at SC3 Electronics, Istanbul — developed the C++ OptimizationTools library (genetic algorithm, simplex, PSO).',
      altitude: 3000,
    },
    {
      year: '2018',
      title: 'ING & Second Siemens Internship',
      description: 'Internships at ING Bank and a second engagement at Siemens, plus TUM tutoring work alongside studies.',
      altitude: 4000,
    },
    {
      year: '2019',
      title: 'Boğaziçi Double B.Sc. Graduation',
      description: 'Graduated from Boğaziçi University with B.Sc. degrees in both Industrial Engineering and Computer Engineering (GPA 3.68/4.00).',
      altitude: 5000,
    },
    {
      year: '2020',
      title: 'TUM M.Sc. Informatics Begins',
      description: 'Began M.Sc. Informatics at the Technical University of Munich; co-authored the Go gossip-protocol project.',
      altitude: 6500,
    },
    {
      year: '2021',
      title: 'DPDK Router & TUM Tutoring',
      description: 'Built the DPDK router on the TUM ININET framework; continued tutoring at TUM.',
      altitude: 8000,
    },
    {
      year: '2022',
      title: 'TUM M.Sc. Informatics',
      description: 'Received M.Sc. in Informatics from TUM (grade 1.3); thesis on Domain Adaptive Online Defect Classification for Wire Arc Additive Manufacturing.',
      altitude: 9000,
    },
    {
      year: '2024',
      title: 'Senior Consultant at TNG',
      description: 'Promoted to Senior Consultant at TNG Technology Consulting GmbH in Munich (since Sep 2024), after joining as Software Consultant in Oct 2022.',
      altitude: 10000,
    },
  ]);
}
