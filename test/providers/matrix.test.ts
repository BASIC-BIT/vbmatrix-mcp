import { describe, expect, test } from 'vitest';
import { productProviders } from '../../src/providers/index.js';
import { matrixCapabilitiesPayload, matrixProviderMetadata } from '../../src/providers/matrixMetadata.js';

describe('Matrix product provider metadata', () => {
  test('keeps Matrix first in the product provider registry', () => {
    expect(productProviders.map((provider) => provider.id)).toEqual([
      'matrix',
      'voicemeeter',
      'windows-audio',
    ]);
    expect(productProviders[0]).toMatchObject({
      displayName: 'VB-Audio Matrix',
      toolPrefix: 'vbmatrix',
      transport: 'vban-text',
    });
  });

  test('advertises stable Matrix capabilities without product-neutral tools', () => {
    expect(matrixProviderMetadata.capabilities).toContain('points');
    expect(matrixProviderMetadata.capabilities).toContain('safeRoutingWorkflows');
    expect(matrixCapabilitiesPayload()).toMatchObject({
      ok: true,
      capabilitySemantics:
        'Capability groups describe implemented tool families, not whether environment safety gates currently allow writes or destructive execution.',
      providerScope: {
        currentProvider: 'matrix',
        note: 'This is a Matrix-specific capability report, not a registry-wide product inventory.',
      },
      compatibility: {
        existingToolPrefixStable: true,
        productNeutralTools: 'not exposed until multiple product providers have shipped compatible behavior',
      },
    });
  });
});
