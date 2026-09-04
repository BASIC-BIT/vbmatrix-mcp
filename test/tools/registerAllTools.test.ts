import { describe, expect, test, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../../src/tools/registerAllTools.js';

describe('tool registration', () => {
  test('preserves the Matrix tool surface through the provider boundary', () => {
    const names: string[] = [];
    const server = {
      registerTool: vi.fn((name: string) => {
        names.push(name);
      }),
    } as unknown as McpServer;

    registerAllTools(server);

    expect(names).toEqual([
      'vbmatrix_get_capabilities',
      'vbmatrix_ping',
      'vbmatrix_vban_diagnostics',
      'vbmatrix_get_engine',
      'vbmatrix_get_master',
      'vbmatrix_get_slot_info',
      'vbmatrix_raw_vban_text',
      'vbmatrix_inspect_routes',
      'vbmatrix_inspect_slots',
      'vbmatrix_get_file_state',
      'vbmatrix_preset_patch_file',
      'vbmatrix_inspect_saved_settings',
      'vbmatrix_diff_saved_settings',
      'vbmatrix_get_point',
      'vbmatrix_remove_point',
      'vbmatrix_apply_point_range',
      'vbmatrix_set_point_gain',
      'vbmatrix_set_point_mute',
      'vbmatrix_set_point_phase',
      'vbmatrix_apply_zone',
      'vbmatrix_get_channel_label',
      'vbmatrix_set_channel_label',
      'vbmatrix_remove_channel_label',
      'vbmatrix_reset_channel_routes',
      'vbmatrix_get_preset_patch',
      'vbmatrix_preset_patch',
      'vbmatrix_safe_route_workflow',
      'vbmatrix_set_slot_online',
      'vbmatrix_set_slot_master',
      'vbmatrix_reset_slot',
      'vbmatrix_set_slot_device',
      'vbmatrix_remove_slot_device',
      'vbmatrix_capture_snapshot',
      'vbmatrix_diff_snapshots',
      'vbmatrix_restore_snapshot',
      'vbmatrix_restart_engine',
      'voicemeeter_get_capabilities',
      'voicemeeter_get_status',
      'voicemeeter_get_devices',
      'voicemeeter_get_strip',
      'voicemeeter_get_bus',
      'voicemeeter_get_levels',
      'voicemeeter_set_strip_parameter',
      'voicemeeter_set_bus_parameter',
      'voicemeeter_set_device',
      'voicemeeter_get_macro_button',
      'voicemeeter_set_macro_button',
      'voicemeeter_raw_remote_api',
      'voicemeeter_vban_diagnostics',
      'voicemeeter_raw_vban_text',
    ]);
  });
});
