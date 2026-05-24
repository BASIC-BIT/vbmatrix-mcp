import { loadConfig } from '../src/config/index.js';
import { commandPropertyQuery, parseQueryResponseValue } from '../src/core/commands.js';
import { VbMatrixClient } from '../src/core/client.js';
import { VbanTextTimeoutError } from '../src/core/vbanText.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new VbMatrixClient(config);
  const command = commandPropertyQuery('Version');
  const result = await client.queryWithDiagnostics(command);
  const version = parseQueryResponseValue(command, result.response ?? '');
  console.log(
    JSON.stringify(
      {
        ok: true,
        version,
        response: result.response,
        command,
        connection: {
          host: config.host,
          port: config.port,
          streamName: config.streamName,
          timeoutMs: config.timeoutMs,
        },
        diagnostics: result.diagnostics,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  const timeoutDiagnostics = err instanceof VbanTextTimeoutError ? err.diagnostics : undefined;
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        diagnostics: timeoutDiagnostics,
      },
      null,
      2
    )
  );
  process.exit(1);
});
