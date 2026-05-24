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

export const ChannelRangeSchema = z
  .object({
    start: z
      .number()
      .int()
      .min(MIN_MATRIX_CHANNEL)
      .max(MAX_MATRIX_CHANNEL)
      .describe('First 1-based channel in the inclusive range.'),
    end: z
      .number()
      .int()
      .min(MIN_MATRIX_CHANNEL)
      .max(MAX_MATRIX_CHANNEL)
      .describe('Last 1-based channel in the inclusive range.'),
  })
  .refine((range) => range.start <= range.end, 'Channel range start must be less than or equal to end.');

export const PointRangeTargetSchema = z.object({
  inputSuid: z.string().min(1).describe('Input-side SUID, for example VASIO8.'),
  inputChannels: ChannelRangeSchema.describe('Inclusive input channel range for IN[start..end].'),
  outputSuid: z.string().min(1).describe('Output-side SUID, for example ASIO128.'),
  outputChannels: ChannelRangeSchema.describe('Inclusive output channel range for OUT[start..end].'),
});

export const SetPointGainSchema = PointTargetSchema.extend({
  gainDb: z.union([z.number().min(MIN_GAIN_DB).max(MAX_GAIN_DB), z.literal('-inf')]).describe('Gain in dB, or -inf.'),
});

export const SetPointMuteSchema = PointTargetSchema.extend({
  muted: z.boolean().describe('Whether the point should be muted.'),
});

export const SetPointPhaseSchema = PointTargetSchema.extend({
  phaseReversed: z.boolean().describe('Whether the point should be phase reversed.'),
});

export const RemovePointSchema = PointTargetSchema.extend({
  confirmRemove: z.literal(true).describe('Must be true to confirm disconnecting this routing point.'),
});

export const ApplyPointRangeSchema = PointRangeTargetSchema.extend({
  operation: z.enum(['gain', 'mute', 'phase', 'remove']).describe('Typed point range operation to apply.'),
  gainDb: z
    .union([z.number().min(MIN_GAIN_DB).max(MAX_GAIN_DB), z.literal('-inf')])
    .optional()
    .describe('Required when operation is gain. -inf removes the range.'),
  muted: z.boolean().optional().describe('Required when operation is mute.'),
  phaseReversed: z.boolean().optional().describe('Required when operation is phase.'),
  dryRun: z.boolean().optional().describe('When true, return planned command without sending it.'),
  confirmApply: z
    .literal(true)
    .optional()
    .describe('Required when dryRun is false to confirm applying the range operation.'),
});
