import { access, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stderr as output } from 'node:process';
import { loadConfig } from '../src/config/index.js';
import { VbMatrixClient } from '../src/core/client.js';
import { readWavPcm, measureLevel, correlation } from '../src/core/audioMeasurement.js';
import {
  assertLiveRunAllowed,
  buildLiveAudioVerificationCommands,
  evaluateVerification,
  restorePointCommands,
  type LiveAudioVerifyConfig,
  type VerificationMeasurements,
} from '../src/core/liveAudioVerification.js';
import { setPointGainCommand, setPointMuteCommand, setPointPhaseCommand } from '../src/core/commands.js';

const DEFAULT_CONFIG_PATH = 'live-audio-verify.local.json';

interface Args {
  configPath: string;
  run: boolean;
  help: boolean;
}

interface Stage {
  name: string;
  wavPath: string;
  commands: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = { configPath: DEFAULT_CONFIG_PATH, run: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--run') args.run = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--config') {
      const value = argv[index + 1];
      if (!value) throw new Error('--config requires a path');
      args.configPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage(): string {
  return [
    'Usage: npm run verify:live-audio -- [--config live-audio-verify.local.json] [--run]',
    '',
    'Dry-run is the default and never writes to Matrix.',
    'Live writes require both --run and VBMATRIX_LIVE_VERIFY=I_UNDERSTAND_THIS_CHANGES_AUDIO.',
  ].join('\n');
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be a non-empty string`);
  return value;
}

function assertNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  return value;
}

function loadLiveConfig(raw: unknown): LiveAudioVerifyConfig {
  if (typeof raw !== 'object' || raw === null) throw new Error('Config must be a JSON object');
  const record = raw as Record<string, unknown>;
  const target = record.target as Record<string, unknown> | undefined;
  if (typeof target !== 'object' || target === null) throw new Error('target must be a JSON object');
  return {
    target: {
      inputSuid: assertString(target.inputSuid, 'target.inputSuid'),
      inputChannel: assertNumber(target.inputChannel, 'target.inputChannel'),
      outputSuid: assertString(target.outputSuid, 'target.outputSuid'),
      outputChannel: assertNumber(target.outputChannel, 'target.outputChannel'),
    },
    baselineWav: assertString(record.baselineWav, 'baselineWav'),
    mutedWav: assertString(record.mutedWav, 'mutedWav'),
    gainWav: assertString(record.gainWav, 'gainWav'),
    phaseNormalWav: assertString(record.phaseNormalWav, 'phaseNormalWav'),
    phaseInvertedWav: assertString(record.phaseInvertedWav, 'phaseInvertedWav'),
    gainDb: assertNumber(record.gainDb, 'gainDb'),
    channel: record.channel === undefined ? undefined : assertNumber(record.channel, 'channel'),
    muteDropDb: record.muteDropDb === undefined ? undefined : assertNumber(record.muteDropDb, 'muteDropDb'),
    gainToleranceDb: record.gainToleranceDb === undefined ? undefined : assertNumber(record.gainToleranceDb, 'gainToleranceDb'),
    phaseCorrelationMax:
      record.phaseCorrelationMax === undefined ? undefined : assertNumber(record.phaseCorrelationMax, 'phaseCorrelationMax'),
    settleMs: record.settleMs === undefined ? undefined : assertNumber(record.settleMs, 'settleMs'),
  };
}

function stages(config: LiveAudioVerifyConfig): Stage[] {
  return [
    {
      name: 'baseline',
      wavPath: config.baselineWav,
      commands: [
        setPointGainCommand(config.target, 0),
        setPointMuteCommand(config.target, false),
        setPointPhaseCommand(config.target, false),
      ],
    },
    { name: 'muted', wavPath: config.mutedWav, commands: [setPointMuteCommand(config.target, true)] },
    {
      name: 'gain',
      wavPath: config.gainWav,
      commands: [setPointMuteCommand(config.target, false), setPointGainCommand(config.target, config.gainDb)],
    },
    {
      name: 'phase-normal',
      wavPath: config.phaseNormalWav,
      commands: [setPointGainCommand(config.target, 0), setPointPhaseCommand(config.target, false)],
    },
    { name: 'phase-inverted', wavPath: config.phaseInvertedWav, commands: [setPointPhaseCommand(config.target, true)] },
  ];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function measureWav(path: string, channel: number): Promise<Float64Array> {
  const audio = readWavPcm(await readFile(path));
  if (!Number.isInteger(channel) || channel < 1 || channel > audio.channels) {
    throw new Error(`${path} has ${audio.channels} channel(s); requested channel ${channel}`);
  }
  return audio.samples[channel - 1];
}

async function measureConfig(config: LiveAudioVerifyConfig): Promise<VerificationMeasurements | null> {
  const wavPaths = [config.baselineWav, config.mutedWav, config.gainWav, config.phaseNormalWav, config.phaseInvertedWav];
  const exists = await Promise.all(wavPaths.map((path) => pathExists(path)));
  if (exists.some((present) => !present)) return null;

  const channel = config.channel ?? 1;
  const baseline = await measureWav(config.baselineWav, channel);
  const muted = await measureWav(config.mutedWav, channel);
  const gain = await measureWav(config.gainWav, channel);
  const phaseNormal = await measureWav(config.phaseNormalWav, channel);
  const phaseInverted = await measureWav(config.phaseInvertedWav, channel);

  return {
    baselineRmsDbfs: measureLevel(baseline).rmsDbfs,
    mutedRmsDbfs: measureLevel(muted).rmsDbfs,
    gainRmsDbfs: measureLevel(gain).rmsDbfs,
    phaseCorrelation: correlation(phaseNormal, phaseInverted),
  };
}

async function applyCommands(client: VbMatrixClient, commands: string[]): Promise<void> {
  for (const command of commands) await client.send(command);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLive(config: LiveAudioVerifyConfig): Promise<void> {
  const client = new VbMatrixClient(loadConfig());
  const before = await client.queryPointState(config.target);
  const rl = createInterface({ input, output });
  try {
    for (const stage of stages(config)) {
      await applyCommands(client, stage.commands);
      if (config.settleMs !== undefined) await sleep(config.settleMs);
      console.error(`Capture ${stage.name} audio to ${stage.wavPath}, then press Enter.`);
      await rl.question('');
    }
  } finally {
    rl.close();
    await applyCommands(client, restorePointCommands(config.target, before));
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.error(usage());
    return;
  }
  assertLiveRunAllowed(args.run);
  const config = loadLiveConfig(JSON.parse(await readFile(args.configPath, 'utf8')));

  if (args.run) await runLive(config);

  const measurements = await measureConfig(config);
  const result = measurements ? evaluateVerification(config, measurements) : null;
  console.log(
    JSON.stringify(
      {
        ok: result?.ok ?? false,
        mode: args.run ? 'live' : 'dry-run',
        wroteMatrix: args.run,
        target: config.target,
        plannedCommands: buildLiveAudioVerificationCommands(config),
        measurements,
        checks: result?.checks ?? [],
        measurementSkipped: measurements === null ? 'one or more configured WAV files do not exist yet' : undefined,
      },
      null,
      2
    )
  );
  if (measurements !== null && !result?.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
