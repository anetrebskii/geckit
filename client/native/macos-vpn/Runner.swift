import Foundation
import Darwin

@main
struct Runner {
    static func main() {
        let args = Array(CommandLine.arguments.dropFirst())
        #if VPN_DNS_PROBE
        if args.count == 2, ["--qualify-dns", "--qualify-udp"].contains(args[0]), args[1].hasPrefix("/private/tmp/geckit-vpn-") {
            DNSProbe(output: URL(fileURLWithPath: args[1]), echo: args[0] == "--qualify-udp").run()
            return
        }
        #endif
        guard let executable = args.first, executable.hasPrefix("/") else { exit(64) }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = Array(args.dropFirst())
        process.environment = ProcessInfo.processInfo.environment
        process.standardInput = FileHandle.standardInput
        process.standardOutput = FileHandle.standardOutput
        process.standardError = FileHandle.standardError
        do { try process.run() } catch { exit(70) }
        process.waitUntilExit()
        exit(process.terminationStatus)
    }
}
