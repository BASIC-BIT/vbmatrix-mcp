export const matrixProviderMetadata = {
  id: 'matrix',
  displayName: 'VB-Audio Matrix',
  toolPrefix: 'vbmatrix',
  transport: 'vban-text',
  capabilities: [
    'status',
    'vbanDiagnostics',
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
    registeredProviders: [matrixProviderMetadata.id],
    unavailableProviders: [],
    compatibility: {
      existingToolPrefixStable: true,
      productNeutralTools: 'not exposed until multiple product providers have shipped compatible behavior',
    },
  };
}
