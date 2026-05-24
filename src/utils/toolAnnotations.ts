import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export const readOnlyToolAnnotations: ToolAnnotations = {
  readOnlyHint: true,
};

export const writeToolAnnotations: ToolAnnotations = {
  readOnlyHint: false,
};

export const destructiveToolAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
};
