import Foundation
import NetworkExtension

@main
struct NativeTests {
    static func main() throws {
        let text = "[Interface]\nAddress = 10.10.0.2/32, fd00::2/128\nDNS = 10.10.0.1, fd00::1\nMTU = 1280\n[Peer]\nEndpoint = 127.0.0.1:51820\n"
        let profile = try NativeProfile(text)
        let settings = profile.networkSettings()
        precondition(settings.ipv4Settings?.includedRoutes?.count == 1)
        precondition(settings.ipv6Settings?.includedRoutes?.count == 1)
        precondition(settings.ipv6Settings?.networkPrefixLengths == [120])
        let subnet = try NativeProfile(text.replacingOccurrences(of: "fd00::2/128", with: "fd00::2/64"))
        precondition(subnet.networkSettings().ipv6Settings?.networkPrefixLengths == [64])
        precondition(settings.ipv4Settings?.excludedRoutes?.isEmpty == true)
        precondition(settings.ipv6Settings?.excludedRoutes?.isEmpty == true)
        precondition(settings.dnsSettings?.servers == ["10.10.0.1", "fd00::1"])
        precondition(settings.dnsSettings?.matchDomains == [""])
        for invalid in [
            text + "Address = 10.10.0.3/32\n",
            text.replacingOccurrences(of: "fd00::2/128", with: "fd00::2/129"),
            text.replacingOccurrences(of: "10.10.0.1, fd00::1", with: "example.test"),
            text.replacingOccurrences(of: "MTU = 1280", with: "MTU = 1279"),
            text.replacingOccurrences(of: "MTU = 1280", with: "MTU = invalid"),
            text.replacingOccurrences(of: "127.0.0.1:51820", with: "127.0.0.1:0"),
            text.replacingOccurrences(of: "127.0.0.1:51820", with: "127.0.0.1"),
            String(repeating: "x", count: 65537)
        ] {
            do { _ = try NativeProfile(invalid); preconditionFailure("Invalid metadata accepted") }
            catch NativeVpnError.configuration { }
        }
        let pipe = Pipe()
        let packet = Data([0x45, 0, 0, 4])
        try writeFrame(pipe.fileHandleForWriting, data: packet)
        let received = try readFrame(pipe.fileHandleForReading, limit: 1280)
        precondition(received == packet)
        try pipe.fileHandleForWriting.write(contentsOf: Data([0, 0, 5, 1]))
        do { _ = try readFrame(pipe.fileHandleForReading, limit: 1280); preconditionFailure("Oversized frame accepted") }
        catch NativeVpnError.packetStream { }
        try pipe.fileHandleForWriting.write(contentsOf: Data([0, 0]))
        try pipe.fileHandleForWriting.close()
        do { _ = try readFrame(pipe.fileHandleForReading, limit: 1280); preconditionFailure("Truncated frame accepted") }
        catch NativeVpnError.packetStream { }
        try pipe.fileHandleForReading.close()
        print("Native profile, dual-stack routes, DNS and packet framing checks passed.")
    }
}
