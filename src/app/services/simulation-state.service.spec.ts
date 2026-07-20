import { TestBed } from '@angular/core/testing';
import { SimulationStateService } from './simulation-state.service';

describe('SimulationStateService', () => {
  let service: SimulationStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SimulationStateService);
  });

  it('initial rocketConfig.thrust is 80', () => {
    expect(service.rocketConfig().thrust).toBe(80);
  });

  it('set rocketConfig.thrust to 90', () => {
    service.rocketConfig.set({ ...service.rocketConfig(), thrust: 90 });
    expect(service.rocketConfig().thrust).toBe(90);
  });

  it('set activeTab to "rocket"', () => {
    service.activeTab.set('rocket');
    expect(service.activeTab()).toBe('rocket');
  });

  it('set isSystemCrashed to true', () => {
    service.isSystemCrashed.set(true);
    expect(service.isSystemCrashed()).toBe(true);
  });

  it('initial gossipMode is "push-pull"', () => {
    expect(service.gossipMode()).toBe('push-pull');
  });

  it('initial rocketState has altitude 0 and flightState "prelaunch"', () => {
    const s = service.rocketState();
    expect(s.altitude).toBe(0);
    expect(s.flightState).toBe('prelaunch');
  });

  it('initial radioState has activeChannel 1 and isPowered true', () => {
    const r = service.radioState();
    expect(r.activeChannel).toBe(1);
    expect(r.isPowered).toBe(true);
  });

  it('initial conversationState starts at nodeId "start"', () => {
    expect(service.conversationState().nodeId).toBe('start');
    expect(service.conversationState().history).toEqual([]);
  });

  it('initial router state: cpuLoad 12, packetRate 450, alarmActive false', () => {
    expect(service.cpuLoad()).toBe(12);
    expect(service.packetRate()).toBe(450);
    expect(service.alarmActive()).toBe(false);
  });

  it('initial gossip/arg state is empty/unsolved', () => {
    expect(service.gossipNodes()).toEqual([]);
    expect(service.gossipPackets()).toEqual([]);
    expect(service.convergencePercent()).toBe(0);
    expect(service.gossipInfected()).toBe(false);
    expect(service.gossipArgPartition()).toEqual([]);
    expect(service.gossipArgSolved()).toBe(false);
    expect(service.argCompleted()).toBe(false);
  });

  it('initial foundFrequencies and connectedFrequency are empty', () => {
    expect(service.foundFrequencies()).toEqual([]);
    expect(service.connectedFrequency()).toBeNull();
    expect(service.receivedTransmission()).toBe('');
  });
});
