export const voicemeeterProviderMetadata = {
  id: 'voicemeeter',
  displayName: 'VB-Audio Voicemeeter',
  toolPrefix: 'voicemeeter',
  transport: 'remote-api-helper-process-and-vban-text',
  capabilities: [
    'discovery',
    'status',
    'readOnlyHelperBoundary',
    'devices',
    'stripParameters',
    'busParameters',
    'levels',
    'typedWrites',
    'macroButtons',
    'rawRemoteApi',
    'vbanTextDiagnostics',
    'rawVbanText',
  ],
} as const;

export function voicemeeterCapabilitiesPayload(): Record<string, unknown> {
  return {
    ok: true,
    provider: voicemeeterProviderMetadata,
    capabilitySemantics:
      'Capability groups describe the helper-process surface; environment gates can still disable writes, destructive actions, or raw Remote API access.',
    helperBoundary: {
      nativeDllsLoadedInMcpProcess: false,
      protocol: 'spawn an external helper process and parse one JSON response from stdout',
      configuredBy: [
        'VOICEMEETER_HELPER_COMMAND',
        'VOICEMEETER_HELPER_ARGS',
        'VOICEMEETER_HELPER_TIMEOUT_MS',
        'VOICEMEETER_HELPER_POWERSHELL_COMMAND',
        'VOICEMEETER_MCP_DISABLE_BUNDLED_HELPER',
        'VOICEMEETER_REMOTE_DLL',
      ],
      vbanTextConfiguredBy: [
        'VOICEMEETER_VBAN_HOST',
        'VOICEMEETER_VBAN_PORT',
        'VOICEMEETER_VBAN_STREAM',
        'VOICEMEETER_VBAN_TIMEOUT_MS',
        'VOICEMEETER_MCP_DISABLE_RAW_VBAN_TEXT',
      ],
      allowedRemoteApiCalls: [
        'VBVMR_Login',
        'VBVMR_GetVoicemeeterType',
        'VBVMR_GetVoicemeeterVersion',
        'VBVMR_GetParameterFloat',
        'VBVMR_GetParameterStringA',
        'VBVMR_SetParameterFloat',
        'VBVMR_SetParameterStringA',
        'VBVMR_SetParameters',
        'VBVMR_GetLevel',
        'VBVMR_Input_GetDeviceNumber',
        'VBVMR_Input_GetDeviceDescA',
        'VBVMR_Output_GetDeviceNumber',
        'VBVMR_Output_GetDeviceDescA',
        'VBVMR_MacroButton_GetStatus',
        'VBVMR_MacroButton_SetStatus',
        'VBVMR_Logout',
      ],
      excludedRemoteApiCalls: ['VBVMR_RunVoicemeeter', 'audio callbacks'],
      safetyGates: [
        'VOICEMEETER_MCP_DISABLE_WRITES',
        'VOICEMEETER_MCP_DISABLE_DESTRUCTIVE',
        'VOICEMEETER_MCP_DISABLE_RAW_REMOTE_API',
        'VOICEMEETER_MCP_DISABLE_RAW_VBAN_TEXT',
      ],
    },
    compatibility: {
      matrixToolPrefixStable: true,
      productNeutralTools: 'not exposed until multiple product providers have shipped compatible behavior',
    },
  };
}
