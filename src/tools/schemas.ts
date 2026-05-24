import { z } from 'zod';
import { MAX_GAIN_DB, MAX_MATRIX_CHANNEL, MIN_GAIN_DB, MIN_MATRIX_CHANNEL } from '../core/commands.js';

export const EmptySchema = z.object({});

export const SlotInputSchema = z.object({
  suid: z.string().min(1).describe('VBMatrix slot unique identifier, for example VASIO8, VAIO1, or ASIO128.'),
});

export const PointTargetSchema = z.object({
  inputSuid: z.string().min(1).describe('Input-side SUID, for example VASIO8.'),
  inputChannel: z
    .number()
    .int()
    .min(MIN_MATRIX_CHANNEL)
    .max(MAX_MATRIX_CHANNEL)
    .describe('Input channel number. VBMatrix command syntax is documented as 1-based.'),
  outputSuid: z.string().min(1).describe('Output-side SUID, for example VASIO8.'),
  outputChannel: z
    .number()
    .int()
    .min(MIN_MATRIX_CHANNEL)
    .max(MAX_MATRIX_CHANNEL)
    .describe('Output channel number. VBMatrix command syntax is documented as 1-based.'),
});

export const SetPointGainSchema = PointTargetSchema.extend({
  gainDb: z
    .union([z.number().min(MIN_GAIN_DB).max(MAX_GAIN_DB), z.literal('-inf')])
    .describe('Gain in dB, or -inf.'),
});

export const SetPointMuteSchema = PointTargetSchema.extend({
  muted: z.boolean().describe('Whether the point should be muted.'),
});

export const SetPointPhaseSchema = PointTargetSchema.extend({
  phaseReversed: z.boolean().describe('Whether the point should be phase reversed.'),
});

export const SetSlotOnlineSchema = SlotInputSchema.extend({
  online: z.boolean().describe('Whether the slot should be online.'),
});

export const SetSlotMasterSchema = SlotInputSchema.extend({
  master: z.boolean().describe('Whether the slot should be the master clock source.'),
});

export const ResetSlotSchema = SlotInputSchema.extend({
  confirm: z.literal(true).describe('Required explicit confirmation for this destructive slot reset.'),
});

export const SetSlotDeviceSchema = SlotInputSchema.extend({
  kind: z.enum(['ASIO', 'MME', 'KS', 'WDM']).describe('Documented VBMatrix device API namespace.'),
  deviceName: z.string().min(1).describe('Exact Windows/VBMatrix device name to quote in the command.'),
  confirm: z
    .literal(true)
    .describe('Required explicit confirmation because changing devices can disrupt live audio.'),
});

export const RemoveSlotDeviceSchema = SlotInputSchema.extend({
  confirm: z
    .literal(true)
    .describe('Required explicit confirmation because removing a device can disrupt live audio.'),
});
