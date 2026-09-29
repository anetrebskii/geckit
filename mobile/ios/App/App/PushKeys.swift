import Capacitor

let pushGroup = "group.com.anetrebskii.geckit"

// The keys of the Macs this phone is paired with, left where the notification extension can read them to open a push.
@objc(PushKeysPlugin)
public class PushKeysPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PushKeysPlugin"
    public let jsName = "PushKeys"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "keep", returnType: CAPPluginReturnPromise),
    ]

    @objc func keep(_ call: CAPPluginCall) {
        UserDefaults(suiteName: pushGroup)?.set(call.getArray("keys", String.self) ?? [], forKey: "keys")
        call.resolve()
    }
}
