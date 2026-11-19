# Notifications on the phone

A conversation that finishes or waits on an answer says so on the phone while the app is closed, as the Mac's own banner says it while nobody is looking at Chat.

## When one comes

| Case | On the phone |
|---|---|
| The app is open on this Mac | Nothing from Apple: the banner inside the app says it, as before |
| The app is in the background or closed, and the Mac has been untouched for a minute or is locked | A notification: what happened and the project, the conversation, what it said |
| The app is in the background, and someone is at the Mac | Nothing: the Mac's own banner is enough, and the phone does not buzz beside it |
| The Mac is asleep or GeckIt is closed | Nothing: nothing is working there either |

A phone going to the background says so over the link before iOS stops it, so the Mac does not wait for the link to time out.

## Which computer sends notifications

Open a paired computer from Computers. Once the phone connects and the push relay accepts the selection, that computer becomes the phone's only push source. The phone can then go to the background or close. Existing notification permission and idle rules still apply.

| From | Event | To | What the user sees |
|---|---|---|---|
| No selected computer | The first paired computer connects successfully | That computer supplies alerts | The workspace opens. Eligible alerts appear when the phone is away. |
| A supplies alerts | The phone opens B's cached workspace while connecting | A still supplies alerts | The existing connection indicator. |
| A supplies alerts | B fails to connect or the person leaves before it connects | A still supplies alerts | The existing connection feedback or Computers list. |
| A supplies alerts | B connects successfully and the relay saves the selection | B supplies alerts | The connected workspace. The next eligible alert can come from B. |
| B supplies alerts | The app closes, goes to the background, or temporarily loses the connection | B still supplies alerts | Eligible alerts from B while it can send them. |
| B supplies alerts | The person removes B from Computers | No selected computer once the relay saves the change | B disappears from Computers. The next successful connection selects a source. |

The app retries a pending selection when it can reach the relay. Until the relay receives it, the previous selection applies. Alerts already delivered remain in Notification Center.

### What stays silent

Switching the alert source uses the existing computer switch, with no additional prompt or announcement. Notification wording, sound and grouping are the same.

## What it says, and who can read it

The notice is sealed on the Mac with the key in the QR code, the same as the pairing. The signal function hands the sealed box to Apple, and a Notification Service Extension on the phone opens it with the key before iOS shows it. Google and Apple carry only "GeckIt: A conversation has something for you", which is also what shows if the phone cannot open it, for a Mac it has forgotten.

The notice is cut to fit what Apple carries: 120 characters for the line on top and for the conversation, 400 for what it said. Notifications from one conversation are grouped together.

## Pressed

It opens the app on that conversation. For a notification from another Mac this phone is paired with, the app switches to that Mac first.

## Asking

iOS asks once whether GeckIt may send notifications, the first time the app joins a Mac. Turned off, nothing is sent; turned on again in the iPhone's Settings, the next join tells the Mac.

## Forgetting

A Mac's New code leaves its phones' tokens behind with the old code. A phone that removes the app is dropped the first time Apple says so.

## Set up once

Deploy both Firebase functions with `firebase deploy --only functions:push,functions:pushRoute` before releasing the iPhone update. The first successful connection in the updated app selects the source. Phones without a saved relay selection keep their existing delivery behavior.

- Two APNs keys (.p8) from the Apple developer account, each Topic Specific to `com.anetrebskii.geckit`: a Production one for TestFlight and the App Store, a Sandbox one for builds run from Xcode, since a key for one app can reach only one of Apple's two services. In `signal/functions/.env`: `APNS_TEAM_ID`, `APNS_KEY` and `APNS_KEY_ID` for Production, `APNS_SANDBOX_KEY` and `APNS_SANDBOX_KEY_ID` for Sandbox, each key on one line with its line breaks written `\n`; then `firebase deploy --only functions:push` from `signal/`. Without either the function answers 503 and nothing is sent. The team's two keys for all apps belong to Zabookni and EDA and are not used, so the function in Google's cloud can push to GeckIt and nothing else.
- Push Notifications and the App Group `group.com.anetrebskii.geckit` on the app id, and the App Group on `com.anetrebskii.geckit.NotificationService`; Xcode registers both on the first signed build with the account signed in.
