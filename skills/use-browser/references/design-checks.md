## Design checks

- `shot <tab> <ref>` is one element at full resolution.
- `hover <tab> <ref>` shows its hover state.
- `style <tab> <ref>` gives its computed style in a dozen lines.
- `view <tab> --size 1024x768 --dark --reduced-motion` (or `--phone`) shows the page as that window and those preferences would, until `view <tab> --reset`.
- `record <tab> [<ref>] --click <ref> --for 600 --slow 4` records what an action sets moving and prints a sheet of up to 12 frames with their times: open the sheet, not the frames, and the frames only to look closer at one moment.

GeckIt's own pointer is never in a picture unless asked with `--pointer`.
