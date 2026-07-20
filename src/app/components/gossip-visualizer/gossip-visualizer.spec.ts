import { TestBed } from '@angular/core/testing';
import { GossipVisualizerComponent } from './gossip-visualizer.component';
import { DataService } from '../../services/data.service';

describe('GossipVisualizerComponent', () => {
  let fixture: GossipVisualizerComponent;
  let dataService: DataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(GossipVisualizerComponent).componentInstance;
    dataService = TestBed.inject(DataService);
    fixture.ngOnInit();
  });

  afterEach(() => {
    fixture.ngOnDestroy();
  });

  it('sources the bio node body from DataService.bio()', () => {
    const bioNode = (fixture as any).nodes.find((n: any) => n.id === 'bio');
    expect(bioNode).toBeDefined();
    expect(bioNode.body).toEqual([dataService.bio()]);
  });

  it('sources the tng node body from DataService.currentRole()', () => {
    const tngNode = (fixture as any).nodes.find((n: any) => n.id === 'tng');
    expect(tngNode).toBeDefined();
    expect(tngNode.body).toEqual([dataService.currentRole()]);
  });

  it('does not carry the stale elite-software-consulting C++ string in any node body', () => {
    const nodes: any[] = (fixture as any).nodes;
    const joined = nodes.map((n) => n.body.join('\n')).join('\n');
    expect(joined).not.toContain('elite software consulting');
    expect(joined).not.toContain('complex C++ backends');
  });

  it('maps the bogazici node from BOTH Boğaziçi EducationEntry degrees', () => {
    const bogNode = (fixture as any).nodes.find((n: any) => n.id === 'bogazici');
    expect(bogNode).toBeDefined();
    const bodyJoined = bogNode.body.join('\n');
    const bogEntries = dataService
      .education()
      .filter((e) => e.institution === 'Boğaziçi University');
    expect(bogEntries).toHaveLength(2);
    expect(bodyJoined).toContain('Industrial Engineering');
    expect(bodyJoined).toContain('Computer Engineering');
  });
});
