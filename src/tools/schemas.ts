import { z } from 'zod';
import { MAX_GAIN_DB, MAX_MATRIX_CHANNEL, MIN_GAIN_DB, MIN_MATRIX_CHANNEL } from '../core/commands.js';

export const EmptySchema = z.object({});

export const SlotInputSchema = z.object({
  suid: z.string().min(1).describe('VBMatrix slot unique identifier, for example VASIO8, VAIO1, or ASIO128.'),
});

export const PresetPatchIndexSchema = z.object({
  index: z.number().int().min(1).describe('1-based VBMatrix preset patch index.'),
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

export const ZoneTargetSchema = z.object({
  startInputSuid: z.string().min(1).describe('Input-side SUID for the first zone corner.'),
  startInputChannel: z.number().int().min(MIN_MATRIX_CHANNEL).max(MAX_MATRIX_CHANNEL),
  startOutputSuid: z.string().min(1).describe('Output-side SUID for the first zone corner.'),
  startOutputChannel: z.number().int().min(MIN_MATRIX_CHANNEL).max(MAX_MATRIX_CHANNEL),
  endInputSuid: z.string().min(1).describe('Input-side SUID for the opposite zone corner.'),
  endInputChannel: z.number().int().min(MIN_MATRIX_CHANNEL).max(MAX_MATRIX_CHANNEL),
  endOutputSuid: z.string().min(1).describe('Output-side SUID for the opposite zone corner.'),
  endOutputChannel: z.number().int().min(MIN_MATRIX_CHANNEL).max(MAX_MATRIX_CHANNEL),
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

export const ApplyZoneSchema = ZoneTargetSchema.extend({
  operation: z.enum(['gain', 'mute', 'phase', 'reset', 'copy', 'store', 'add']).describe('Typed zone operation.'),
  gainDb: z
    .union([z.number().min(MIN_GAIN_DB).max(MAX_GAIN_DB), z.literal('-inf')])
    .optional()
    .describe('Required when operation is gain. -inf builds the documented zone Reset command.'),
  muted: z.boolean().optional().describe('Required when operation is mute.'),
  phaseReversed: z.boolean().optional().describe('Required when operation is phase.'),
  presetNumber: z.number().int().min(1).optional().describe('Required when operation is store or add.'),
  dryRun: z.boolean().optional().describe('When true, return planned command without sending it.'),
  confirmApply: z.literal(true).optional().describe('Required when dryRun is false to apply the zone operation.'),
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

export const PresetPatchOperationSchema = PresetPatchIndexSchema.extend({
  operation: z
    .enum(['apply', 'recall', 'copy', 'paste', 'delete', 'gain', 'mute', 'phase', 'resetZone', 'update', 'name', 'comment'])
    .describe('Documented PresetPatch[n] operation. Load/save/save-as are intentionally deferred for file safety.'),
  gainDb: z.number().min(MIN_GAIN_DB).max(MAX_GAIN_DB).optional().describe('Required when operation is gain.'),
  muted: z.boolean().optional().describe('Required when operation is mute.'),
  phaseReversed: z.boolean().optional().describe('Required when operation is phase.'),
  name: z.string().optional().describe('Required when operation is name. Semicolons and newlines are rejected before sending VBAN-TEXT.'),
  comment: z.string().optional().describe('Required when operation is comment. Semicolons and newlines are rejected before sending VBAN-TEXT.'),
  dryRun: z.boolean().default(true).describe('When true, return the exact command without sending it.'),
  confirmOperation: z
    .literal('PRESET_PATCH_WRITE')
    .optional()
    .describe('Required when dryRun is false so preset patch scene changes are explicit.'),
});

export const SnapshotReferenceSchema = z
  .object({
    snapshot: z.record(z.string(), z.unknown()).optional().describe('Inline Matrix snapshot JSON.'),
    snapshotFile: z.string().min(1).optional().describe('Snapshot artifact path returned by vbmatrix_capture_snapshot.'),
  })
  .refine((value) => value.snapshot !== undefined || value.snapshotFile !== undefined, {
    message: 'Provide either snapshot or snapshotFile',
  });

export const SnapshotCaptureSchema = z.object({
  slots: z.array(z.string().min(1)).default([]).describe('Explicit slot SUIDs to query for metadata.'),
  points: z.array(PointTargetSchema).default([]).describe('Explicit routing points to query for gain, mute, and phase.'),
  includeSnapshot: z
    .boolean()
    .default(true)
    .describe('Include snapshot JSON inline when it is small enough for an MCP response.'),
  writeToFile: z.boolean().default(false).describe('Write the full snapshot to a local artifact file.'),
});

export const SnapshotDiffSchema = z.object({
  before: SnapshotReferenceSchema,
  after: SnapshotReferenceSchema,
  includeDiff: z.boolean().default(false).describe('Include capped diff details inline. Defaults to summary-only.'),
  maxEntries: z.number().int().min(0).max(200).default(20).describe('Maximum inline diff entries when includeDiff is true.'),
  writeToFile: z.boolean().default(false).describe('Write the full diff to a local artifact file.'),
});

export const SnapshotRestoreSchema = SnapshotReferenceSchema.extend({
  selectedPoints: z.array(PointTargetSchema).optional().describe('Optional subset of snapshot points to restore.'),
  properties: z
    .array(z.enum(['dBGain', 'mute', 'phase']))
    .optional()
    .describe('Point properties to restore. Defaults to dBGain, mute, and phase.'),
  dryRun: z.boolean().default(true).describe('When true, return the restore plan without writing.'),
  confirmRestore: z
    .literal('RESTORE_SNAPSHOT')
    .optional()
    .describe('Required when dryRun is false so restore execution is explicit.'),
  confirmBroadRestore: z
    .boolean()
    .default(false)
    .describe('Required for executing plans that affect multiple points or commands.'),
  allowMissingSelectedPoints: z
    .boolean()
    .default(false)
    .describe('When true, selectedPoints absent from the desired snapshot are reported and skipped.'),
});
