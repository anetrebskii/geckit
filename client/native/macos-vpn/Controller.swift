import AppKit
import Foundation
import NetworkExtension
import Security
import SystemExtensions

struct QualificationState: Encodable {
    let state: String
    let code: Int?
}

func emit(_ state: String, code: Int? = nil) {
    if let data = try? JSONEncoder().encode(QualificationState(state: state, code: code)) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
    }
}

final class Controller: NSObject, OSSystemExtensionRequestDelegate {
    private let command: String
    private var request: OSSystemExtensionRequest?
    private var observing: NSObjectProtocol?
    private let team: String

    init(command: String, team: String) {
        self.command = command
        self.team = team
    }

    private var runnerURL: URL {
        Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/GeckIt Agent.app/Contents/MacOS/GeckItAgent")
    }

    private var runnerRequirement: String {
        "identifier \"" + agentRunnerID + "\" and anchor apple generic and certificate leaf[subject.OU] = \"" + team + "\""
    }

    private func signingReady() -> Bool {
        guard team.range(of: "^[A-Z0-9]{10}$", options: .regularExpression) != nil,
              FileManager.default.fileExists(atPath: Bundle.main.bundleURL.appendingPathComponent("Contents/embedded.provisionprofile").path) else { return false }
        var requirement: SecRequirement?
        guard SecRequirementCreateWithString(("anchor apple generic and certificate leaf[subject.OU] = \"" + team + "\"") as CFString, [], &requirement) == errSecSuccess else { return false }
        for url in [Bundle.main.bundleURL, Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/GeckIt Agent.app"), Bundle.main.bundleURL.appendingPathComponent("Contents/Library/SystemExtensions/" + tunnelProviderID + ".systemextension")] {
            var code: SecStaticCode?
            guard SecStaticCodeCreateWithPath(url as CFURL, [], &code) == errSecSuccess, let code,
                  SecStaticCodeCheckValidity(code, [], requirement) == errSecSuccess else { return false }
        }
        return true
    }

    func start() {
        guard ["activate", "activate-replacing", "configure", "configure-identity", "configure-relocated", "start", "start-default-dns", "stop", "status", "remove"].contains(command) else { emit("invalid_command"); exit(64) }
        guard signingReady() else { emit("provisioned_signature_required"); exit(78) }
        if command == "activate" || command == "activate-replacing" {
            _ = NSApplication.shared
            NSApplication.shared.setActivationPolicy(.accessory)
            let request = OSSystemExtensionRequest.activationRequest(forExtensionWithIdentifier: tunnelProviderID, queue: .main)
            request.delegate = self
            self.request = request
            OSSystemExtensionManager.shared.submitRequest(request)
            return
        }
        NETunnelProviderManager.loadAllFromPreferences { [self] managers, error in
            guard error == nil else { emit("preferences_failed", code: (error as NSError?)?.code); exit(78) }
            let matches = (managers ?? []).filter { ($0.protocolConfiguration as? NETunnelProviderProtocol)?.providerBundleIdentifier == tunnelProviderID }
            guard matches.count <= 1 else { emit("ambiguous_configuration"); exit(78) }
            if ["configure", "configure-identity", "configure-relocated"].contains(command) { configure(matches.first); return }
            guard let manager = matches.first, manager.routingMethod == .sourceApplication else { emit("per_app_configuration_required"); exit(78) }
            switch command {
            case "status": emit("native_status_unqualified", code: manager.connection.status.rawValue); exit(0)
            case "stop": manager.connection.stopVPNTunnel(); emit("stop_requested_unqualified"); exit(0)
            case "remove":
                manager.connection.stopVPNTunnel()
                manager.removeFromPreferences { error in emit(error == nil ? "configuration_removed" : "preferences_failed", code: (error as NSError?)?.code); exit(error == nil ? 0 : 78) }
            case "start", "start-default-dns": connect(manager)
            default: emit("invalid_command"); exit(64)
            }
        }
    }

    private func configure(_ existing: NETunnelProviderManager?) {
        let manager = existing ?? NETunnelProviderManager.forPerAppVPN()
        guard manager.routingMethod == .sourceApplication else { emit("per_app_configuration_required"); exit(78) }
        let rule = NEAppRule(signingIdentifier: agentRunnerID, designatedRequirement: runnerRequirement)
        if command == "configure" { rule.matchPath = runnerURL.path }
        if command == "configure-relocated" { rule.matchPath = "/Applications/GeckIt Agent Qualification.app/Contents/MacOS/GeckItAgent" }
        rule.matchTools = nil
        manager.appRules = [rule]
        manager.excludedDomains = []
        manager.safariDomains = []
        let configuration = NETunnelProviderProtocol()
        configuration.providerBundleIdentifier = tunnelProviderID
        configuration.serverAddress = "GeckIt Agent VPN Qualification"
        configuration.providerConfiguration = ["qualification": true]
        configuration.includeAllNetworks = false
        configuration.enforceRoutes = true
        configuration.disconnectOnSleep = false
        manager.protocolConfiguration = configuration
        manager.localizedDescription = "GeckIt Agent VPN Qualification"
        manager.isEnabled = true
        manager.isOnDemandEnabled = false
        manager.saveToPreferences { error in emit(error == nil ? "per_app_configuration_saved_unqualified" : "preferences_failed", code: (error as NSError?)?.code); exit(error == nil ? 0 : 78) }
    }

    private func connect(_ manager: NETunnelProviderManager) {
        do {
            let data = try readFrame(FileHandle.standardInput, limit: 65536)
            guard let text = String(data: data, encoding: .utf8) else { throw NativeVpnError.configuration }
            _ = try NativeProfile(text)
            guard let session = manager.connection as? NETunnelProviderSession else { throw NativeVpnError.routing }
            observing = NotificationCenter.default.addObserver(forName: .NEVPNStatusDidChange, object: manager.connection, queue: .main) { _ in emit("native_status_unqualified", code: manager.connection.status.rawValue) }
            try session.startTunnel(options: ["configuration": text as NSString, "qualificationDefaultDNS": NSNumber(value: command == "start-default-dns")])
            emit("start_requested_unqualified")
        } catch { emit("start_failed"); exit(78) }
    }

    func requestNeedsUserApproval(_ request: OSSystemExtensionRequest) { emit("system_approval_required") }
    func request(_ request: OSSystemExtensionRequest, didFinishWithResult result: OSSystemExtensionRequest.Result) { emit(result == .completed ? "extension_activated_unqualified" : "reboot_required"); exit(0) }
    func request(_ request: OSSystemExtensionRequest, didFailWithError error: Error) { emit("activation_failed", code: (error as NSError).code); exit(78) }
    func request(_ request: OSSystemExtensionRequest, actionForReplacingExtension existing: OSSystemExtensionProperties, withExtension ext: OSSystemExtensionProperties) -> OSSystemExtensionRequest.ReplacementAction {
        command == "activate-replacing" && existing.bundleIdentifier == tunnelProviderID && ext.bundleIdentifier == tunnelProviderID ? .replace : .cancel
    }
}

@main
struct ControllerMain {
    static func main() {
        guard CommandLine.arguments.count == 2, let team = Bundle.main.object(forInfoDictionaryKey: "GeckItVPNTeam") as? String else { emit("invalid_command"); exit(64) }
        let controller = Controller(command: CommandLine.arguments[1], team: team)
        controller.start()
        withExtendedLifetime(controller) { dispatchMain() }
    }
}
