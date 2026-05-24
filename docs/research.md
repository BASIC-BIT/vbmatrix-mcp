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
- Live Matrix 1.0.2.6 testing showed `Command1` receives `Command.Version=?;` as normal VBAN-TEXT, but query answers come back as a `Request Reply` service packet with protocol byte `0x60` and a UTF-8 payload.
- Live Matrix 1.0.2.6 testing showed `Point(...).dBGain=-inf;` is not the correct way to disconnect a point; it resets to `0.0`. Use `Point(...).Remove;` to restore query state to `dBGain = -inf`.
- Point range syntax is represented with inclusive channel ranges inside the existing point expression, for example `Point(SUID.IN[i1..i2],SUID.OUT[j1..j2]).Mute=1;`.
- Zone command syntax was not present in repo-local sources during issue #4 implementation. Zone tools are deferred until the documented grammar is captured or live-verified; this avoids exposing guessed `Zone(...)` writes.

## Useful command examples

```text
Point(SUID.IN[i],SUID.OUT[j]).dBGain=?;
Point(SUID.IN[i],SUID.OUT[j]).Mute=?;
Point(SUID.IN[i],SUID.OUT[j]).Phase=?;
Point(SUID.IN[i1..i2],SUID.OUT[j1..j2]).dBGain=-6;
Point(SUID.IN[i1..i2],SUID.OUT[j1..j2]).Mute=1;
Point(SUID.IN[i1..i2],SUID.OUT[j1..j2]).Phase=0;
Point(SUID.IN[i1..i2],SUID.OUT[j1..j2]).Remove;
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
