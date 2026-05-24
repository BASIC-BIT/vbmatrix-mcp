import { z } from 'zod';
import { MAX_GAIN_DB, MAX_MATRIX_CHANNEL_INDEX, MIN_GAIN_DB } from '../core/commands.js';

export const EmptySchema = z.object({});

export const SlotInputSchema = z.object({
  suid: z.string().min(1).describe('VBMatrix slot unique identifier, for example VASIO8, VAIO1, or ASIO128.'),
});

export const PointTargetSchema = z.object({
  inputSuid: z.string().min(1).describe('Input-side SUID, for example VASIO8.'),
  inputChannel: z
    .number()
    .int()
    .min(0)
    .max(MAX_MATRIX_CHANNEL_INDEX)
    .describe('Input channel index. VBMatrix command syntax uses the numeric index directly.'),
  outputSuid: z.string().min(1).describe('Output-side SUID, for example VASIO8.'),
  outputChannel: z
    .number()
    .int()
    .min(0)
    .max(MAX_MATRIX_CHANNEL_INDEX)
    .describe('Output channel index. VBMatrix command syntax uses the numeric index directly.'),
});

export const SetPointGainSchema = PointTargetSchema.extend({
  gainDb: z.number().min(MIN_GAIN_DB).max(MAX_GAIN_DB).describe('Gain in dB.'),
});

export const SetPointMuteSchema = PointTargetSchema.extend({
  muted: z.boolean().describe('Whether the point should be muted.'),
});

export const SetPointPhaseSchema = PointTargetSchema.extend({
  phaseReversed: z.boolean().describe('Whether the point should be phase reversed.'),
});
