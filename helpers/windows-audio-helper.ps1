$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'

$source = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace BasicBit.VbAudio.Windows
{
    [Flags]
    internal enum DeviceState : uint
    {
        Active = 0x1,
        Disabled = 0x2,
        NotPresent = 0x4,
        Unplugged = 0x8,
        All = 0xF
    }

    internal enum DataFlow
    {
        Render = 0,
        Capture = 1,
        All = 2
    }

    internal enum Role
    {
        Console = 0,
        Multimedia = 1,
        Communications = 2
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct PropertyKey
    {
        public Guid FormatId;
        public uint PropertyId;

        public PropertyKey(string formatId, uint propertyId)
        {
            FormatId = new Guid(formatId);
            PropertyId = propertyId;
        }
    }

    [StructLayout(LayoutKind.Explicit)]
    internal struct PropVariant
    {
        [FieldOffset(0)] public ushort VariantType;
        [FieldOffset(8)] public IntPtr PointerValue;
        [FieldOffset(8)] public uint UIntValue;
        [FieldOffset(8)] public int IntValue;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    internal struct WaveFormatEx
    {
        public ushort FormatTag;
        public ushort Channels;
        public uint SamplesPerSecond;
        public uint AverageBytesPerSecond;
        public ushort BlockAlign;
        public ushort BitsPerSample;
        public ushort ExtraSize;
    }

    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumeratorComObject
    {
    }

    [ComImport]
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator
    {
        [PreserveSig]
        int EnumAudioEndpoints(DataFlow dataFlow, DeviceState stateMask, out IMMDeviceCollection devices);

        [PreserveSig]
        int GetDefaultAudioEndpoint(DataFlow dataFlow, Role role, out IMMDevice endpoint);

        [PreserveSig]
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);

        [PreserveSig]
        int RegisterEndpointNotificationCallback(IntPtr client);

        [PreserveSig]
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport]
    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceCollection
    {
        [PreserveSig]
        int GetCount(out uint count);

        [PreserveSig]
        int Item(uint index, out IMMDevice device);
    }

    [ComImport]
    [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice
    {
        [PreserveSig]
        int Activate(ref Guid interfaceId, uint classContext, IntPtr activationParameters,
            [MarshalAs(UnmanagedType.IUnknown)] out object instance);

        [PreserveSig]
        int OpenPropertyStore(uint accessMode, out IPropertyStore properties);

        [PreserveSig]
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);

        [PreserveSig]
        int GetState(out DeviceState state);
    }

    [ComImport]
    [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPropertyStore
    {
        [PreserveSig]
        int GetCount(out uint count);

        [PreserveSig]
        int GetAt(uint index, out PropertyKey key);

        [PreserveSig]
        int GetValue(ref PropertyKey key, out PropVariant value);

        [PreserveSig]
        int SetValue(ref PropertyKey key, ref PropVariant value);

        [PreserveSig]
        int Commit();
    }

    [ComImport]
    [Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioClient
    {
        [PreserveSig]
        int Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity,
            IntPtr format, IntPtr audioSessionGuid);

        [PreserveSig]
        int GetBufferSize(out uint bufferFrameCount);

        [PreserveSig]
        int GetStreamLatency(out long latency);

        [PreserveSig]
        int GetCurrentPadding(out uint currentPadding);

        [PreserveSig]
        int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closestMatch);

        [PreserveSig]
        int GetMixFormat(out IntPtr deviceFormat);

        [PreserveSig]
        int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);

        [PreserveSig]
        int Start();

        [PreserveSig]
        int Stop();

        [PreserveSig]
        int Reset();

        [PreserveSig]
        int SetEventHandle(IntPtr eventHandle);

        [PreserveSig]
        int GetService(ref Guid interfaceId, out IntPtr service);
    }

    public static class CoreAudioReader
    {
        private const uint ClassContextAll = 0x17;
        private const uint StorageRead = 0;
        private const ushort VariantString = 31;
        private const ushort VariantBstr = 8;
        private const ushort VariantUInt = 19;
        private const ushort VariantInt = 3;
        private const ushort VariantGuid = 72;

        private static readonly Guid AudioClientId = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
        private static readonly PropertyKey DeviceDescription =
            new PropertyKey("A45C254E-DF1C-4EFD-8020-67D146A850E0", 2);
        private static readonly PropertyKey FriendlyName =
            new PropertyKey("A45C254E-DF1C-4EFD-8020-67D146A850E0", 14);
        private static readonly PropertyKey InterfaceFriendlyName =
            new PropertyKey("026E516E-B814-414B-83CD-856D6FEF4822", 2);
        private static readonly PropertyKey EndpointPolicyGuid =
            new PropertyKey("9637B4B9-11EE-4C35-B43C-7B2452C993CC", 1);
        private static readonly PropertyKey InterfacePath =
            new PropertyKey("9C119480-DDC2-4954-A150-5BD240D454AD", 1);

        [DllImport("ole32.dll")]
        private static extern int PropVariantClear(ref PropVariant value);

        [DllImport("ole32.dll")]
        private static extern void CoTaskMemFree(IntPtr memory);

        private static void ThrowIfFailed(int result, string operation)
        {
            if (result < 0)
            {
                throw new COMException(operation + " failed", result);
            }
        }

        private static void Release(object value)
        {
            if (value != null && Marshal.IsComObject(value))
            {
                Marshal.FinalReleaseComObject(value);
            }
        }

        private static string Limit(string value, int maximum)
        {
            if (String.IsNullOrEmpty(value)) return String.Empty;
            return value.Length <= maximum ? value : value.Substring(0, maximum);
        }

        private static object ReadProperty(IPropertyStore store, PropertyKey requestedKey)
        {
            PropVariant value;
            PropertyKey key = requestedKey;
            int result = store.GetValue(ref key, out value);
            if (result < 0) return null;
            try
            {
                if (value.VariantType == VariantString && value.PointerValue != IntPtr.Zero)
                    return Marshal.PtrToStringUni(value.PointerValue);
                if (value.VariantType == VariantBstr && value.PointerValue != IntPtr.Zero)
                    return Marshal.PtrToStringBSTR(value.PointerValue);
                if (value.VariantType == VariantUInt) return value.UIntValue;
                if (value.VariantType == VariantInt) return value.IntValue;
                if (value.VariantType == VariantGuid && value.PointerValue != IntPtr.Zero)
                    return ((Guid)Marshal.PtrToStructure(value.PointerValue, typeof(Guid))).ToString("B");
                return null;
            }
            finally
            {
                PropVariantClear(ref value);
            }
        }

        private static string ReadString(IPropertyStore store, PropertyKey key, int maximum)
        {
            object value = ReadProperty(store, key);
            return Limit(value == null ? String.Empty : Convert.ToString(value), maximum);
        }

        private static string StateName(DeviceState state)
        {
            if ((state & DeviceState.Active) != 0) return "active";
            if ((state & DeviceState.Disabled) != 0) return "disabled";
            if ((state & DeviceState.Unplugged) != 0) return "unplugged";
            if ((state & DeviceState.NotPresent) != 0) return "not_present";
            return "unknown";
        }

        private static Dictionary<string, object> MixFormat(IMMDevice device, DeviceState state)
        {
            Dictionary<string, object> result = new Dictionary<string, object>();
            if ((state & DeviceState.Active) == 0)
            {
                result["available"] = false;
                result["reason"] = "endpoint_not_active";
                return result;
            }

            object instance = null;
            IntPtr formatPointer = IntPtr.Zero;
            try
            {
                Guid audioClientId = AudioClientId;
                int activateResult = device.Activate(ref audioClientId, ClassContextAll, IntPtr.Zero, out instance);
                if (activateResult < 0 || instance == null)
                {
                    result["available"] = false;
                    result["hresult"] = String.Format("0x{0:X8}", activateResult);
                    return result;
                }
                IAudioClient client = (IAudioClient)instance;
                int formatResult = client.GetMixFormat(out formatPointer);
                if (formatResult < 0 || formatPointer == IntPtr.Zero)
                {
                    result["available"] = false;
                    result["hresult"] = String.Format("0x{0:X8}", formatResult);
                    return result;
                }
                WaveFormatEx format = (WaveFormatEx)Marshal.PtrToStructure(formatPointer, typeof(WaveFormatEx));
                result["available"] = true;
                result["channels"] = (int)format.Channels;
                result["sampleRateHz"] = (long)format.SamplesPerSecond;
                result["bitsPerSample"] = (int)format.BitsPerSample;
                result["blockAlign"] = (int)format.BlockAlign;
                result["averageBytesPerSecond"] = (long)format.AverageBytesPerSecond;
                result["formatTag"] = (int)format.FormatTag;
                return result;
            }
            catch (Exception exception)
            {
                result["available"] = false;
                COMException comException = exception as COMException;
                if (comException != null)
                    result["hresult"] = String.Format("0x{0:X8}", comException.ErrorCode);
                else
                    result["reason"] = "mix_format_unavailable";
                return result;
            }
            finally
            {
                if (formatPointer != IntPtr.Zero) CoTaskMemFree(formatPointer);
                Release(instance);
            }
        }

        private static Dictionary<string, List<string>> DefaultRoleMap(IMMDeviceEnumerator enumerator)
        {
            Dictionary<string, List<string>> result =
                new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
            DataFlow[] flows = new DataFlow[] { DataFlow.Render, DataFlow.Capture };
            Role[] roles = new Role[] { Role.Console, Role.Multimedia, Role.Communications };
            foreach (DataFlow flow in flows)
            {
                foreach (Role role in roles)
                {
                    IMMDevice device = null;
                    try
                    {
                        int status = enumerator.GetDefaultAudioEndpoint(flow, role, out device);
                        if (status < 0 || device == null) continue;
                        string id;
                        if (device.GetId(out id) < 0 || String.IsNullOrEmpty(id)) continue;
                        List<string> selectedRoles;
                        if (!result.TryGetValue(id, out selectedRoles))
                        {
                            selectedRoles = new List<string>();
                            result[id] = selectedRoles;
                        }
                        selectedRoles.Add(RoleName(role));
                    }
                    finally
                    {
                        Release(device);
                    }
                }
            }
            return result;
        }

        private static string FlowName(DataFlow flow)
        {
            return flow == DataFlow.Render ? "render" : "capture";
        }

        private static string RoleName(Role role)
        {
            if (role == Role.Console) return "console";
            if (role == Role.Multimedia) return "multimedia";
            return "communications";
        }

        private static Dictionary<string, object> Endpoint(
            IMMDevice device,
            DataFlow flow,
            Dictionary<string, List<string>> defaultRoles,
            bool includeMixFormat)
        {
            string id;
            DeviceState state;
            ThrowIfFailed(device.GetId(out id), "IMMDevice.GetId");
            ThrowIfFailed(device.GetState(out state), "IMMDevice.GetState");
            IPropertyStore properties = null;
            try
            {
                ThrowIfFailed(device.OpenPropertyStore(StorageRead, out properties), "IMMDevice.OpenPropertyStore");
                Dictionary<string, object> endpoint = new Dictionary<string, object>();
                endpoint["id"] = Limit(id, 2048);
                endpoint["dataFlow"] = FlowName(flow);
                endpoint["state"] = StateName(state);
                endpoint["stateValue"] = (long)state;
                endpoint["friendlyName"] = ReadString(properties, FriendlyName, 1024);
                endpoint["deviceDescription"] = ReadString(properties, DeviceDescription, 1024);
                endpoint["interfaceFriendlyName"] = ReadString(properties, InterfaceFriendlyName, 1024);
                endpoint["policyGuid"] = ReadString(properties, EndpointPolicyGuid, 128);
                endpoint["interfacePath"] = ReadString(properties, InterfacePath, 2048);
                List<string> roles;
                endpoint["defaultRoles"] = defaultRoles.TryGetValue(id, out roles)
                    ? roles.ToArray()
                    : new string[0];
                if (includeMixFormat) endpoint["mixFormat"] = MixFormat(device, state);
                return endpoint;
            }
            finally
            {
                Release(properties);
            }
        }

        private static List<DataFlow> SelectedFlows(string requestedFlow)
        {
            string normalized = (requestedFlow ?? "all").Trim().ToLowerInvariant();
            if (normalized == "render") return new List<DataFlow> { DataFlow.Render };
            if (normalized == "capture") return new List<DataFlow> { DataFlow.Capture };
            if (normalized == "all") return new List<DataFlow> { DataFlow.Render, DataFlow.Capture };
            throw new ArgumentException("flow must be all, render, or capture");
        }

        private static bool MatchesFilter(Dictionary<string, object> endpoint, string filter)
        {
            if (String.IsNullOrEmpty(filter)) return true;
            string[] fields = new string[]
            {
                Convert.ToString(endpoint["id"]),
                Convert.ToString(endpoint["friendlyName"]),
                Convert.ToString(endpoint["deviceDescription"]),
                Convert.ToString(endpoint["interfaceFriendlyName"])
            };
            foreach (string field in fields)
            {
                if (!String.IsNullOrEmpty(field) &&
                    field.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0) return true;
            }
            return false;
        }

        public static Dictionary<string, object> GetStatus()
        {
            IMMDeviceEnumerator enumerator = null;
            try
            {
                enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                Dictionary<string, object> result = new Dictionary<string, object>();
                result["schemaVersion"] = "windows_audio.status.v1";
                result["ok"] = true;
                result["availability"] = "available";
                result["platform"] = "windows";
                return result;
            }
            finally
            {
                Release(enumerator);
            }
        }

        public static Dictionary<string, object> GetEndpoints(
            string requestedFlow,
            bool includeInactive,
            string nameFilter,
            int requestedMaximum)
        {
            IMMDeviceEnumerator enumerator = null;
            List<Dictionary<string, object>> endpoints = new List<Dictionary<string, object>>();
            int matchedCount = 0;
            int maximum = Math.Max(1, Math.Min(200, requestedMaximum));
            string filter = Limit(nameFilter ?? String.Empty, 128);
            try
            {
                enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                Dictionary<string, List<string>> defaultRoles = DefaultRoleMap(enumerator);
                foreach (DataFlow flow in SelectedFlows(requestedFlow))
                {
                    IMMDeviceCollection collection = null;
                    try
                    {
                        DeviceState mask = includeInactive ? DeviceState.All : DeviceState.Active;
                        ThrowIfFailed(
                            enumerator.EnumAudioEndpoints(flow, mask, out collection),
                            "IMMDeviceEnumerator.EnumAudioEndpoints");
                        uint count;
                        ThrowIfFailed(collection.GetCount(out count), "IMMDeviceCollection.GetCount");
                        for (uint index = 0; index < count; index++)
                        {
                            IMMDevice device = null;
                            try
                            {
                                ThrowIfFailed(collection.Item(index, out device), "IMMDeviceCollection.Item");
                                Dictionary<string, object> endpoint =
                                    Endpoint(device, flow, defaultRoles, endpoints.Count < maximum);
                                if (!MatchesFilter(endpoint, filter)) continue;
                                matchedCount++;
                                if (endpoints.Count < maximum) endpoints.Add(endpoint);
                            }
                            finally
                            {
                                Release(device);
                            }
                        }
                    }
                    finally
                    {
                        Release(collection);
                    }
                }

                Dictionary<string, object> result = new Dictionary<string, object>();
                result["schemaVersion"] = "windows_audio.endpoints.v1";
                result["ok"] = true;
                result["availability"] = "available";
                result["platform"] = "windows";
                result["flow"] = requestedFlow;
                result["includeInactive"] = includeInactive;
                result["nameFilter"] = filter;
                result["matchedCount"] = matchedCount;
                result["returnedCount"] = endpoints.Count;
                result["truncated"] = matchedCount > endpoints.Count;
                result["endpoints"] = endpoints.ToArray();
                return result;
            }
            finally
            {
                Release(enumerator);
            }
        }

        public static Dictionary<string, object> GetDefaults()
        {
            IMMDeviceEnumerator enumerator = null;
            List<Dictionary<string, object>> rows = new List<Dictionary<string, object>>();
            try
            {
                enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                Dictionary<string, List<string>> defaults = DefaultRoleMap(enumerator);
                DataFlow[] flows = new DataFlow[] { DataFlow.Render, DataFlow.Capture };
                Role[] roles = new Role[] { Role.Console, Role.Multimedia, Role.Communications };
                foreach (DataFlow flow in flows)
                {
                    foreach (Role role in roles)
                    {
                        Dictionary<string, object> row = new Dictionary<string, object>();
                        row["dataFlow"] = FlowName(flow);
                        row["role"] = RoleName(role);
                        IMMDevice device = null;
                        try
                        {
                            int status = enumerator.GetDefaultAudioEndpoint(flow, role, out device);
                            if (status < 0 || device == null)
                            {
                                row["available"] = false;
                                row["hresult"] = String.Format("0x{0:X8}", status);
                            }
                            else
                            {
                                row["available"] = true;
                                row["endpoint"] = Endpoint(device, flow, defaults, false);
                            }
                        }
                        finally
                        {
                            Release(device);
                        }
                        rows.Add(row);
                    }
                }
                Dictionary<string, object> result = new Dictionary<string, object>();
                result["schemaVersion"] = "windows_audio.defaults.v1";
                result["ok"] = true;
                result["availability"] = "available";
                result["platform"] = "windows";
                result["defaults"] = rows.ToArray();
                return result;
            }
            finally
            {
                Release(enumerator);
            }
        }
    }
}
'@

try {
    $requestLine = [Console]::In.ReadLine()
    if ([string]::IsNullOrWhiteSpace($requestLine)) {
        throw 'Windows audio helper requires one JSON request line on stdin.'
    }
    if ([Text.Encoding]::UTF8.GetByteCount($requestLine) -gt 65536) {
        throw 'Windows audio helper request exceeds 65536 bytes.'
    }
    $request = $requestLine | ConvertFrom-Json
    if ([int]$request.protocolVersion -ne 1) {
        throw 'Unsupported Windows audio helper protocol version.'
    }
    $requestId = [string]$request.requestId
    if ($requestId -notmatch '^[A-Za-z0-9-]{1,64}$') {
        throw 'Windows audio helper requestId is invalid.'
    }
    $operation = [string]$request.operation
    if ($operation -notin @('status', 'endpoints', 'defaults')) {
        throw 'Windows audio helper operation is invalid.'
    }
    $payload = $request.payload

    Add-Type -TypeDefinition $source -Language CSharp

    switch ($operation) {
        'status' {
            $result = [BasicBit.VbAudio.Windows.CoreAudioReader]::GetStatus()
        }
        'endpoints' {
            $flow = if ($null -ne $payload.flow) { [string]$payload.flow } else { 'all' }
            $includeInactive = if ($null -ne $payload.includeInactive) { [bool]$payload.includeInactive } else { $false }
            $nameFilter = if ($null -ne $payload.nameFilter) { [string]$payload.nameFilter } else { '' }
            $maxEndpoints = if ($null -ne $payload.maxEndpoints) { [int]$payload.maxEndpoints } else { 80 }
            $result = [BasicBit.VbAudio.Windows.CoreAudioReader]::GetEndpoints(
                $flow,
                $includeInactive,
                $nameFilter,
                $maxEndpoints
            )
        }
        'defaults' {
            $result = [BasicBit.VbAudio.Windows.CoreAudioReader]::GetDefaults()
        }
    }

    $response = [ordered]@{
        protocolVersion = 1
        requestId = $requestId
    }
    foreach ($entry in $result.GetEnumerator()) {
        $response[$entry.Key] = $entry.Value
    }
    $responseJson = $response | ConvertTo-Json -Depth 8 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($responseJson) -gt 524288) {
        throw 'Windows audio helper response exceeds 524288 bytes.'
    }
    $responseJson
}
catch {
    $exception = $_.Exception
    $errorCode = if ($null -ne $exception.HResult) {
        '0x{0:X8}' -f ($exception.HResult -band 0xffffffffL)
    }
    else {
        'unknown'
    }
    $detail = [string]$exception.Message
    if ($detail.Length -gt 512) {
        $detail = $detail.Substring(0, 512)
    }
    [ordered]@{
        protocolVersion = 1
        requestId = if ($null -ne $requestId) { $requestId } else { '' }
        schemaVersion = 'windows_audio.error.v1'
        ok = $false
        availability = 'helper_failed'
        code = 'windows_audio_core_audio_failed'
        hresult = $errorCode
        error = 'Windows Core Audio inspection failed.'
        detail = $detail
    } | ConvertTo-Json -Compress
}
