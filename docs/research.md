# Research Notes

## Sources

- Official VB-Audio Matrix page: https://vb-audio.com/Matrix/
- Official VBMatrix user manual: https://vb-audio.com/Matrix/VBMatrix_UserManual.pdf
- Existing VBMatrix web/API wrapper: https://github.com/jul-fls/vbmatrix-tool
- Existing related Voicemeeter MCP server: https://github.com/rkzwei/voicemeeter-mcp-server
- VBAN TEXT/SERVICE protocol article: https://blog.onyxandiris.online/the-vban-text-service-subprotocols

## Findings

- No ready-made VBMatrix MCP server was found during initial search.
- VBMatrix has a LOG / CLI command surface, and the manual states most instructions can also be used as VBAN-TEXT requests.
- VBMatrix supports point gain, mute, phase, slot status/device queries, preset patch commands, and system commands.
- Public helper code indicates `Point(...)` commands should avoid spaces after commas when sent over VBAN-TEXT.

## Useful command examples

```text
Point(SUID.IN[i],SUID.OUT[j]).dBGain=?;
Point(SUID.IN[i],SUID.OUT[j]).Mute=?;
Point(SUID.IN[i],SUID.OUT[j]).Phase=?;
Slot(SUID).Online=?;
Slot(SUID).Master=?;
Slot(SUID).Device=?;
Slot(SUID).RunningStatus=?;
Slot(SUID).Info=?;
Command.Version=?;
Command.Engine=?;
Command.Master=?;
Command.Restart;
```

## Build decision

This repo uses TypeScript and the official MCP SDK to align with the existing VRChat MCP repo's development style. The implementation still keeps VBAN-TEXT protocol logic small enough to port later if needed.
