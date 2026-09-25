# GeckIt privacy policy

GeckIt has no account and no server that keeps your data. Your conversations stay on your computer.

The installed app counts which features are used. Each time one is, it sends Google Analytics the name of the feature (such as correct, transcribe, chatSent or settingsSaved), the app version and a random id made once for this installation. It never sends text, file paths or keys. A build from source sends nothing, and Usage in Settings turns it off.

The iPhone app shows them over a direct connection to your computer (WebRTC). The phone and the computer find each other through a signaling function on weroost. The key from the QR code never leaves the two of them: the room they meet in is a hash of it, and what they leave in the room is sealed with it, so weroost sees neither the offer nor the addresses in it. What they leave there is deleted after a minute, and weroost keeps only the hash of the room and when it was last used. When the two networks cannot see each other, the connection goes through a relay, and it is still encrypted end to end.

The camera is used only to read the QR code. The microphone is used only while you dictate, and what you say goes to Apple's speech recognition, which may send it to Apple. The pairing is kept on the phone until you forget that computer or remove the app.

Questions: https://github.com/anetrebskii/geckit/issues
