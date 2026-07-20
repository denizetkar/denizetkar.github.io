import { Component, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface DiscoveredDevice {
  name: string;
  address: string;
  rssi: number;
}

@Component({
  selector: 'app-walkie-talkie',
  imports: [CommonModule],
  templateUrl: './walkie-talkie.component.html',
  styleUrl: './walkie-talkie.component.scss',
})
export class WalkieTalkieComponent implements OnDestroy {
  // Radio hardware state
  protected readonly isPowered = signal(true);
  protected readonly isScanning = signal(false);
  protected readonly activeChannel = signal(1); // 1 to 4
  protected readonly isPttHeld = signal(false);
  protected readonly radioStatus = signal<'disconnected' | 'scanning' | 'connected' | 'transmitting' | 'receiving'>('disconnected');
  protected readonly staticActive = signal(false);

  // BLE Scan findings
  protected readonly foundDevices = signal<DiscoveredDevice[]>([]);
  protected readonly connectedDevice = signal<DiscoveredDevice | null>(null);

  // Audio/text feedback
  protected readonly receivedTransmission = signal('');
  
  private scanTimeout: any = null;
  private receiveTimeout: any = null;

  ngOnDestroy() {
    this.clearTimeouts();
  }

  private clearTimeouts() {
    if (this.scanTimeout) clearTimeout(this.scanTimeout);
    if (this.receiveTimeout) clearTimeout(this.receiveTimeout);
  }

  protected togglePower() {
    this.isPowered.update(p => !p);
    this.clearTimeouts();
    this.isScanning.set(false);
    this.connectedDevice.set(null);
    this.foundDevices.set([]);
    this.receivedTransmission.set('');
    this.radioStatus.set('disconnected');
  }

  protected scanBleDevices() {
    if (!this.isPowered() || this.isScanning()) return;

    this.isScanning.set(true);
    this.radioStatus.set('scanning');
    this.foundDevices.set([]);
    this.connectedDevice.set(null);
    this.receivedTransmission.set('');

    this.scanTimeout = setTimeout(() => {
      this.isScanning.set(false);
      this.foundDevices.set([
        { name: "Deniz's Node (BLE Walkie-Talkie)", address: '00:1A:7D:DA:71:11', rssi: -45 },
        { name: "Smart Fridge", address: '4A:76:A8:12:F1:C9', rssi: -82 },
        { name: "Unknown Beacon", address: 'FF:FF:FF:FF:FF:FF', rssi: -95 }
      ]);
      this.radioStatus.set('disconnected');
    }, 2500);
  }

  protected connectToDevice(device: DiscoveredDevice) {
    if (!this.isPowered() || device.name !== "Deniz's Node (BLE Walkie-Talkie)") {
      return;
    }
    
    this.isScanning.set(false);
    this.connectedDevice.set(device);
    this.radioStatus.set('connected');
    this.receivedTransmission.set('CONNECTION ESTABLISHED. Radio frequency locked.');
  }

  protected setChannel(channelNum: number) {
    if (!this.isPowered()) return;
    this.activeChannel.set(channelNum);
    this.receivedTransmission.set(`Squelch matched. Listening on CH ${channelNum}.`);
  }

  protected startPtt() {
    if (!this.isPowered() || !this.connectedDevice()) return;
    this.isPttHeld.set(true);
    this.radioStatus.set('transmitting');
    this.staticActive.set(true);
    this.receivedTransmission.set('TRANSMITTING VOICE ENVELOPE...');
  }

  protected stopPtt() {
    if (!this.isPowered() || !this.isPttHeld()) return;
    this.isPttHeld.set(false);
    this.radioStatus.set('receiving');
    this.staticActive.set(true);
    
    this.receivedTransmission.set('RECEIVING CARRIER SIGNAL...');

    this.receiveTimeout = setTimeout(() => {
      this.staticActive.set(false);
      this.radioStatus.set('connected');
      this.receivedTransmission.set(this.getChannelResponse(this.activeChannel()));
    }, 1500);
  }

  private getChannelResponse(channel: number): string {
    switch (channel) {
      case 1:
        return 'TNG NODE: "Loud and clear. Working at TNG Munich has been a blast. We get to solve complex software architecture and backend engineering problems daily. Over."';
      case 2:
        return 'BOĞAZİÇİ NODE: "Copy that. Boğaziçi Industrial Engineering was fantastic. Operations research, mathematical optimization, and stats. Plus, the campus is beautiful. Over."';
      case 3:
        return 'ADVICE NODE: "Affirmative. My advice for software developers: don\'t run away from systems code. Understanding assembly, memory allocations, and OS kernels makes you a better coder. Over."';
      case 4:
        return 'LOW-LEVEL NODE: "Understood. My academic work in DPDK and embedded C++ taught me to respect every nanosecond. These days I squeeze performance out of Angular templates and Python pipelines, but the low-level roots run deep. Over."';
      default:
        return 'CARRIER ERROR: Frequency out of range. Static...';
    }
  }
}
