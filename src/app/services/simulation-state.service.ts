import { Injectable, signal } from '@angular/core';

export interface RouteRule {
  destination: string;
  nextHop: string;
  interface: string;
  metric?: number;
}

export interface Packet {
  id: string;
  source: string;
  destination: string;
  size: number;
  protocol?: string;
}

export interface RocketConfig {
  thrust: number;
  fuelRatio: number;
  pitchAngle: number;
  stages: number;
  specialProfile?: string;
}

export type RocketFlightState = 'prelaunch' | 'launching' | 'aborted' | 'apogee' | 'exploded';

export interface RocketState {
  altitude: number;
  velocity: number;
  fuelRemaining: number;
  flightState: RocketFlightState;
  trajectoryPoints: { x: number; y: number }[];
}

export interface RocketLogEntry {
  timestamp: string;
  message: string;
  type: string;
}

export interface RadioState {
  isPowered: boolean;
  isScanning: boolean;
  activeChannel: number;
  isPttHeld: boolean;
  radioStatus: string;
  staticActive: boolean;
}

export interface ConversationState {
  nodeId: string;
  history: { nodeId: string; choice: string }[];
}

export type GossipMode = 'push' | 'pull' | 'push-pull';

@Injectable({
  providedIn: 'root',
})
export class SimulationStateService {
  // --- Rocket ---
  public readonly rocketConfig = signal<RocketConfig>({
    thrust: 80,
    fuelRatio: 50,
    pitchAngle: 90,
    stages: 2,
  });

  public readonly rocketState = signal<RocketState>({
    altitude: 0,
    velocity: 0,
    fuelRemaining: 100,
    flightState: 'prelaunch',
    trajectoryPoints: [],
  });

  public readonly rocketLogs = signal<RocketLogEntry[]>([]);

  // --- Router (dpdk) ---
  public readonly routingRules = signal<RouteRule[]>([]);
  public readonly packets = signal<Packet[]>([]);
  public readonly cpuLoad = signal<number>(12);
  public readonly packetRate = signal<number>(450);
  public readonly alarmActive = signal<boolean>(false);

  // --- Walkie-talkie ---
  public readonly radioState = signal<RadioState>({
    isPowered: true,
    isScanning: false,
    activeChannel: 1,
    isPttHeld: false,
    radioStatus: 'disconnected',
    staticActive: false,
  });

  public readonly foundFrequencies = signal<string[]>([]);
  public readonly connectedFrequency = signal<string | null>(null);
  public readonly receivedTransmission = signal<string>('');
  public readonly conversationState = signal<ConversationState>({
    nodeId: 'start',
    history: [],
  });

  // --- Gossip ---
  public readonly gossipNodes = signal<any[]>([]);
  public readonly gossipPackets = signal<any[]>([]);
  public readonly gossipMode = signal<GossipMode>('push-pull');
  public readonly convergencePercent = signal<number>(0);
  public readonly gossipInfected = signal<boolean>(false);

  // --- ARG puzzle ---
  public readonly gossipArgPartition = signal<string[]>([]);
  public readonly gossipArgSolved = signal<boolean>(false);
  public readonly argCompleted = signal<boolean>(false);

  // --- System ---
  public readonly isSystemCrashed = signal<boolean>(false);
  public readonly activeTab = signal<string>('gossip');
}
