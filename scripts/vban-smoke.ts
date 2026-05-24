import { loadConfig } from '../src/config/index.js';
import { commandPropertyQuery } from '../src/core/commands.js';
import { VbMatrixClient } from '../src/core/client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new VbMatrixClient(config);
  const command = commandPropertyQuery('Version');
  const version = await client.queryValue(command);
  console.log(
    JSON.stringify(
      {
        ok: true,
        version,
        command,
        connection: {
          host: config.host,
          port: config.port,
          streamName: config.streamName,
          timeoutMs: config.timeoutMs,
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      null,
      2
    )
  );
  process.exit(1);
});
