import Foundation
import NetworkExtension

final class PacketTunnel: NEPacketTunnelProvider {
    private var bridge: PacketBridge?
    private var generation: UUID?
    private let lifecycle = DispatchQueue(label: "GeckItAgentVPN.lifecycle")

    override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        guard routingMethod == .sourceApplication, let text = options?["configuration"] as? String else { completionHandler(NativeVpnError.routing.nsError); return }
        do {
            let profile = try NativeProfile(text)
            lifecycle.async { [weak self] in
                guard let self, self.bridge == nil else { completionHandler(NativeVpnError.transport.nsError); return }
                let token = UUID()
                let transport = PacketBridge(profile: profile) { [weak self] in
                    self?.lifecycle.async { [weak self] in
                        guard let self, self.generation == token else { return }
                        self.cancelTunnelWithError(NativeVpnError.transport.nsError)
                    }
                }
                self.bridge = transport
                self.generation = token
                DispatchQueue.global().async { [weak self] in
                    do {
                        try transport.start()
                        guard let self else { transport.stop(); completionHandler(NativeVpnError.transport.nsError); return }
                        self.lifecycle.async {
                            guard self.generation == token else { transport.stop(); completionHandler(NativeVpnError.transport.nsError); return }
                            let settings = profile.networkSettings()
                            if (options?["qualificationDefaultDNS"] as? NSNumber)?.boolValue == true { settings.dnsSettings?.matchDomains = nil }
                            self.setTunnelNetworkSettings(settings) { [weak self] error in
                                guard let self else { transport.stop(); completionHandler(NativeVpnError.transport.nsError); return }
                                self.lifecycle.async {
                                    guard self.generation == token, error == nil else { transport.stop(); completionHandler(NativeVpnError.routing.nsError); return }
                                    transport.receive(self.packetFlow)
                                    transport.pump(self.packetFlow)
                                    completionHandler(nil)
                                }
                            }
                        }
                    } catch { transport.stop(); completionHandler(NativeVpnError.transport.nsError) }
                }
            }
        } catch { completionHandler(NativeVpnError.configuration.nsError) }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        lifecycle.async { [weak self] in
            self?.generation = nil
            self?.bridge?.stop()
            self?.bridge = nil
            completionHandler()
        }
    }
}
