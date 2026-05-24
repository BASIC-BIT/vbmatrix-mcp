import { loadConfig, type VbMatrixConfig } from '../src/config/index.js';
import { commandPropertyQuery, parseQueryResponseValue } from '../src/core/commands.js';
import { VbMatrixClient } from '../src/core/client.js';
import { VbanTextTimeoutError } from '../src/core/vbanText.js';

interface Scenario {
  name: string;
  description: string;
  expected: string;
  config: VbMatrixConfig;
}

interface ScenarioResult {
  name: string;
  description: string;
  expected: string;
  connection: Pick<VbMatrixConfig, 'host' | 'port' | 'streamName' | 'timeoutMs'>;
  ok: boolean;
  version?: string;
  response?: string | null;
  responseParsing?: { ok: true } | { ok: false; error: string };
  diagnostics?: unknown;
  error?: string;
}

function wrongStreamName(current: string): string {
  return current === 'WrongStream14' ? 'WrongStream15' : 'WrongStream14';
}

function wrongPort(current: number): number {
  return current === 65535 ? 65534 : current + 1;
}

function connection(config: VbMatrixConfig): ScenarioResult['connection'] {
  return {
    host: config.host,
    port: config.port,
    streamName: config.streamName,
    timeoutMs: config.timeoutMs,
  };
}

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const command = commandPropertyQuery('Version');
  const client = new VbMatrixClient(scenario.config);
  try {
    const result = await client.queryWithDiagnostics(command);
    try {
      return {
        name: scenario.name,
        description: scenario.description,
        expected: scenario.expected,
        connection: connection(scenario.config),
        ok: true,
        version: parseQueryResponseValue(command, result.response ?? ''),
        response: result.response,
        responseParsing: { ok: true },
        diagnostics: result.diagnostics,
      };
    } catch (err) {
      return {
        name: scenario.name,
        description: scenario.description,
        expected: scenario.expected,
        connection: connection(scenario.config),
        ok: false,
        response: result.response,
        responseParsing: { ok: false, error: err instanceof Error ? err.message : String(err) },
        diagnostics: result.diagnostics,
      };
    }
  } catch (err) {
    return {
      name: scenario.name,
      description: scenario.description,
      expected: scenario.expected,
      connection: connection(scenario.config),
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      diagnostics: err instanceof VbanTextTimeoutError ? err.diagnostics : undefined,
    };
  }
}

async function main(): Promise<void> {
  const baseConfig = loadConfig();
  const scenarios: Scenario[] = [
    {
      name: 'configured-stream',
      description: 'Read-only Matrix version query using the configured host, port, and command stream.',
      expected: 'Passes when Matrix is running, VBAN is on, and the incoming TEXT command stream is enabled.',
      config: baseConfig,
    },
    {
      name: 'wrong-stream',
      description: 'Same read-only query sent to an intentionally wrong command stream name.',
      expected:
        'Usually times out with no packets observed; this proves wrong command streams can be indistinguishable from no listener unless Matrix emits observable traffic.',
      config: { ...baseConfig, streamName: wrongStreamName(baseConfig.streamName) },
    },
    {
      name: 'wrong-port',
      description: 'Same read-only query sent to an adjacent UDP port that should have no Matrix listener.',
      expected: 'Usually times out as no_packets_observed, matching the no-listener/firewall/wrong-port diagnostic class.',
      config: { ...baseConfig, port: wrongPort(baseConfig.port) },
    },
  ];

  const results = [];
  for (const scenario of scenarios) results.push(await runScenario(scenario));

  console.log(
    JSON.stringify(
      {
        ok: results[0]?.ok === true,
        command: commandPropertyQuery('Version'),
        note: 'All scenarios send the same fixed read-only Matrix version query; this script does not expose raw VBAN command execution.',
        results,
      },
      null,
      2
    )
  );

  if (results[0]?.ok !== true) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
