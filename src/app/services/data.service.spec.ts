import { TestBed } from '@angular/core/testing';
import { DataService, Project, Milestone, SkillGroup, Certification, Language, EducationEntry } from './data.service';

describe('DataService', () => {
  let service: DataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DataService);
  });

  it('is provided at the root injector', () => {
    expect(service).toBeInstanceOf(DataService);
  });

  it('exposes the verified display name and senior title', () => {
    expect(service.name()).toBe('Deniz Etkar');
    expect(service.title()).toBe('Senior Consultant');
  });

  it('exposes the current role string tied to TNG since Sep 2024', () => {
    expect(service.currentRole()).toBe(
      'Senior Consultant at TNG Technology Consulting GmbH (since Sep 2024)',
    );
  });

  it('exposes the verified LinkedIn URL (not the placeholder)', () => {
    expect(service.linkedinUrl()).toBe('https://linkedin.com/in/deniz-etkar');
  });

  it('exposes the rewritten bio mentioning TNG and the fullstack stack', () => {
    const bio = service.bio();
    expect(bio).toContain('Senior Consultant at TNG Technology Consulting');
    expect(bio).toContain('Python');
    expect(bio).toContain('Angular');
    expect(bio).toContain('DPDK');
  });

  it('exposes verified certifications including iSAQB CPSA-F', () => {
    const certs = service.certifications();
    expect(certs).toHaveLength(1);
    expect(certs[0].name).toBe(
      'iSAQB Certified Professional for Software Architecture - Foundation Level (CPSA-F)',
    );
    expect(certs[0].issuer).toBe('iSAQB');
    expect(certs[0].year).toBe('2026');
  });

  it('exposes verified languages with proficiency', () => {
    expect(service.languages()).toEqual([
      { name: 'Turkish', proficiency: 'Native' },
      { name: 'English', proficiency: 'Fluent' },
      { name: 'German', proficiency: 'B1' },
    ]);
  });

  it('exposes verified education entries with TUM M.Sc. and the two Boğaziçi B.Sc. degrees', () => {
    expect(service.education()).toEqual([
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
  });

  it('corrects the gossip-protocol project to Go with the dangerfish96 co-author detail', () => {
    const gossip = service.projects().find((p) => p.name === 'gossip-protocol');
    expect(gossip).toBeDefined();
    expect(gossip!.tech).toContain('Go');
    expect(gossip!.tech).not.toContain('C++');
    expect(gossip!.details).toEqual(
      expect.arrayContaining([
        'University distributed-systems project (Sep 2020), co-authored with dangerfish96. Written in Go.',
      ]),
    );
  });

  it('keeps dpdk-router in C and adds the TUM ININET framework attribution detail', () => {
    const router = service.projects().find((p) => p.name === 'dpdk-router');
    expect(router).toBeDefined();
    expect(router!.tech).toContain('C');
    expect(router!.details).toEqual(
      expect.arrayContaining([
        'Course project built on the TUM ININET framework (by gallenmu/emmericp); custom routing logic and DPDK integration are my own contributions (Jan 2021).',
      ]),
    );
  });

  it('replaces raw-audio streaming note on walkie-talkie-app with the Opus 48 kHz detail', () => {
    const walkie = service.projects().find((p) => p.name === 'walkie-talkie-app');
    expect(walkie).toBeDefined();
    const joined = walkie!.details.join('\n');
    expect(joined).not.toContain('raw audio streaming');
    expect(joined).toContain('Opus-encoded at 48 kHz');
    expect(joined).toContain('Rust audio engine');
  });

  it('attributes OptimizationTools to the 2017 SC3 Electronics internship', () => {
    const opt = service.projects().find((p) => p.name === 'OptimizationTools');
    expect(opt).toBeDefined();
    const joined = opt!.details.join('\n');
    expect(joined).not.toContain('Highly optimized C++ templates');
    expect(joined).toContain('2017 industry internship at SC3 Electronics, Istanbul');
  });

  it('rewrites the TeknofestFlightSoftware detail to the archived hardware spec', () => {
    const tek = service.projects().find((p) => p.name === 'TeknofestFlightSoftware');
    expect(tek).toBeDefined();
    const joined = tek!.details.join('\n');
    expect(joined).not.toContain('flash-memory logging');
    expect(joined).toContain('Archived (May 2020)');
    expect(joined).toContain('STM32F103C8T6');
    expect(joined).toContain('Madgwick AHRS');
  });

  it('preserves the Project interface shape (name, description, url, tech, details)', () => {
    service.projects().forEach((p: Project) => {
      expect(typeof p.name).toBe('string');
      expect(typeof p.description).toBe('string');
      expect(typeof p.url).toBe('string');
      expect(Array.isArray(p.tech)).toBe(true);
      expect(Array.isArray(p.details)).toBe(true);
    });
  });

  it('exposes a timeline with no 2026 future milestone and no 2018 construction entry', () => {
    const tl = service.timeline();
    expect(tl.find((m) => m.year === '2026')).toBeUndefined();
    expect(tl.find((m) => m.title.includes('construction'))).toBeUndefined();
  });

  it('adds TUM M.Sc. 2022 and Senior Consultant 2024 to the timeline', () => {
    const tl = service.timeline();
    const tum = tl.find((m) => m.year === '2022' && m.title.toLowerCase().includes('tum'));
    expect(tum).toBeDefined();
    const senior = tl.find(
      (m) => m.year === '2024' && m.title.toLowerCase().includes('senior'),
    );
    expect(senior).toBeDefined();
  });

  it('includes the Siemens, ING, SC3, and TUM tutoring internships in the timeline', () => {
    const tl = service.timeline();
    const joined = tl.map((m) => `${m.year} ${m.title} ${m.description}`).join('\n');
    expect(joined).toContain('Siemens');
    expect(joined).toContain('ING');
    expect(joined).toContain('SC3');
    expect(joined.toLowerCase()).toContain('tutor');
  });

  it('keeps an altitude field on every timeline milestone for the rocket simulator', () => {
    service.timeline().forEach((m: Milestone) => {
      expect(typeof m.altitude).toBe('number');
      expect(m.altitude).toBeGreaterThan(0);
    });
  });

  it('preserves skills as SkillGroup[] with at least the existing categories', () => {
    const skills = service.skills();
    expect(skills.length).toBeGreaterThan(0);
    skills.forEach((g: SkillGroup) => {
      expect(typeof g.category).toBe('string');
      expect(Array.isArray(g.skills)).toBe(true);
      expect(g.skills.length).toBeGreaterThan(0);
    });
  });
});
