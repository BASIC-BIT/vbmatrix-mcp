import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export const readOnlyToolAnnotations: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: true,
};

export const writeToolAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const destructiveToolAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};
