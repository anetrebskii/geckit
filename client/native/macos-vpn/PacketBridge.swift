import Foundation
import NetworkExtension
import Darwin
import os

final class PacketBridge {
    private let logger = Logger(subsystem: tunnelProviderID, category: "qualification")
    private let input = Pipe(), output = Pipe(), status = Pipe(), control = Pipe()
    private let lock = NSLock()
    private var stopped = false
    private var captured = 0, delivered = 0
    private var dnsIPv4Captured = 0, dnsIPv4Delivered = 0
    private let outbound = DispatchQueue(label: "GeckItAgentVPN.outbound")
    private let inbound = DispatchQueue(label: "GeckItAgentVPN.inbound")
    private let profile: NativeProfile
    private let failed: () -> Void

    init(profile: NativeProfile, failed: @escaping () -> Void) {
        self.profile = profile
        self.failed = failed
    }

    private var active: Bool {
        lock.lock()
        defer { lock.unlock() }
        return !stopped
    }

    func start() throws {
        lock.lock()
        guard !stopped else { lock.unlock(); throw NativeVpnError.transport }
        let descriptors = [input.fileHandleForReading, output.fileHandleForWriting, status.fileHandleForWriting, control.fileHandleForReading].map { dup($0.fileDescriptor) }
        guard descriptors.allSatisfy({ $0 >= 0 }) else {
            for descriptor in descriptors where descriptor >= 0 { close(descriptor) }
            lock.unlock()
            throw NativeVpnError.transport
        }
        DispatchQueue.global().async { [weak self] in
            let result = GeckItVPNRun(descriptors[0], descriptors[1], descriptors[2], descriptors[3])
            if result != 0 { self?.logger.error("transport_engine_failed code=\(result, privacy: .public)") }
            self?.fail()
        }
        lock.unlock()
        let timeout = DispatchWorkItem { [weak self] in self?.fail() }
        DispatchQueue.global().asyncAfter(deadline: .now() + 10, execute: timeout)
        defer { timeout.cancel() }
        try input.fileHandleForReading.close()
        try output.fileHandleForWriting.close()
        try status.fileHandleForWriting.close()
        try control.fileHandleForReading.close()
        try writeFrame(input.fileHandleForWriting, data: Data(profile.text.utf8))
        var line = Data()
        while line.count < 256 {
            let byte = try readExact(status.fileHandleForReading, count: 1)
            if byte[0] == 10 { break }
            line.append(byte)
        }
        struct Status: Decodable { let state: String }
        guard active, let decoded = try? JSONDecoder().decode(Status.self, from: line), decoded.state == "transport_ready" else {
            logger.error("transport_readiness_failed")
            throw NativeVpnError.transport
        }
    }

    func pump(_ flow: NEPacketTunnelFlow) {
        guard active else { return }
        flow.readPackets { [weak self] packets, _ in
            guard let self, self.active else { return }
            self.lock.lock()
            self.captured += packets.count
            self.dnsIPv4Captured += packets.filter(Self.isIPv4DNS).count
            self.lock.unlock()
            self.outbound.async {
                guard self.active else { return }
                do {
                    for packet in packets {
                        guard packet.count <= self.profile.mtu else { throw NativeVpnError.packetStream }
                        try writeFrame(self.input.fileHandleForWriting, data: packet)
                    }
                    self.pump(flow)
                } catch { self.fail() }
            }
        }
    }

    func receive(_ flow: NEPacketTunnelFlow) {
        inbound.async { [weak self] in
            guard let self else { return }
            do {
                while self.active {
                    let packet = try readFrame(self.output.fileHandleForReading, limit: self.profile.mtu)
                    guard let first = packet.first else { throw NativeVpnError.packetStream }
                    let family: Int32
                    switch first >> 4 {
                    case 4: family = AF_INET
                    case 6: family = AF_INET6
                    default: throw NativeVpnError.packetStream
                    }
                    guard flow.writePackets([packet], withProtocols: [NSNumber(value: family)]) else { throw NativeVpnError.packetStream }
                    self.lock.lock()
                    self.delivered += 1
                    if Self.isIPv4DNS(packet) { self.dnsIPv4Delivered += 1 }
                    self.lock.unlock()
                }
            } catch { self.fail() }
        }
    }

    private func fail() {
        if stop() { failed() }
    }

    private static func isIPv4DNS(_ packet: Data) -> Bool {
        guard packet.count >= 20, packet[0] >> 4 == 4, packet[9] == 17 else { return false }
        let header = Int(packet[0] & 15) * 4
        guard header >= 20, packet.count >= header + 8 else { return false }
        let source = UInt16(packet[header]) << 8 | UInt16(packet[header + 1])
        let destination = UInt16(packet[header + 2]) << 8 | UInt16(packet[header + 3])
        return source == 53 || destination == 53
    }

    @discardableResult
    func stop() -> Bool {
        lock.lock()
        guard !stopped else { lock.unlock(); return false }
        stopped = true
        let captured = captured, delivered = delivered, dnsCaptured = dnsIPv4Captured, dnsDelivered = dnsIPv4Delivered
        lock.unlock()
        logger.info("packet_counts captured=\(captured, privacy: .public) delivered=\(delivered, privacy: .public) dns_ipv4_captured=\(dnsCaptured, privacy: .public) dns_ipv4_delivered=\(dnsDelivered, privacy: .public)")
        try? control.fileHandleForWriting.close()
        try? input.fileHandleForWriting.close()
        try? output.fileHandleForReading.close()
        try? status.fileHandleForReading.close()
        return true
    }
}
