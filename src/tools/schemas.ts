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

export const ChannelKindSchema = z.enum(['input', 'output']).describe('VBMatrix endpoint side.');

export const ChannelTargetSchema = z.object({
  kind: ChannelKindSchema,
  suid: z.string().min(1).describe('Slot unique identifier, for example VASIO8 or ASIO128.'),
  channel: z
    .number()
    .int()
    .min(MIN_MATRIX_CHANNEL)
    .max(MAX_MATRIX_CHANNEL)
    .describe('1-based input or output channel number.'),
});

export const ChannelRangeTargetSchema = z.object({
  kind: ChannelKindSchema,
  suid: z.string().min(1).describe('Slot unique identifier, for example VASIO8 or ASIO128.'),
  startChannel: z
    .number()
    .int()
    .min(MIN_MATRIX_CHANNEL)
    .max(MAX_MATRIX_CHANNEL)
    .describe('First 1-based channel in the documented Matrix range syntax.'),
  endChannel: z
    .number()
    .int()
    .min(MIN_MATRIX_CHANNEL)
    .max(MAX_MATRIX_CHANNEL)
    .describe('Last 1-based channel in the documented Matrix range syntax.'),
});

export const ChannelOrRangeTargetSchema = z.union([ChannelTargetSchema, ChannelRangeTargetSchema]);

export const SetChannelLabelSchema = ChannelTargetSchema.extend({
  label: z.string().describe('Label text. Semicolons and newlines are rejected before sending VBAN-TEXT.'),
});

export const ResetChannelSchema = ChannelOrRangeTargetSchema.and(
  z.object({
    confirm: z.literal('RESET_CHANNEL_ROUTES').describe('Required confirmation for destructive route reset.'),
  })
);

export const SetPointGainSchema = PointTargetSchema.extend({
  gainDb: z.union([z.number().min(MIN_GAIN_DB).max(MAX_GAIN_DB), z.literal('-inf')]).describe('Gain in dB, or -inf.'),
});

export const SetPointMuteSchema = PointTargetSchema.extend({
  muted: z.boolean().describe('Whether the point should be muted.'),
});

export const SetPointPhaseSchema = PointTargetSchema.extend({
  phaseReversed: z.boolean().describe('Whether the point should be phase reversed.'),
});
