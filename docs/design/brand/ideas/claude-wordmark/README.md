# GeckIt: wordmark logo

Following the studio's own practice for big brands (a word with one owned detail, no separately maintained symbol). The word is the approved round-14 XCharter wordmark; the detail is colour.

**Recommended: `a-it-green`.** "Geck" in ink, "It" in green. Read aloud it is "get it", and "It" is the one who does it: the AI employee. The app icon is the green "It" on the ink tile.

[Variants](geckit-wordmark.png) · [In context](context.png) · `python3 build.py`

| Variant | Result |
| --- | --- |
| 0. All ink (first sketch) | Discarded: the current wordmark, no idea |
| **a. "It" green** | **Recommended** |
| b. Only "I" green | Dropped: the icon is a lone I, meaningless |
| c. "G" green | Dropped: repeats the current icon, adds no idea |

## Lebedev tests: a-it-green

Rendered at 16, 32 and 512 px in colour, one colour and reversed, wordmark and icon ([test sheet](wordmark-tests.png)).

| # | Test | Result |
| --- | --- | --- |
| 1 | Legibility | Passed: GeckIt at 16 px, the green "It" stays separate |
| 2 | 16-32 px | Passed: the "It" icon reads at 16 px |
| 3 | Looks like | Passed with a risk: "It" can be read as "IT", the department; lowercase t softens it |
| 4 | Meaning | Passed in colour: "Geck it, and It does it". Failed in one colour: the wordmark becomes the plain current one, only the capital I still splits "Geck It"; the icon keeps "It" in every version |
| 5 | One idea | Passed |
| 6 | Filler | Passed: colour is the only addition |
| 7 | Originality | Passed with a risk: one coloured part of a word is a common device (Yandex's red Я); the "It" reading is GeckIt's own |
| 8 | Type | Passed: approved hand-spaced XCharter, not a face the category uses |
| 9 | Drawing | Passed: nothing figurative |
| 10 | Fit | Passed for recognition: same word, ink and green as the current kit. Green shared with Tasklet (open since round 11) |
