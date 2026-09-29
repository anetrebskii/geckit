# GeckIt privacy policy

GeckIt has no account and no server that keeps your data. Your conversations stay on your computer.

The installed app asks on its first start whether it may count which features are used, and counts nothing until you say Yes. Then each time one is used, it sends Google Analytics the name of the feature (such as correct, transcribe, chatSent or settingsSaved), the app version and a random id made for this installation, which is deleted when counting is turned off. It never sends text, file paths or keys. A build from source sends nothing, and Usage in Settings turns it off.

When GeckIt hits an error, it keeps the error on your computer with file paths, addresses and links taken out, and asks whether it may send it to Sentry, showing exactly what would be sent. Nothing goes until you say Send, or turn on Errors in Settings; Never deletes what was kept.

The iPhone app asks the same two questions for itself, and keeps its answers on the phone.

The iPhone app shows them over a direct connection to your computer (WebRTC). The phone and the computer find each other through Firestore, Google's database, in the Firebase project geckit-signal. The key from the QR code never leaves the two of them: the room they meet in is a hash of it, and what they leave in the room is sealed with it, so Firestore sees neither the offer nor the addresses in it. What they leave there is set to expire an hour later, and the room itself keeps only when the computer was last waiting in it. When the two networks cannot see each other, the connection goes through a relay, and it is still encrypted end to end.

The camera is used only to read the QR code. The microphone is used only while you dictate, and what you say goes to Apple's speech recognition, which may send it to Apple. The pairing is kept on the phone until you forget that computer or remove the app.

Questions: https://github.com/anetrebskii/geckit/issues
