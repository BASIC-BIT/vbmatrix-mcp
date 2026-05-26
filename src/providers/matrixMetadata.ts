export const matrixProviderMetadata = {
  id: 'matrix',
  displayName: 'VB-Audio Matrix',
  toolPrefix: 'vbmatrix',
  transport: 'vban-text',
  capabilities: [
    'status',
    'vbanDiagnostics',
    'rawVbanText',
    'routeInspection',
    'slotInspection',
    'points',
    'pointRanges',
    'zones',
    'slots',
    'channels',
    'presetPatches',
    'snapshots',
    'safeRoutingWorkflows',
    'destructiveSystemActions',
  ],
} as const;

export function matrixCapabilitiesPayload(): Record<string, unknown> {
  return {
    ok: true,
    provider: matrixProviderMetadata,
    capabilitySemantics:
      'Capability groups describe implemented tool families, not whether environment safety gates currently allow writes or destructive execution.',
    providerScope: {
      currentProvider: matrixProviderMetadata.id,
      note: 'This is a Matrix-specific capability report, not a registry-wide product inventory.',
    },
    compatibility: {
      existingToolPrefixStable: true,
      productNeutralTools: 'not exposed until multiple product providers have shipped compatible behavior',
    },
  };
}
