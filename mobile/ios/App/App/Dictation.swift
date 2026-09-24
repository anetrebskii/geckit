import AVFoundation
import Capacitor
import Speech

// The window the page lives in, with the dictation plugin, which is part of the app rather than a package.
class BridgeController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DictationPlugin())
    }
}

@objc(DictationPlugin)
public class DictationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DictationPlugin"
    public let jsName = "Dictation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    @objc func start(_ call: CAPPluginCall) {
        let language = call.getString("language") ?? ""
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                call.reject("GeckIt may not use Speech Recognition. Allow it in Settings, GeckIt.")
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { allowed in
                DispatchQueue.main.async {
                    guard allowed else {
                        call.reject("GeckIt may not use the microphone. Allow it in Settings, GeckIt.")
                        return
                    }
                    do {
                        try self.listen(language)
                        call.resolve()
                    } catch {
                        self.finish()
                        call.reject(error.localizedDescription)
                    }
                }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.engine.stop()
            self.engine.inputNode.removeTap(onBus: 0)
            self.request?.endAudio()
            call.resolve()
        }
    }

    private func listen(_ language: String) throws {
        finish()
        guard let recognizer = recognizer(language), recognizer.isAvailable else {
            throw NSError(domain: "Dictation", code: 1, userInfo: [NSLocalizedDescriptionKey: "Dictation is not available right now."])
        }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if #available(iOS 16, *) { request.addsPunctuation = true }
        self.request = request
        let input = engine.inputNode
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }
        engine.prepare()
        try engine.start()
        task = recognizer.recognitionTask(with: request) { result, error in
            if let result = result {
                self.notifyListeners("heard", data: ["text": result.bestTranscription.formattedString, "final": result.isFinal])
            }
            if error != nil || result?.isFinal == true {
                DispatchQueue.main.async {
                    self.finish()
                    self.notifyListeners("ended", data: [:])
                }
            }
        }
    }

    // The language Correct is set to, by its English name, in this region when there is a choice; the phone's own otherwise.
    private func recognizer(_ language: String) -> SFSpeechRecognizer? {
        let english = Locale(identifier: "en")
        let named = SFSpeechRecognizer.supportedLocales().filter {
            english.localizedString(forLanguageCode: $0.languageCode ?? "")?.lowercased() == language.lowercased()
        }
        let here = named.first { $0.regionCode == Locale.current.regionCode } ?? named.sorted { $0.identifier < $1.identifier }.first
        return here.flatMap { SFSpeechRecognizer(locale: $0) } ?? SFSpeechRecognizer()
    }

    private func finish() {
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
