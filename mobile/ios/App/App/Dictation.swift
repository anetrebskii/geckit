import AVFoundation
import Capacitor
import Speech

// The window the page lives in, with the dictation plugin, which is part of the app rather than a package.
class BridgeController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DictationPlugin())
        bridge?.registerPluginInstance(RecordingPlugin())
        bridge?.registerPluginInstance(LocalPagePlugin())
        bridge?.registerPluginInstance(PushKeysPlugin())
    }
}

// The language Correct is set to, by its English name, in this region when there is a choice; the phone's own otherwise.
func speechRecognizer(_ language: String) -> SFSpeechRecognizer? {
    let english = Locale(identifier: "en")
    let named = SFSpeechRecognizer.supportedLocales().filter {
        english.localizedString(forLanguageCode: $0.languageCode ?? "")?.lowercased() == language.lowercased()
    }
    let here = named.first { $0.regionCode == Locale.current.regionCode } ?? named.sorted { $0.identifier < $1.identifier }.first
    return here.flatMap { SFSpeechRecognizer(locale: $0) } ?? SFSpeechRecognizer()
}

@objc(DictationPlugin)
public class DictationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DictationPlugin"
    public let jsName = "Dictation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "record", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recorded", returnType: CAPPluginReturnPromise),
    ]

    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var recorder: AVAudioRecorder?
    private var metering: Timer?
    private var heardAt = Date.distantPast

    // How loud the microphone is, 0 to 1, a few times a second, so the page can show that it hears.
    private func level(_ decibels: Float) {
        let now = Date()
        guard now.timeIntervalSince(heardAt) > 0.06 else { return }
        heardAt = now
        notifyListeners("level", data: ["level": max(0, min(1, (decibels + 50) / 50))])
    }

    // Records what is said as the WAV the host hears with whisper: 16 kHz, mono, 16-bit.
    @objc func record(_ call: CAPPluginCall) {
        AVAudioSession.sharedInstance().requestRecordPermission { allowed in
            DispatchQueue.main.async {
                guard allowed else {
                    call.reject("GeckIt may not use the microphone. Allow it in Settings, GeckIt.")
                    return
                }
                do {
                    self.finish()
                    self.recorder?.stop()
                    let session = AVAudioSession.sharedInstance()
                    try session.setCategory(.record, mode: .default, options: .duckOthers)
                    try session.setActive(true, options: .notifyOthersOnDeactivation)
                    let url = FileManager.default.temporaryDirectory.appendingPathComponent("dictation.wav")
                    let recorder = try AVAudioRecorder(url: url, settings: [
                        AVFormatIDKey: kAudioFormatLinearPCM,
                        AVSampleRateKey: 16000,
                        AVNumberOfChannelsKey: 1,
                        AVLinearPCMBitDepthKey: 16,
                        AVLinearPCMIsFloatKey: false,
                        AVLinearPCMIsBigEndianKey: false,
                    ])
                    guard recorder.record() else {
                        throw NSError(domain: "Dictation", code: 2, userInfo: [NSLocalizedDescriptionKey: "The microphone could not start."])
                    }
                    recorder.isMeteringEnabled = true
                    self.recorder = recorder
                    self.metering?.invalidate()
                    self.metering = Timer.scheduledTimer(withTimeInterval: 0.07, repeats: true) { _ in
                        recorder.updateMeters()
                        self.level(recorder.averagePower(forChannel: 0))
                    }
                    call.resolve()
                } catch {
                    self.recorder = nil
                    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                    call.reject(error.localizedDescription)
                }
            }
        }
    }

    // Ends the recording and hands it back as base64, or drops it when keep is false.
    @objc func recorded(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let recorder = self.recorder else {
                call.reject("Nothing was recorded.")
                return
            }
            recorder.stop()
            self.recorder = nil
            self.metering?.invalidate()
            self.metering = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            let data = try? Data(contentsOf: recorder.url)
            try? FileManager.default.removeItem(at: recorder.url)
            if call.getBool("keep") == false {
                call.resolve()
            } else if let data = data {
                call.resolve(["audio": data.base64EncodedString()])
            } else {
                call.reject("Nothing was recorded.")
            }
        }
    }

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
        guard let recognizer = speechRecognizer(language), recognizer.isAvailable else {
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
            guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
            var sum: Float = 0
            for at in 0..<Int(buffer.frameLength) { sum += samples[at] * samples[at] }
            let rms = sqrt(sum / Float(buffer.frameLength))
            DispatchQueue.main.async { self.level(20 * log10(max(rms, 0.000_01))) }
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
