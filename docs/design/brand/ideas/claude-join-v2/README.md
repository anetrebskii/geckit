# Join mark, improved

Revision of [ceo-extra-block](../ceo-extra-block/README.md). [Sheet](join-v2.png): original, landed, landing (recommended). App tile, lockup, lockup at 16 px, tile at 16 and 32 px.

| Change | Fixes |
| --- | --- |
| Only the joining block is green, the team stays white or ink | All-green blocks on the ink tile read as the letter M at 16 px (test 3); colour now carries the idea (test 4) |
| The block sits inside the gap, a few units above the baseline, instead of hanging over it | Read as falling out or pulled up (test 4) |
| Blocks 20x44 with 2-unit corners, gap widened to 40 | Clearance stays visible at 16 px; less like the letter I |

Open: three bars is a common motif and Beam.ai uses slanted bars (test 7); white-green-white can read as a pause sign or an equaliser (test 3). Not tested on people.

## Green block on the right (Alex's suggestion)

[Sheet](join-right.png): middle landing, right leaning in (recommended), right upright.

- Right leaning in: reads in order, team first, newcomer last, like a new card on the board. Asymmetric, so no M, no pause sign. Risk: a tilted block at the end of a row can read as a falling domino about to knock the team over.
- Right upright: calm and legible, but loses the arrival gesture and reads as a bar chart or "3 of 3" progress.

## Lebedev tests: right leaning in

[Renders](right-lean-in-tests.png): one colour, reversed, two-tone on light and dark, at 512, 16 and 32 px; lockup at 16 px.

| # | Test | Result |
| --- | --- | --- |
| 1 | Legibility | Passed: the lockup reads GeckIt at 16 px |
| 2 | 16-32 px | Passed: both gaps and the tilt survive at 16 px in all four versions |
| 3 | Looks like | Failed: in one colour, a domino about to fall on the other two; also books on a shelf and signal bars |
| 4 | Meaning | Failed: "a block joins the row" fits any team, HR or collaboration product, not GeckIt specifically; the AI-employee reading needs the caption or the green |
| 5 | One idea | Passed |
| 6 | Filler | Passed |
| 7 | Originality | Passed with a risk: Beam.ai uses three parallel slanted bars; two upright plus one leaning is a different arrangement |
| 8 | Type | Passed: block weight matches XCharter Bold verticals |
| 9 | Drawing | Failed: the tilted block hangs 4 units above the baseline touching nothing, so physically it is mid-fall |
| 10 | Fit | Colour green shared with Tasklet (open since round 11); price level neutral; break with the G mark authorised |
