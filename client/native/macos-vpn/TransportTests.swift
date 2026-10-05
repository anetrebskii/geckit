import Foundation
import Darwin

final class EngineResult {
    private let lock = NSLock()
    private var result: Int32?

    func set(_ result: Int32) { lock.lock(); self.result = result; lock.unlock() }
    func get() -> Int32? { lock.lock(); defer { lock.unlock() }; return result }
}

func checkEngine(cancelStartup: Bool) throws {
    let input = Pipe(), output = Pipe(), status = Pipe(), control = Pipe()
    let descriptors = [input.fileHandleForReading, output.fileHandleForWriting, status.fileHandleForWriting, control.fileHandleForReading].map { dup($0.fileDescriptor) }
    precondition(descriptors.allSatisfy { $0 >= 0 })
    let result = EngineResult(), group = DispatchGroup()
    group.enter()
    DispatchQueue.global().async {
        result.set(GeckItVPNRun(descriptors[0], descriptors[1], descriptors[2], descriptors[3]))
        group.leave()
    }
    try input.fileHandleForReading.close()
    try output.fileHandleForWriting.close()
    try status.fileHandleForWriting.close()
    try control.fileHandleForReading.close()
    if cancelStartup {
        try control.fileHandleForWriting.close()
    } else {
        try input.fileHandleForWriting.write(contentsOf: Data([0, 0, 0, 0]))
    }
    precondition(group.wait(timeout: .now() + 5) == .success, "Engine shutdown timed out")
    precondition(result.get() == (cancelStartup ? 0 : 1))
    let data = try status.fileHandleForReading.readToEnd() ?? Data()
    struct State: Decodable { let state: String }
    let state = try JSONDecoder().decode(State.self, from: data)
    precondition(state.state == (cancelStartup ? "transport_stopped" : "invalid_configuration"))
    try? input.fileHandleForWriting.close()
    try? control.fileHandleForWriting.close()
    try output.fileHandleForReading.close()
    try status.fileHandleForReading.close()
}

@main
struct TransportTests {
    static func main() throws {
        try checkEngine(cancelStartup: false)
        try checkEngine(cancelStartup: true)
        print("Linked transport framing refusal and startup cancellation passed.")
    }
}
