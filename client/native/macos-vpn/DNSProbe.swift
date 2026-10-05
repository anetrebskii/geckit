import Foundation
import Network

final class DNSProbe {
    private let finished = DispatchSemaphore(value: 0)
    private let lock = NSLock()
    private var complete = false
    private let output: URL
    private let connection: NWConnection
    private let echo: Bool
    private var events: [String] = []

    init(output: URL, echo: Bool = false) {
        self.output = output
        self.echo = echo
        connection = NWConnection(host: "10.91.0.1", port: echo ? 8092 : 53, using: .udp)
    }

    func run() {
        var query = Data([0x67, 0x56, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0])
        for label in ("geckit-" + UUID().uuidString + ".tunnel.test").split(separator: ".") {
            query.append(UInt8(label.utf8.count))
            query.append(contentsOf: label.utf8)
        }
        query.append(contentsOf: [0, 0, 1, 0, 1])
        connection.stateUpdateHandler = { [self] state in
            switch state {
            case .ready:
                record("ready")
                connection.send(content: query, completion: .contentProcessed { [self] error in
                    guard error == nil else { record(errorCode(error)); finish(false); return }
                    record("sent")
                    connection.receiveMessage { [self] data, _, _, error in
                        if let error { record(errorCode(error)) }
                        let valid = error == nil && data.map { packet in
                            if echo { return packet == query }
                            return packet.count >= 12 && packet[0] == 0x67 && packet[1] == 0x56 && packet[2] & 0x80 != 0 && packet[3] & 15 == 0 && packet.suffix(4) == Data([10, 91, 0, 1])
                        } == true
                        finish(valid)
                    }
                })
            case .waiting(let error): record("waiting"); record(errorCode(error))
            case .failed(let error): record("failed"); record(errorCode(error)); finish(false)
            default: break
            }
        }
        connection.start(queue: DispatchQueue(label: "GeckItAgentVPN.DNSProbe"))
        if finished.wait(timeout: .now() + 4) == .timedOut { record("timeout"); finish(false) }
        connection.cancel()
    }

    private func record(_ event: String) {
        lock.lock()
        defer { lock.unlock() }
        if !complete { events.append(event) }
    }

    private func errorCode(_ error: NWError?) -> String {
        switch error {
        case .posix(let code): return "posix_" + String(code.rawValue)
        case .dns(let code): return "dns_" + String(code)
        case .tls(let code): return "tls_" + String(code)
        default: return "unknown_error"
        }
    }

    private func finish(_ passed: Bool) {
        lock.lock()
        defer { lock.unlock() }
        guard !complete else { return }
        complete = true
        if let data = try? JSONSerialization.data(withJSONObject: ["results": [echo ? "udp_echo" : "dns_udp": passed], "events": events, "completed": true]) {
            try? data.write(to: output, options: .atomic)
        }
        finished.signal()
    }
}
