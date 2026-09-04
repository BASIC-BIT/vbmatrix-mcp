export const windowsAudioProviderMetadata = {
  id: 'windows-audio',
  displayName: 'Windows Core Audio',
  toolPrefix: 'windows_audio',
  transport: 'helper-process',
  capabilities: [
    'availability',
    'readOnlyHelperBoundary',
    'endpointInventory',
    'defaultRoleAssignments',
    'mixFormats',
  ],
} as const;

export function windowsAudioCapabilitiesPayload(
  platform: typeof process.platform = process.platform
): Record<string, unknown> {
  return {
    ok: true,
    provider: windowsAudioProviderMetadata,
    capabilitySemantics:
      'Capabilities describe the implemented read-only provider surface. Individual calls can still report an unsupported platform, unavailable helper, partial observation, or unavailable endpoint property.',
    runtimeAvailability: {
      platform,
      platformSupported: platform === 'win32',
      helperProbed: false,
      note: 'Call an endpoint/default tool to probe the helper and Windows Core Audio runtime.',
    },
    helperBoundary: {
      nativeApisLoadedInMcpProcess: false,
      protocol: 'spawn one external helper operation and parse one bounded JSON object from stdout',
      operations: ['status', 'endpoints', 'defaults'],
      arbitraryCommandsAccepted: false,
      configuredBy: [
        'WINDOWS_AUDIO_HELPER_COMMAND',
        'WINDOWS_AUDIO_HELPER_ARGS',
        'WINDOWS_AUDIO_HELPER_TIMEOUT_MS',
        'WINDOWS_AUDIO_HELPER_POWERSHELL_COMMAND',
        'WINDOWS_AUDIO_MCP_DISABLE_BUNDLED_HELPER',
      ],
    },
    safety: {
      readOnly: true,
      changesDefaultDevices: false,
      changesEndpointState: false,
      changesAudioRouting: false,
      responseBounded: true,
    },
    privacy: {
      localOnly: true,
      note: 'Endpoint IDs, interface paths, and device names can be machine-specific; redact them from shared support evidence.',
    },
  };
}
