# Browser profile commands

Load `use-browser` and obey its browser boundary. Run one command per tool call. Use the target computer consistently; append `--computer <name>` to each command when working remotely.

```text
{{said}} browser profiles
{{said}} browser start <Chrome-profile-email-or-name>
{{said}} browser start geckit
{{said}} browser profiles create <name> --note "<project>: <site> as <account>"
{{said}} browser start geckit:<name>
{{said}} browser signin <name>
{{said}} browser signin <name> --tab <id>
{{said}} browser open <url> --profile geckit:<name>
{{said}} browser pages --profile geckit:<name>
```

Creation makes a managed Camoufox profile, not a new Chrome extension profile. Names are 1-40 characters: lowercase ASCII letters, digits and hyphens, starting with a letter or digit. Notes are at most 120 characters. Use names such as `project-work` only when their project/account meaning fits and the name is unused. A description does not verify credentials or account access.

`open <url> --profile geckit` starts or reuses the conversation's registered project profile and opens its tab. A named account uses `geckit:<name>`. Chrome selection uses the listed profile's email or name and requires GeckIt Browser. Public-page work can use the last-used extension profile that can reach the page; account work needs the intended identity.

The project account mapping is `~/.geckit/browser-state/test-project-profiles.json`: project roots map to allowed profile-name arrays, or a single name that also sets the default. Preserve existing entries. Listing or creating a name does not grant this conversation access to it. Report missing mapping and resolve the intended project/account mapping instead of widening access implicitly.

For sign-in or a site check in the conversation's open managed tab, use `signin <name> --tab <id>` with the ID from `browser pages`. Share the HTTPS link only in a private GeckIt conversation or Slack direct message. In a shared channel, ask the person to continue in a direct message. Ask them to press Done. End the turn and rely on GeckIt to resume it when the host gets the tab back. Do not schedule a timer, poll the tab, or ask for a reply after Done.

Sign-in links are single-use and expire after 15 minutes. Put the link in the final private reply. For a managed profile with no open tab, use the paired profile link without `--tab`, and ask the person to close the view with Done afterward. If the viewer cannot show the current tab or a system dialog, report the limitation and ask the person to finish on the host.

First managed start downloads Camoufox if missing. Wait for the reported installation outcome; do not launch duplicate starts. Firefox-based Camoufox cannot reach `chrome://` or Chrome extension pages. Keep regular Chrome and managed profiles' sign-ins separate; never extract cookies or credentials to copy them.
