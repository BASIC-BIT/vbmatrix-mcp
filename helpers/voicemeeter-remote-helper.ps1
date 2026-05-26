param(
  [string]$Operation = "status",
  [string]$PayloadBase64 = ""
)

$ErrorActionPreference = "Stop"

function Write-JsonResult($Value) {
  $Value | ConvertTo-Json -Depth 32 -Compress | Write-Output
}

function Get-Payload {
  if ([string]::IsNullOrWhiteSpace($PayloadBase64)) {
    return [pscustomobject]@{}
  }
  $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadBase64))
  return $json | ConvertFrom-Json
}

function Get-RemoteDllPath {
  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($env:VOICEMEETER_REMOTE_DLL)) {
    $candidates += $env:VOICEMEETER_REMOTE_DLL
  }
  if (-not [string]::IsNullOrWhiteSpace(${env:ProgramFiles(x86)})) {
    $candidates += (Join-Path ${env:ProgramFiles(x86)} "VB\Voicemeeter\VoicemeeterRemote64.dll")
    $candidates += (Join-Path ${env:ProgramFiles(x86)} "VB\Voicemeeter\VoicemeeterRemote.dll")
  }
  if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
    $candidates += (Join-Path $env:ProgramFiles "VB\Voicemeeter\VoicemeeterRemote64.dll")
    $candidates += (Join-Path $env:ProgramFiles "VB\Voicemeeter\VoicemeeterRemote.dll")
  }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  return $null
}

function Convert-Version($Version) {
  $u = [uint32]$Version
  return "{0}.{1}.{2}.{3}" -f (($u -band 0xFF000000) -shr 24), (($u -band 0x00FF0000) -shr 16), (($u -band 0x0000FF00) -shr 8), ($u -band 0x000000FF)
}

function Add-RemoteApiType($DllPath) {
  $escaped = $DllPath.Replace("\", "\\")
  $source = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class VoicemeeterRemoteApi {
  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_Login();

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_Logout();

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_GetVoicemeeterType(out int pType);

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_GetVoicemeeterVersion(out int pVersion);

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_GetParameterFloat(string name, out float value);

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_GetParameterStringA(string name, StringBuilder value);

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_SetParameterFloat(string name, float value);

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_SetParameterStringA(string name, string value);

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_SetParameters(string script);

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_GetLevel(int levelType, int channel, out float value);

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_Output_GetDeviceNumber();

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_Output_GetDeviceDescA(int index, out int type, StringBuilder name, StringBuilder hardwareId);

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_Input_GetDeviceNumber();

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_Input_GetDeviceDescA(int index, out int type, StringBuilder name, StringBuilder hardwareId);

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_MacroButton_GetStatus(int index, out float value, int mode);

  [DllImport("$escaped", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int VBVMR_MacroButton_SetStatus(int index, float value, int mode);
}
"@
  Add-Type -TypeDefinition $source | Out-Null
}

function Get-DeviceTypeName($Type) {
  switch ($Type) {
    1 { return "mme" }
    3 { return "wdm" }
    4 { return "ks" }
    5 { return "asio" }
    default { return "unknown" }
  }
}

function Invoke-Login {
  $login = [VoicemeeterRemoteApi]::VBVMR_Login()
  if ($login -eq 1) {
    return @{ ok = $false; availability = "not_running"; running = $false; loginResult = $login; error = "Voicemeeter application is not launched." }
  }
  if ($login -ne 0) {
    return @{ ok = $false; availability = "helper_failed"; running = $false; loginResult = $login; error = "VBVMR_Login failed with code $login." }
  }
  return @{ ok = $true; availability = "available"; running = $true; loginResult = $login }
}

function Get-StatusResult($DllPath) {
  $loginState = Invoke-Login
  if (-not $loginState.ok) {
    return $loginState + @{ dllPath = $DllPath }
  }

  try {
    $type = 0
    $version = 0
    $typeResult = [VoicemeeterRemoteApi]::VBVMR_GetVoicemeeterType([ref]$type)
    $versionResult = [VoicemeeterRemoteApi]::VBVMR_GetVoicemeeterVersion([ref]$version)
    return @{
      ok = (($typeResult -eq 0) -and ($versionResult -eq 0))
      availability = "available"
      running = $true
      type = $type
      version = (Convert-Version $version)
      dllPath = $DllPath
      remoteApi = @{ login = $loginState.loginResult; type = $typeResult; version = $versionResult }
    }
  }
  finally {
    [VoicemeeterRemoteApi]::VBVMR_Logout() | Out-Null
  }
}

function Get-ParametersResult($Payload) {
  $loginState = Invoke-Login
  if (-not $loginState.ok) { return $loginState }
  try {
    $results = @()
    foreach ($parameter in @($Payload.parameters)) {
      $name = [string]$parameter.name
      $kind = [string]$parameter.kind
      if ($kind -eq "string") {
        $builder = New-Object System.Text.StringBuilder 512
        $result = [VoicemeeterRemoteApi]::VBVMR_GetParameterStringA($name, $builder)
        $results += @{ name = $name; kind = $kind; result = $result; value = $builder.ToString() }
      }
      else {
        $value = [single]0
        $result = [VoicemeeterRemoteApi]::VBVMR_GetParameterFloat($name, [ref]$value)
        $results += @{ name = $name; kind = "float"; result = $result; value = $value }
      }
    }
    return @{ ok = $true; availability = "available"; running = $true; parameters = $results }
  }
  finally {
    [VoicemeeterRemoteApi]::VBVMR_Logout() | Out-Null
  }
}

function Set-ParametersResult($Payload) {
  $loginState = Invoke-Login
  if (-not $loginState.ok) { return $loginState }
  try {
    $results = @()
    foreach ($parameter in @($Payload.parameters)) {
      $name = [string]$parameter.name
      $kind = [string]$parameter.kind
      if ($kind -eq "string") {
        $result = [VoicemeeterRemoteApi]::VBVMR_SetParameterStringA($name, [string]$parameter.value)
        $results += @{ name = $name; kind = $kind; result = $result; value = [string]$parameter.value }
      }
      else {
        $value = [single]$parameter.value
        $result = [VoicemeeterRemoteApi]::VBVMR_SetParameterFloat($name, $value)
        $results += @{ name = $name; kind = "float"; result = $result; value = $value }
      }
    }
    return @{ ok = $true; availability = "available"; running = $true; parameters = $results }
  }
  finally {
    [VoicemeeterRemoteApi]::VBVMR_Logout() | Out-Null
  }
}

function Get-LevelsResult($Payload) {
  $loginState = Invoke-Login
  if (-not $loginState.ok) { return $loginState }
  try {
    $levelType = [int]$Payload.levelType
    $results = @()
    foreach ($channel in @($Payload.channels)) {
      $value = [single]0
      $result = [VoicemeeterRemoteApi]::VBVMR_GetLevel($levelType, [int]$channel, [ref]$value)
      $results += @{ channel = [int]$channel; result = $result; value = $value }
    }
    return @{ ok = $true; availability = "available"; running = $true; levelType = $levelType; levels = $results }
  }
  finally {
    [VoicemeeterRemoteApi]::VBVMR_Logout() | Out-Null
  }
}

function Get-DevicesResult {
  $loginState = Invoke-Login
  if (-not $loginState.ok) { return $loginState }
  try {
    $inputs = @()
    $inputCount = [VoicemeeterRemoteApi]::VBVMR_Input_GetDeviceNumber()
    for ($i = 0; $i -lt $inputCount; $i++) {
      $type = 0
      $name = New-Object System.Text.StringBuilder 256
      $hardwareId = New-Object System.Text.StringBuilder 256
      $result = [VoicemeeterRemoteApi]::VBVMR_Input_GetDeviceDescA($i, [ref]$type, $name, $hardwareId)
      $inputs += @{ index = $i; result = $result; type = $type; typeName = (Get-DeviceTypeName $type); name = $name.ToString(); hardwareId = $hardwareId.ToString() }
    }

    $outputs = @()
    $outputCount = [VoicemeeterRemoteApi]::VBVMR_Output_GetDeviceNumber()
    for ($i = 0; $i -lt $outputCount; $i++) {
      $type = 0
      $name = New-Object System.Text.StringBuilder 256
      $hardwareId = New-Object System.Text.StringBuilder 256
      $result = [VoicemeeterRemoteApi]::VBVMR_Output_GetDeviceDescA($i, [ref]$type, $name, $hardwareId)
      $outputs += @{ index = $i; result = $result; type = $type; typeName = (Get-DeviceTypeName $type); name = $name.ToString(); hardwareId = $hardwareId.ToString() }
    }

    return @{ ok = $true; availability = "available"; running = $true; inputs = $inputs; outputs = $outputs }
  }
  finally {
    [VoicemeeterRemoteApi]::VBVMR_Logout() | Out-Null
  }
}

function Invoke-RawScriptResult($Payload) {
  $loginState = Invoke-Login
  if (-not $loginState.ok) { return $loginState }
  try {
    $script = [string]$Payload.script
    $result = [VoicemeeterRemoteApi]::VBVMR_SetParameters($script)
    return @{ ok = ($result -eq 0); availability = "available"; running = $true; result = $result }
  }
  finally {
    [VoicemeeterRemoteApi]::VBVMR_Logout() | Out-Null
  }
}

function Get-MacroStatusResult($Payload) {
  $loginState = Invoke-Login
  if (-not $loginState.ok) { return $loginState }
  try {
    $index = [int]$Payload.index
    $mode = [int]$Payload.mode
    $value = [single]0
    $result = [VoicemeeterRemoteApi]::VBVMR_MacroButton_GetStatus($index, [ref]$value, $mode)
    return @{ ok = ($result -eq 0); availability = "available"; running = $true; index = $index; mode = $mode; value = $value; result = $result }
  }
  finally {
    [VoicemeeterRemoteApi]::VBVMR_Logout() | Out-Null
  }
}

function Set-MacroStatusResult($Payload) {
  $loginState = Invoke-Login
  if (-not $loginState.ok) { return $loginState }
  try {
    $index = [int]$Payload.index
    $mode = [int]$Payload.mode
    $value = [single]$Payload.value
    $result = [VoicemeeterRemoteApi]::VBVMR_MacroButton_SetStatus($index, $value, $mode)
    return @{ ok = ($result -eq 0); availability = "available"; running = $true; index = $index; mode = $mode; value = $value; result = $result }
  }
  finally {
    [VoicemeeterRemoteApi]::VBVMR_Logout() | Out-Null
  }
}

try {
  $dllPath = Get-RemoteDllPath
  if ($null -eq $dllPath) {
    Write-JsonResult @{ ok = $false; availability = "missing_install"; running = $false; error = "Voicemeeter Remote API DLL was not found." }
    exit 0
  }

  Add-RemoteApiType $dllPath
  $payload = Get-Payload
  switch ($Operation) {
    "status" { Write-JsonResult (Get-StatusResult $dllPath) }
    "get-parameters" { Write-JsonResult (Get-ParametersResult $payload) }
    "set-parameters" { Write-JsonResult (Set-ParametersResult $payload) }
    "get-levels" { Write-JsonResult (Get-LevelsResult $payload) }
    "devices" { Write-JsonResult (Get-DevicesResult) }
    "raw-script" { Write-JsonResult (Invoke-RawScriptResult $payload) }
    "macro-status" { Write-JsonResult (Get-MacroStatusResult $payload) }
    "macro-set" { Write-JsonResult (Set-MacroStatusResult $payload) }
    default { Write-JsonResult @{ ok = $false; availability = "helper_failed"; running = $false; error = "Unknown helper operation: $Operation" } }
  }
}
catch {
  Write-JsonResult @{ ok = $false; availability = "helper_failed"; running = $false; error = $_.Exception.Message }
  exit 0
}
