import type { VbMatrixConfig } from '../config/index.js';
import {
  validateChannelRangeTargetSyntax,
  validateChannelTargetSyntax,
  validatePointTargetSyntax,
  type ChannelRangeTarget,
  type ChannelTarget,
  type PointTarget,
} from './commands.js';

export class SafetyError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'SafetyError';
    this.code = code;
    this.details = details;
  }
}

export function assertWritesAllowed(config: VbMatrixConfig): void {
  if (!config.writes.allow) {
    throw new SafetyError('writes_disabled', 'Point write tools require VBMATRIX_MCP_ALLOW_WRITES=true', {
      allowWrites: config.writes.allow,
    });
  }
}

export function assertDestructiveAllowed(config: VbMatrixConfig): void {
  if (!config.writes.allowDestructive) {
    throw new SafetyError(
      'destructive_disabled',
      'Destructive tools require VBMATRIX_MCP_ALLOW_DESTRUCTIVE=true',
      { allowDestructive: config.writes.allowDestructive }
    );
  }
}

export function assertSuidAllowed(config: VbMatrixConfig, suid: string): void {
  if (config.writes.allowAllSuids) return;
  if (config.writes.allowedSuids.includes(suid)) return;
  throw new SafetyError('suid_not_allowed', `SUID ${suid} is not in VBMATRIX_MCP_ALLOWED_SUIDS`, {
    suid,
    allowAllSuids: config.writes.allowAllSuids,
    allowedSuids: config.writes.allowedSuids,
  });
}

export function assertPointWriteAllowed(config: VbMatrixConfig, target: PointTarget): void {
  validatePointTargetSyntax(target);
  assertWritesAllowed(config);
  assertSuidAllowed(config, target.inputSuid);
  assertSuidAllowed(config, target.outputSuid);
}

export function assertChannelWriteAllowed(config: VbMatrixConfig, target: ChannelTarget | ChannelRangeTarget): void {
  if ('channel' in target) validateChannelTargetSyntax(target);
  else validateChannelRangeTargetSyntax(target);
  assertWritesAllowed(config);
  assertSuidAllowed(config, target.suid);
}

export function assertChannelResetAllowed(config: VbMatrixConfig, target: ChannelTarget | ChannelRangeTarget): void {
  assertChannelWriteAllowed(config, target);
  assertDestructiveAllowed(config);
}

export function safetyDetails(config: VbMatrixConfig): Record<string, unknown> {
  return {
    allowWrites: config.writes.allow,
    allowAllSuids: config.writes.allowAllSuids,
    allowedSuids: config.writes.allowedSuids,
    allowDestructive: config.writes.allowDestructive,
  };
}
