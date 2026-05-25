export const voicemeeterProviderMetadata = {
  id: 'voicemeeter',
  displayName: 'VB-Audio Voicemeeter',
  toolPrefix: 'voicemeeter',
  transport: 'remote-api-helper-process',
  capabilities: ['discovery', 'status', 'readOnlyHelperBoundary'],
} as const;

export function voicemeeterCapabilitiesPayload(): Record<string, unknown> {
  return {
    ok: true,
    provider: voicemeeterProviderMetadata,
    capabilitySemantics:
      'Capability groups describe the read-only helper-process surface only; this provider does not expose writes, scripts, raw parameters, or VBAN raw commands.',
    helperBoundary: {
      nativeDllsLoadedInMcpProcess: false,
      protocol: 'spawn an external helper process and parse one JSON status response from stdout',
      configuredBy: [
        'VOICEMEETER_HELPER_COMMAND',
        'VOICEMEETER_HELPER_ARGS',
        'VOICEMEETER_HELPER_TIMEOUT_MS',
      ],
      allowedRemoteApiCalls: [
        'VBVMR_Login',
        'VBVMR_GetVoicemeeterType',
        'VBVMR_GetVoicemeeterVersion',
        'VBVMR_Logout',
      ],
      excludedRemoteApiCalls: [
        'VBVMR_RunVoicemeeter',
        'VBVMR_SetParameterFloat',
        'VBVMR_SetParameterStringA',
        'VBVMR_SetParameters',
        'VBVMR_MacroButton_SetStatus',
        'audio callbacks',
      ],
    },
    compatibility: {
      matrixToolPrefixStable: true,
      productNeutralTools: 'not exposed until multiple product providers have shipped compatible behavior',
    },
  };
}
