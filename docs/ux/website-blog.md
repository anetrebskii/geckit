---
type: spec
status: implemented within the requested website scope
owner: Alex
created: 2026-11-19
---

# UX: Website blog

## 1. Why

Visitors need a place to read GeckIt's engineering articles, starting with the supplied browser detection experiment. The website currently has no article listing or reading page.

### Journey to the result

Open "Blog" from the website header or footer, choose the article, read its results and limitations, and return through "All articles". Each page also works as a direct link. Readiness means the article and every referenced image are in the built website. No account or configuration is required. Ordinary document navigation is sufficient; a separate application or setup flow would add work for readers.

## 2. What is added

| Surface | Addition | Visibility |
|---|---|---|
| Existing site header and footer | "Blog" link | Desktop and phone |
| /blog/ | "Blog", a short description and the first article with date, excerpt and preview | Always |
| /blog/browser-detection/ | "All articles", title, date, full supplied article, original images and charts, return link | Always |

## 3. States

| State | Trigger | What the reader sees | Next action |
|---|---|---|---|
| Listing | Open /blog/ | Article title, date, excerpt and "Read article" | Open the article |
| Reading | Open article | Complete article with figures and comparison labels | Read, open an image, or use "All articles" |
| Original image | Open a figure link | Full resolution image | Browser Back |
| Network failure | Browser cannot load a document | Browser's own network error | Browser Reload or Back |

## 4. Transitions

These are ordinary document links; no application state machine is introduced. A diagram is not applicable because navigation has no asynchronous application state or branching setup.

| From | Event | To | What the reader sees |
|---|---|---|---|
| Existing website | Select "Blog" | Listing | Blog heading and first article |
| Listing | Select title, preview or "Read article" | Reading | Article heading and complete text |
| Reading | Select image | Original image | Original file |
| Original image | Browser Back | Reading | Previous article and browser-restored scroll |
| Reading | Select "All articles" | Listing | Blog heading and first article |
| Either page | Select GeckIt logo | Homepage | Existing homepage |

## 5. What stays silent

No publication, loading or success notifications: the browser already indicates document navigation. Images load progressively with descriptive alternative text. The article's one-run limitation stays visible in its original wording.

## 6. Thresholds and time

Publication date is November 19, 2026, matching the supplied experiment. No estimated reading time, timers, pagination thresholds or automatic refresh are added.

## 7. Wording

| Element | Exact wording |
|---|---|
| Navigation and listing heading | "Blog" |
| Listing description | "Experiments and notes from building GeckIt." |
| Article title | "Same browser, same code. On a Mac it's a person, on a server it's a robot." |
| Date | "November 19, 2026" |
| Open article | "Read article" |
| Return link | "All articles" |

Article body is the supplied docs/reports/browser-detection-post.md, with image paths adapted to the website. Comparison tables containing images become labeled figures so they stack on a phone. Claims and measurements remain unchanged.

## 8. Edge cases

- Empty listing is not applicable: this change ships with the first article.
- Long title wraps without clipping. Tables scroll locally on narrow screens; comparison figures stack.
- Reopening, reload and repeated clicks use native browser navigation with no writes.
- Offline loading uses the browser's network error; no offline availability is claimed.
- Images are self-hosted. Opening their links needs no script or modal.

## 9. What is deliberately absent

| Omitted | Reason |
|---|---|
| Search, filters and pagination | One article |
| Newsletter, comments and account setup | Outside the request |
| Automatic animation | Reading needs no motion |
| New product feature list entry | Website publishing is not a GeckIt application feature |

## 10. Forks

| Decision | Verdict and reason |
|---|---|
| Existing site versus new site | Extend geckit--landing at geckit.app, preserving its navigation and design language |
| Article wording | Preserve the supplied assistant-written draft rather than rewrite it |
| Image detail | Native links to originals; browser Back provides the exit |
| Themes | Follow system appearance on the new blog pages; keep the homepage's existing appearance |

## 11. Reconciliation with requirements

The listing and first article satisfy the explicit request. Header/footer entry points, keyboard focus, mobile comparison layout, metadata and system appearance are implementation assumptions that make those pages usable. No open product decision blocks implementation within this requested scope.

Apple UX requirements: direct manipulation uses links on the article itself; feedback and history use native navigation; visible next actions are "Read article" and "All articles"; no content moves without navigation; no permissions or notifications are introduced; wording is recorded above. Forgiveness is not applicable because no action changes or deletes data. UI contrast, focus, touch targets and both themes require rendered verification.
