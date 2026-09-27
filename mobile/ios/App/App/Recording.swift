import AVFoundation
import Capacitor
import PhotosUI
import Speech
import UniformTypeIdentifiers

// A video picked from Photos, where the system's screen recordings land, read on the phone into the words said in it and a few frames.
@objc(RecordingPlugin)
public class RecordingPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "RecordingPlugin"
    public let jsName = "Recording"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "words", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "frames", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drop", returnType: CAPPluginReturnPromise),
    ]

    private var picking: CAPPluginCall?
    private var hearing: SFSpeechRecognitionTask?

    @objc func pick(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var config = PHPickerConfiguration()
            config.filter = .videos
            config.selectionLimit = 1
            config.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = self
            self.picking = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = picking else { return }
        picking = nil
        guard let provider = results.first?.itemProvider else {
            call.resolve([:])
            return
        }
        provider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { url, error in
            guard let url = url else {
                call.reject(error?.localizedDescription ?? "The video could not be read.")
                return
            }
            // The picker's copy goes when this returns, so it is copied somewhere that stays until it is dropped.
            let ext = url.pathExtension.isEmpty ? "mov" : url.pathExtension.lowercased()
            let kept = FileManager.default.temporaryDirectory.appendingPathComponent("recording-\(UUID().uuidString).\(ext)")
            do {
                try FileManager.default.copyItem(at: url, to: kept)
            } catch {
                call.reject(error.localizedDescription)
                return
            }
            let asset = AVURLAsset(url: kept)
            let size = (try? kept.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            call.resolve([
                "path": kept.path,
                "url": kept.absoluteString,
                "ext": ext,
                "seconds": CMTimeGetSeconds(asset.duration),
                "bytes": size,
            ])
        }
    }

    @objc func words(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("No video")
            return
        }
        let language = call.getString("language") ?? ""
        let url = URL(fileURLWithPath: path)
        if AVURLAsset(url: url).tracks(withMediaType: .audio).isEmpty {
            call.resolve(["text": ""])
            return
        }
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                call.reject("GeckIt may not use Speech Recognition. Allow it in Settings, GeckIt.")
                return
            }
            DispatchQueue.main.async {
                guard let recognizer = speechRecognizer(language), recognizer.isAvailable else {
                    call.reject("Speech recognition is not available right now.")
                    return
                }
                let request = SFSpeechURLRecognitionRequest(url: url)
                request.shouldReportPartialResults = false
                // On the phone there is no minute's limit, which a screen recording is often longer than.
                if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
                if #available(iOS 16, *) { request.addsPunctuation = true }
                var answered = false
                self.hearing = recognizer.recognitionTask(with: request) { result, error in
                    if answered { return }
                    if let result = result, result.isFinal {
                        answered = true
                        call.resolve(["text": result.bestTranscription.formattedString])
                    } else if error != nil {
                        // Nothing said is an error to the recognizer, and an empty answer here.
                        answered = true
                        call.resolve(["text": result?.bestTranscription.formattedString ?? ""])
                    }
                }
            }
        }
    }

    @objc func frames(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("No video")
            return
        }
        let count = max(1, call.getInt("count") ?? 8)
        let side = CGFloat(call.getInt("side") ?? 1568)
        DispatchQueue.global(qos: .userInitiated).async {
            let asset = AVURLAsset(url: URL(fileURLWithPath: path))
            let seconds = CMTimeGetSeconds(asset.duration)
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: side, height: side)
            let tolerance = CMTime(seconds: 0.2, preferredTimescale: 600)
            generator.requestedTimeToleranceBefore = tolerance
            generator.requestedTimeToleranceAfter = tolerance
            var taken: [[String: Any]] = []
            for index in 0..<count {
                // Spread over the length, the last one at the very end: what was on the screen when the point was made.
                let at = count == 1 ? max(0, seconds - 0.1) : max(0, min(seconds - 0.1, seconds * Double(index) / Double(count - 1)))
                guard let image = try? generator.copyCGImage(at: CMTime(seconds: at, preferredTimescale: 600), actualTime: nil),
                      let jpeg = UIImage(cgImage: image).jpegData(compressionQuality: 0.7) else { continue }
                taken.append(["at": at, "data": jpeg.base64EncodedString()])
            }
            call.resolve(["frames": taken])
        }
    }

    @objc func drop(_ call: CAPPluginCall) {
        hearing?.cancel()
        hearing = nil
        if let path = call.getString("path") { try? FileManager.default.removeItem(atPath: path) }
        call.resolve()
    }
}
