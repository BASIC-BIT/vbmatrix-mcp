import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { VbMatrixClient } from '../core/client.js';
import { VbMatrixClient as DefaultVbMatrixClient } from '../core/client.js';
import { assertPointWriteAllowed, safetyDetails } from '../core/safety.js';
import {
  capturePointSnapshot,
  planSafeRouteWorkflow,
  rollbackFromSnapshot,
  type SafeRouteWorkflowInput,
} from '../core/safeRouting.js';
import { writeToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import { SafeRouteWorkflowSchema } from './schemas.js';

export async function runSafeRouteWorkflow(
  input: SafeRouteWorkflowInput & { dryRun: boolean; confirmApply?: string },
  client: VbMatrixClient
) {
  const plan = planSafeRouteWorkflow(input);
  const beforeSnapshot = await capturePointSnapshot({
    targets: plan.targets,
    queryPointState: (target) => client.queryPointState(target),
  });
  const rollback = rollbackFromSnapshot(beforeSnapshot);

  if (input.dryRun) {
    return { ok: true, dryRun: true, plan, beforeSnapshot, rollback, safety: safetyDetails(client.config) };
  }

  if (input.confirmApply !== 'SAFE_ROUTE_APPLY') {
    throw new Error('Executing safe route workflow requires confirmApply="SAFE_ROUTE_APPLY"');
  }

  for (const target of plan.targets) assertPointWriteAllowed(client.config, target);

  for (const command of plan.commands) await client.send(command);

  const afterSnapshot = await capturePointSnapshot({
    targets: plan.targets,
    queryPointState: (target) => client.queryPointState(target),
  });

  return {
    ok: true,
    dryRun: false,
    plan,
    beforeSnapshot,
    afterSnapshot,
    rollback,
    safety: safetyDetails(client.config),
  };
}

export function registerSafeRoutingTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_safe_route_workflow',
    {
      description:
        'Minimal safe routing workflow for explicit Matrix point targets only. Supports auditionRoute, cleanupRoutes, and emergencyMute; dry-runs by default and requires confirmApply="SAFE_ROUTE_APPLY" for writes.',
      inputSchema: SafeRouteWorkflowSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const input = SafeRouteWorkflowSchema.parse(args);
        const client = new DefaultVbMatrixClient();
        return jsonResponse(await runSafeRouteWorkflow(input, client));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown safe routing workflow error');
      }
    }
  );
}
