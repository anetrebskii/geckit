import Capacitor
import WebKit

let localScheme = "geckit-local"
private let loopback: Set<String> = ["localhost", "127.0.0.1", "0.0.0.0", "::1"]

// A page a session serves on the Mac's localhost, in a view of its own: each request it makes is handed to the page, which asks the Mac.
@objc(LocalPagePlugin)
public class LocalPagePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LocalPagePlugin"
    public let jsName = "LocalPage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "respond", returnType: CAPPluginReturnPromise),
    ]

    private var tasks: [String: WKURLSchemeTask] = [:]

    @objc func open(_ call: CAPPluginCall) {
        guard let url = URL(string: call.getString("url") ?? "") else {
            call.reject("No address to open.")
            return
        }
        DispatchQueue.main.async {
            let shown = UINavigationController(rootViewController: LocalPageController(url: url, note: call.getString("note"), handler: LocalPageHandler(plugin: self)))
            self.bridge?.viewController?.present(shown, animated: true)
            call.resolve()
        }
    }

    @objc func respond(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        let status = call.getInt("status") ?? 502
        let fields = (call.getObject("headers") ?? [:]).compactMapValues { $0 as? String }
        let body = Data(base64Encoded: call.getString("body") ?? "") ?? Data()
        let moved = call.getString("moved")
        call.resolve()
        DispatchQueue.main.async {
            // A task WebKit has stopped must not be answered: it throws.
            guard let task = self.tasks.removeValue(forKey: id), let url = task.request.url else { return }
            if let moved = moved, task.request.mainDocumentURL == url {
                // WebKit follows no redirect from a scheme of its own, so the page sends itself on to where the server did.
                let page = "<meta http-equiv=\"refresh\" content=\"0;url=\(moved.replacingOccurrences(of: "\"", with: "&quot;"))\">"
                self.answer(task, url: url, status: 200, fields: ["Content-Type": "text/html; charset=utf-8"], body: Data(page.utf8))
                return
            }
            self.answer(task, url: url, status: status, fields: fields, body: body)
        }
    }

    private func answer(_ task: WKURLSchemeTask, url: URL, status: Int, fields: [String: String], body: Data) {
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: fields) else {
            task.didFailWithError(URLError(.badServerResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }

    func asked(_ task: WKURLSchemeTask) {
        let id = UUID().uuidString
        tasks[id] = task
        let request = task.request
        notifyListeners("request", data: [
            "id": id,
            "url": request.url?.absoluteString ?? "",
            "method": request.httpMethod ?? "GET",
            "headers": request.allHTTPHeaderFields ?? [:],
            "body": request.httpBody?.base64EncodedString() ?? "",
        ])
    }

    func stopped(_ task: WKURLSchemeTask) {
        tasks = tasks.filter { !$0.value.isEqual(task) }
    }
}

// Held by the web view's configuration, which keeps it; so it holds the plugin weakly, and the page's view not at all.
class LocalPageHandler: NSObject, WKURLSchemeHandler {
    private weak var plugin: LocalPagePlugin?

    init(plugin: LocalPagePlugin) {
        self.plugin = plugin
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        plugin?.asked(task)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        plugin?.stopped(task)
    }
}

class LocalPageController: UIViewController, WKNavigationDelegate {
    private let web: WKWebView
    private let start: URL
    private let note: String?

    init(url: URL, note: String?, handler: LocalPageHandler) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(handler, forURLScheme: localScheme)
        web = WKWebView(frame: .zero, configuration: config)
        start = url
        self.note = note
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { nil }

    override func loadView() {
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        web.navigationDelegate = self
        web.allowsBackForwardNavigationGestures = true
        navigationItem.title = hostOf(start)
        // Where a host's port could not be had here, the line over the title says where it went.
        navigationItem.prompt = note
        navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .done, primaryAction: UIAction { [weak self] _ in
            self?.dismiss(animated: true)
        })
        navigationItem.rightBarButtonItem = UIBarButtonItem(image: UIImage(systemName: "arrow.clockwise"), primaryAction: UIAction { [weak self] _ in
            self?.web.reload()
        })
        web.load(URLRequest(url: start))
    }

    private func hostOf(_ url: URL) -> String {
        guard let host = url.host else { return "" }
        return url.port.map { "\(host):\($0)" } ?? host
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        navigationItem.title = webView.title?.isEmpty == false ? webView.title : webView.url.map(hostOf)
    }

    // A link the page writes as http://localhost is the Mac's as well.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, url.scheme == "http", loopback.contains(url.host ?? ""),
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            decisionHandler(.allow)
            return
        }
        parts.scheme = localScheme
        decisionHandler(.cancel)
        if let mapped = parts.url { webView.load(URLRequest(url: mapped)) }
    }
}
