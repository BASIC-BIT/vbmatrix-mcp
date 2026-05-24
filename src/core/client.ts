import { getConfig, type VbMatrixConfig } from '../config/index.js';
import {
  commandPropertyQuery,
  parseQueryResponseValue,
  pointPropertyQuery,
  slotPropertyQuery,
  type PointState,
  type PointTarget,
  type SlotState,
} from './commands.js';
import { sendVbanTextCommand, sendVbanTextCommandWithDiagnostics } from './vbanText.js';

export class VbMatrixClient {
  readonly config: VbMatrixConfig;

  constructor(config: VbMatrixConfig = getConfig()) {
    this.config = config;
  }

  async send(command: string): Promise<void> {
    await sendVbanTextCommand(command, {
      host: this.config.host,
      port: this.config.port,
      streamName: this.config.streamName,
      timeoutMs: this.config.timeoutMs,
      waitForResponse: false,
    });
  }

  async query(command: string): Promise<string> {
    const response = await sendVbanTextCommand(command, {
      host: this.config.host,
      port: this.config.port,
      streamName: this.config.streamName,
      timeoutMs: this.config.timeoutMs,
      waitForResponse: true,
    });
    if (response === null) throw new Error(`No response for query: ${command}`);
    return response.trim();
  }

  async queryWithDiagnostics(command: string) {
    const result = await sendVbanTextCommandWithDiagnostics(command, {
      host: this.config.host,
      port: this.config.port,
      streamName: this.config.streamName,
      timeoutMs: this.config.timeoutMs,
      waitForResponse: true,
    });
    return { ...result, response: result.response?.trim() ?? null };
  }

  async queryValue(command: string): Promise<string> {
    return parseQueryResponseValue(command, await this.query(command));
  }

  async queryVersion(): Promise<string> {
    return this.queryValue(commandPropertyQuery('Version'));
  }

  async queryPointState(target: PointTarget): Promise<PointState> {
    const [dBGain, mute, phase] = await Promise.all([
      this.queryValue(pointPropertyQuery(target, 'dBGain')),
      this.queryValue(pointPropertyQuery(target, 'Mute')),
      this.queryValue(pointPropertyQuery(target, 'Phase')),
    ]);
    if ([dBGain, mute, phase].includes('Err')) {
      throw new Error(`Matrix returned Err for point query: ${pointPropertyQuery(target, 'dBGain')}`);
    }
    return { dBGain, mute, phase };
  }

  async querySlotState(suid: string): Promise<SlotState> {
    const [info, online, runningStatus, master, device] = await Promise.all([
      this.queryValue(slotPropertyQuery(suid, 'Info')),
      this.queryValue(slotPropertyQuery(suid, 'Online')),
      this.queryValue(slotPropertyQuery(suid, 'RunningStatus')),
      this.queryValue(slotPropertyQuery(suid, 'Master')),
      this.queryValue(slotPropertyQuery(suid, 'Device')),
    ]);
    return { info, online, runningStatus, master, device };
  }
}
