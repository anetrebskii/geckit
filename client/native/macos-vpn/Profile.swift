import Foundation
import NetworkExtension
import Darwin

let qualificationHostID = "org.anetrebskii.GeckIt.VPNQualification"
let tunnelProviderID = "org.anetrebskii.GeckIt.AgentVPN.Tunnel"
let agentRunnerID = "org.anetrebskii.GeckIt.AgentVPN.RunnerIdentityProbe"

enum NativeVpnError: Int, Error {
    case configuration = 1, packetStream, transport, routing, signing, activation, preferences, command
    var nsError: NSError { NSError(domain: "GeckItAgentVPN", code: rawValue) }
}

struct NativeProfile {
    let text: String
    let addresses: [String]
    let prefixes: [Int]
    let dns: [String]
    let endpoint: String
    let mtu: Int

    init(_ text: String) throws {
        guard text.utf8.count <= 65536 else { throw NativeVpnError.configuration }
        var fields: [String: String] = [:]
        for original in text.split(separator: "\n") {
            let line = original.split(separator: "#", maxSplits: 1).first?.split(separator: ";", maxSplits: 1).first ?? ""
            let parts = line.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            if parts.count != 2 { continue }
            let name = parts[0].trimmingCharacters(in: .whitespacesAndNewlines)
            guard fields[name] == nil else { throw NativeVpnError.configuration }
            fields[name] = parts[1].trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard let rawAddresses = fields["Address"], let rawDNS = fields["DNS"], let remote = fields["Endpoint"], let url = URL(string: "udp://" + remote), let host = url.host, let port = url.port, (1...65535).contains(port) else { throw NativeVpnError.configuration }
        let endpoint = host.trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        guard ipFamily(endpoint) != nil else { throw NativeVpnError.configuration }
        let cidrs = rawAddresses.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        var addresses: [String] = [], prefixes: [Int] = []
        for cidr in cidrs {
            let parts = cidr.split(separator: "/", omittingEmptySubsequences: false)
            guard parts.count == 2, let prefix = Int(parts[1]) else { throw NativeVpnError.configuration }
            let address = String(parts[0])
            guard let family = ipFamily(address), prefix >= 0, prefix <= (family == AF_INET ? 32 : 128) else { throw NativeVpnError.configuration }
            addresses.append(address)
            prefixes.append(prefix)
        }
        let dns = rawDNS.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard !dns.isEmpty, dns.allSatisfy({ ipFamily($0) != nil }), addresses.contains(where: { ipFamily($0) == AF_INET }), addresses.contains(where: { ipFamily($0) == AF_INET6 }) else { throw NativeVpnError.configuration }
        let mtu: Int
        if let rawMTU = fields["MTU"] {
            guard let parsed = Int(rawMTU) else { throw NativeVpnError.configuration }
            mtu = parsed
        } else { mtu = 1280 }
        guard mtu >= 1280, mtu <= 65535 else { throw NativeVpnError.configuration }
        self.text = text
        self.addresses = addresses
        self.prefixes = prefixes
        self.dns = dns
        self.endpoint = endpoint
        self.mtu = mtu
    }

    func networkSettings() -> NEPacketTunnelNetworkSettings {
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: endpoint)
        let v4 = addresses.indices.filter { ipFamily(addresses[$0]) == AF_INET }
        let v6 = addresses.indices.filter { ipFamily(addresses[$0]) == AF_INET6 }
        let ipv4 = NEIPv4Settings(addresses: v4.map { addresses[$0] }, subnetMasks: v4.map { index in
            let mask = prefixes[index] == 0 ? UInt32(0) : UInt32.max << (32 - prefixes[index])
            return [24, 16, 8, 0].map { String((mask >> $0) & 255) }.joined(separator: ".")
        })
        ipv4.includedRoutes = [NEIPv4Route.default()]
        ipv4.excludedRoutes = []
        settings.ipv4Settings = ipv4
        let ipv6 = NEIPv6Settings(addresses: v6.map { addresses[$0] }, networkPrefixLengths: v6.map { NSNumber(value: min(120, prefixes[$0])) })
        ipv6.includedRoutes = [NEIPv6Route.default()]
        ipv6.excludedRoutes = []
        settings.ipv6Settings = ipv6
        let resolver = NEDNSSettings(servers: dns)
        resolver.matchDomains = [""]
        settings.dnsSettings = resolver
        settings.mtu = NSNumber(value: mtu)
        return settings
    }
}

func ipFamily(_ address: String) -> Int32? {
    var v4 = in_addr(), v6 = in6_addr()
    if address.withCString({ inet_pton(AF_INET, $0, &v4) }) == 1 { return AF_INET }
    if address.withCString({ inet_pton(AF_INET6, $0, &v6) }) == 1 { return AF_INET6 }
    return nil
}

func readExact(_ handle: FileHandle, count: Int) throws -> Data {
    var data = Data()
    while data.count < count {
        guard let part = try handle.read(upToCount: count - data.count), !part.isEmpty else { throw NativeVpnError.packetStream }
        data.append(part)
    }
    return data
}

func writeFrame(_ handle: FileHandle, data: Data) throws {
    var size = UInt32(data.count).bigEndian
    var frame = withUnsafeBytes(of: &size) { Data($0) }
    frame.append(data)
    try handle.write(contentsOf: frame)
}

func readFrame(_ handle: FileHandle, limit: Int) throws -> Data {
    let header = try readExact(handle, count: 4)
    let size = header.reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
    guard size > 0, size <= limit else { throw NativeVpnError.packetStream }
    return try readExact(handle, count: Int(size))
}
