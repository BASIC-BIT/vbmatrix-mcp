# Research Notes

## Sources

- Official VB-Audio Matrix page: https://vb-audio.com/Matrix/
- Official VBMatrix user manual: https://vb-audio.com/Matrix/VBMatrix_UserManual.pdf
- Existing VBMatrix web/API wrapper: https://github.com/jul-fls/vbmatrix-tool
- Existing related Voicemeeter MCP server: https://github.com/rkzwei/voicemeeter-mcp-server
- VBAN TEXT/SERVICE protocol article: https://blog.onyxandiris.online/the-vban-text-service-subprotocols
- Official VB-Audio forum post by site admin Vincent Burel, "Matrix VBAN-TEXT requests list": https://forum.vb-audio.com/viewtopic.php?t=1883

## Findings

- No ready-made VBMatrix MCP server was found during initial search.
- VBMatrix has a LOG / CLI command surface, and the manual states most instructions can also be used as VBAN-TEXT requests.
- VBMatrix supports point gain, mute, phase, slot status/device queries, preset patch commands, and system commands.
- Public helper code indicates `Point(...)` commands should avoid spaces after commas when sent over VBAN-TEXT.
- Live Matrix 1.0.2.6 testing showed `Command1` receives `Command.Version=?;` as normal VBAN-TEXT, but query answers come back as a `Request Reply` service packet with protocol byte `0x60` and a UTF-8 payload.
- Live Matrix 1.0.2.6 testing showed `Point(...).dBGain=-inf;` is not the correct way to disconnect a point; it resets to `0.0`. Use `Point(...).Remove;` to restore query state to `dBGain = -inf`.
- Point range syntax is represented with inclusive channel ranges inside the existing point expression, for example `Point(SUID.IN[i1..i2],SUID.OUT[j1..j2]).Mute=1;`.
- Zone command syntax is documented in the official VB-Audio forum post as a two-corner rectangle: `Zone(SUID.IN[n], SUID.OUT[j]: SUID.IN[k], SUID.OUT[l])`. The post lists `Reset`, `Copy`, `Store = nuPreset`, `Add = nuPreset`, `dBGain`, `Mute`, and `Phase` operations.
- Matrix manual version 1.0.1.8 documents input/output label query ranges, label removal ranges with `Name = ""`, and input/output reset ranges with `[i1..i2]` / `[j1..j2]` syntax. It does not show assigning one non-empty label across a range.
- Live zone mutation has not been performed by this repo. Zone tools are dry-run-first, require explicit confirmation to execute, and report that aggregate zone before/after state queries are not documented.

## Useful command examples

```text
Point(SUID.IN[i],SUID.OUT[j]).dBGain=?;
Point(SUID.IN[i],SUID.OUT[j]).Mute=?;
Point(SUID.IN[i],SUID.OUT[j]).Phase=?;
Point(SUID.IN[i1..i2],SUID.OUT[j1..j2]).dBGain=-6;
Point(SUID.IN[i1..i2],SUID.OUT[j1..j2]).Mute=1;
Point(SUID.IN[i1..i2],SUID.OUT[j1..j2]).Phase=0;
Point(SUID.IN[i1..i2],SUID.OUT[j1..j2]).Remove;
Zone(SUID.IN[n], SUID.OUT[j]: SUID.IN[k], SUID.OUT[l]).Reset;
Zone(SUID.IN[n], SUID.OUT[j]: SUID.IN[k], SUID.OUT[l]).Copy;
Zone(SUID.IN[n], SUID.OUT[j]: SUID.IN[k], SUID.OUT[l]).Store=nuPreset;
Zone(SUID.IN[n], SUID.OUT[j]: SUID.IN[k], SUID.OUT[l]).Add=nuPreset;
Zone(SUID.IN[n], SUID.OUT[j]: SUID.IN[k], SUID.OUT[l]).dBGain=-6.0;
Zone(SUID.IN[n], SUID.OUT[j]: SUID.IN[k], SUID.OUT[l]).Mute=1;
Zone(SUID.IN[n], SUID.OUT[j]: SUID.IN[k], SUID.OUT[l]).Phase=1;
Input(SUID.IN[i]).Name=?;
Input(SUID.IN[i1..i2]).Name=?;
Input(SUID.IN[i]).Name="MyName";
Input(SUID.IN[i1..i2]).Name="";
Input(SUID.IN[i]).Reset;
Input(SUID.IN[i1..i2]).Reset;
Output(SUID.OUT[j]).Name=?;
Output(SUID.OUT[j1..j2]).Name=?;
Output(SUID.OUT[j]).Name="MyName";
Output(SUID.OUT[j1..j2]).Name="";
Output(SUID.OUT[j]).Reset;
Output(SUID.OUT[j1..j2]).Reset;
Slot(SUID).Online=?;
Slot(SUID).Master=?;
Slot(SUID).Device=?;
Slot(SUID).Online=1;
Slot(SUID).Online=0;
Slot(SUID).Master=1;
Slot(SUID).Master=0;
Slot(SUID).Reset;
Slot(SUID).Device.ASIO="Device Name";
Slot(SUID).Device.MME="Device Name";
Slot(SUID).Device.KS="Device Name";
Slot(SUID).Device.WDM="Device Name";
Slot(SUID).Device="";
Slot(SUID).RunningStatus=?;
Slot(SUID).Info=?;
Command.Version=?;
Command.Engine=?;
Command.Master=?;
Command.Restart;
```

## Build decision

This repo uses TypeScript and the official MCP SDK to align with the existing VRChat MCP repo's development style. The implementation still keeps VBAN-TEXT protocol logic small enough to port later if needed.
