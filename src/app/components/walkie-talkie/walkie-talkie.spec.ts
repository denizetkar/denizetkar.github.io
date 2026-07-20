import { TestBed } from '@angular/core/testing';
import { WalkieTalkieComponent } from './walkie-talkie.component';

describe('WalkieTalkieComponent', () => {
  let component: WalkieTalkieComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    component = TestBed.createComponent(WalkieTalkieComponent).componentInstance;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('emits the corrected channel-4 dialogue without the squeezeing typo or C++ framing', () => {
    const response = (component as any).getChannelResponse(4);
    expect(response).not.toContain('squeezeing');
    expect(response).not.toContain('insane packet rates');
    expect(response).toContain('DPDK');
    expect(response).toContain('Angular templates');
    expect(response).toContain('Python pipelines');
  });
});
