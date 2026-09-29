import CryptoKit
import UserNotifications

// A push carries only a box sealed on the Mac with the key in its QR code; opened here, it says what happened before iOS shows it.
class NotificationService: UNNotificationServiceExtension {
    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        let content = (request.content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
        if let room = request.content.userInfo["room"] as? String,
           let box = request.content.userInfo["box"] as? String,
           let notice = opened(room: room, box: box) {
            content.title = notice.title
            content.subtitle = notice.subtitle
            content.body = notice.body
            content.threadIdentifier = notice.session
            content.userInfo["session"] = notice.session
        }
        contentHandler(content)
    }

    private struct Notice: Decodable {
        let session: String
        let title: String
        let subtitle: String
        let body: String
    }

    private func hashed(_ text: String) -> SHA256.Digest {
        SHA256.hash(data: Data(text.utf8))
    }

    private func opened(room: String, box: String) -> Notice? {
        let keys = UserDefaults(suiteName: "group.com.anetrebskii.geckit")?.stringArray(forKey: "keys") ?? []
        guard let key = keys.first(where: { hashed("geckit room \($0)").map { String(format: "%02x", $0) }.joined() == room }),
              let data = Data(base64URL: box),
              let sealed = try? AES.GCM.SealedBox(combined: data),
              let plain = try? AES.GCM.open(sealed, using: SymmetricKey(data: hashed("geckit seal \(key)")))
        else { return nil }
        return try? JSONDecoder().decode(Notice.self, from: plain)
    }
}

private extension Data {
    init?(base64URL text: String) {
        var plain = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        plain += String(repeating: "=", count: (4 - plain.count % 4) % 4)
        self.init(base64Encoded: plain)
    }
}
