# Research: Test browser that looks like a real person

Facts checked in this repository on 2026-11-19, and the decisions taken from them. Camoufox facts come from its own `properties.json` (134 settings) in `~/.geckit/camoufox/browser/158.0.1-beta.41/Camoufox.app/Contents/Resources/`. Items marked **Spike** are confirmed by a short experiment as the first task of their phase, before the rest of the phase is built on them.

## R1. Where GeckIt leaves traces in a test browser page

**Found**: the page functions shared by the extension and the Camoufox driver (`client/extension/background.js`, run in Camoufox through `extensionSource` in `client/src/cli/testing.ts`) write into the page's document:

- `data-geckit-ref` on every listed control (`pageRead`, the ref lookups in `pageCenter`, `pageBox`, `pageField`, `pageChoose`, `pageScroll` and the frame helpers the other session is adding);
- `data-geckit-secret` on fields filled with `type --secret`, and a `<style id="geckit-secret-hide">` element while a picture is taken;
- `#geckit-pointer`, a host element with a shadow root and a style, for the drawn pointer (`pagePointer`, `pageOverlay`).

Camoufox runs `page.evaluate` in an isolated world (`mw:` opts into the main world), so GeckIt's script variables are already invisible to the page; only these DOM changes are visible.

**Decision**: in test browsers, the page functions use a ref registry kept in the isolated world instead of attributes, mask secrets in the picture instead of styling the page, and draw the pointer outside the page. The extension keeps its current behavior: the functions get one indirection (`markRef`, `findRef`, `markSecret`, `isSecret`) whose Chrome version uses attributes and whose Camoufox version uses the registry, chosen by a constant `pageScript()` puts in front of the functions for Camoufox only.

**Rationale**: one implementation of read, refs and the pointer (as `CLAUDE.md` requires), no change to the Web Store extension, and no DOM mutation a page's `MutationObserver` could see.

**Spike**: confirm that a value stored on the isolated world's global in Camoufox survives between `page.evaluate` calls in the same document and frame. If it does not, store the registry as an expando set from the isolated world on `document` (Firefox Xray wrappers keep such expandos invisible to page scripts).

**Alternatives considered**: random attribute names per page (still visible and enumerable); a closed shadow root for the pointer (still an element in the document); removing attributes after each command (refs must hold until reload).

## R2. Secret fields without page changes

**Found**: secrets are hidden from `shot`, `record` and the live view by a style element that blanks marked fields while the picture is taken.

**Decision**: in test browsers, take the picture unchanged and paint over the boxes of registered secret fields on the picture: in the isolated-world canvas for `shot` and `record`, and in the live view frame using the field boxes `FIELDS_SCRIPT` already reports, which gain a `secret` flag read from the registry. `read` and `text` keep leaving out secret values by checking the registry.

**Rationale**: the page never sees a style or attribute change; the value never reaches a picture.

**Alternatives considered**: inline style on the field (visible as a `style` attribute change).

## R3. GeckIt's pointer in test browsers

**Found**: the driver knows the cursor position (it moves the mouse itself); `client/src/cli/cursor.ts` already draws a path for the live view; `ViewFrame` carries `caret` and `fields`.

**Decision**: in test browsers, `pagePointer` and `pageOverlay` do nothing. `ViewFrame` gains `pointer: { x, y, kind }`, which `client/src/renderer/src/chat/LiveView.tsx` draws over the frame with the same look as today's pointer (`docs/ux/chrome-cursor.md`). `shot --pointer` and `record --pointer` draw the pointer onto the picture in the isolated-world canvas the record path already uses.

**Rationale**: what the person sees is unchanged; the page has nothing to find.

## R4. uBlock Origin

**Found**: Camoufox has an `addons` setting (a list of unpacked add-on folders loaded at start). GeckIt downloads Camoufox from its own release repository `anetrebskii/geckit-browser-assets`, pinned by version and sha256 (`client/src/cli/camoufox.ts`).

**Decision**: publish a pinned uBlock Origin `.xpi` as an asset of a `geckit-browser-assets` release, with a link to its source (it is GPL-3.0, which allows this). `prepareCamoufox` downloads it after Camoufox, checks size and sha256, unpacks it into `~/.geckit/camoufox/addons/ublock-origin/<version>/`, and the launch passes that folder in `addons`. A failed download is logged and retried at the next start; the browser starts anyway. Updating uBlock Origin is a GeckIt release, as with Camoufox.

**Spike**: confirm that Camoufox 158.0.1-beta.41 loads an unpacked uBlock Origin folder from `addons` in a persistent context, that it shows in `about:addons`, and that it does not open a first-run tab.

**Alternatives considered**: downloading from addons.mozilla.org at run time (an outside dependency GeckIt does not pin, and a request to Mozilla at every new install); letting each profile install it from the store (not reproducible, and not "by default").

**Revised during implementation**: Camoufox 158.0.1-beta.41 already bundles uBlock Origin 1.75.0 unpacked in its program folder, and its Python launcher adds it by default. GeckIt passes that folder in `addons`; no asset is published or downloaded, and there is no separate pin to keep current.

## R5. Virtual display on Linux

**Found**: `camoufoxHeadless()` returns true on Linux without `DISPLAY` and `WAYLAND_DISPLAY`, and the launch then uses Firefox headless mode.

**Decision**: in that case start `Xvfb -displayfd <fd> -screen 0 <width>x<height>x24 -nolisten tcp -noreset`, read the display number Xvfb writes to the descriptor, set `DISPLAY` for the browser only, launch headed, and stop Xvfb when the browser exits. The Xvfb pid is written beside the profile's lock, so a driver that crashed leaves a display the next start of that profile stops. Without `Xvfb` on the `PATH`, the start fails with the install command. The screen size comes from the desktop identity (R6).

**Rationale**: `-displayfd` lets Xvfb pick a free number, so two browsers starting together cannot collide; `-nolisten tcp` keeps the display off the network.

**Alternatives considered**: `xvfb-run` (no clean handle on the display's lifetime); Camoufox's own virtual display (Python launcher only); headless with spoofed values (headless is still detectable through rendering and window behavior).

## R6. Which desktop a Linux server presents

**Decision**: an Ubuntu 24.04 desktop with Intel integrated graphics running Firefox (the version Camoufox is built on).

**Rationale**:

- The server's traffic comes from its own address, usually a datacenter's, since there is no proxy. That is a stronger signal than any browser value, so pretending to be Windows buys little.
- Linux in the browser matches the server's network stack (TCP/IP fingerprint), its real rendering and its real font rasterizer; a Windows claim contradicts all three.
- Ubuntu desktop fonts can be redistributed (Ubuntu Font Licence, DejaVu, Liberation and Noto under OFL); the Windows fonts a Windows claim needs cannot be.
- Firefox on Ubuntu with Intel graphics is a common real desktop.

This revises the earlier chat recommendation of Windows 11, which did not yet weigh the datacenter address and font licensing.

**Alternatives considered**: Windows 11 (licensing and network-stack mismatch); macOS (cannot be matched on Linux at all); keeping the server's own values (software renderer `llvmpipe`, no media devices, no voices, server core counts).

## R7. Where the identity's values come from

**Decision**: a profile file in the repository, `client/src/cli/desktop/ubuntu-intel.json`, holding values captured once from Firefox on a real Ubuntu 24.04 desktop with Intel UHD graphics: WebGL and WebGL2 vendor, renderer, parameters, extensions and shader precisions; voices from speech-dispatcher; media devices; `navigator` and screen values. At first start on a server, GeckIt makes the identity from it: screen from a small list of common sizes (1920x1080 most often, then 1366x768, 1536x864, 2560x1440), window sizes that fit it with a GNOME top bar, CPU cores from 4, 8 or 12, and fresh `canvas:seed`, `audio:seed` and `fonts:spacing_seed`. Language and timezone come from the server's own settings.

**Rationale**: values from one real machine agree with each other; Camoufox only fakes what it is told, so inconsistent sets are the main risk. A file in the repository is reviewable and tested offline (constitution III).

**Spike**: the capture itself, from an Ubuntu 24.04 desktop (a real machine or a VM with Intel GPU passthrough). Camoufox's own WebGL database (MPL-2.0) is the fallback source for the WebGL part if no such machine is at hand.

**Alternatives considered**: Apify `fingerprint-generator` (a new dependency, and its Linux Firefox samples are few); generating values at random (inconsistent).

**Revised during implementation**: the base was built from the MIT-licensed data of Camoufox's Python package 0.5.9 (screens, cores, media devices, espeak voices, Linux font catalogue), not from a capture. WebGL is limited to vendor and renderer, since the full parameter databases come with that package, whose install was declined. Camoufox removed the canvas, audio and font-spacing seed settings, so no seeds are stored. Screen and window values come from the real Xvfb display rather than being spoofed.

## R8. Fonts on a server

**Found**: GeckIt's Camoufox download is a font-free repack that uses the computer's system fonts (`gfx.bundled-fonts.activate` 0). A server has few fonts, which pages can measure.

**Decision**: on a server only, download a second pinned asset from `geckit-browser-assets` with the Ubuntu desktop font set (Ubuntu, DejaVu, Liberation, Noto core), unpack it into the Camoufox folder, turn bundled fonts on, and set Camoufox's `fonts` list to that set.

**Spike**: confirm that Camoufox reads fonts from its bundled folder with `gfx.bundled-fonts.activate` 1 on Linux, and that `fonts` limits what pages can detect to that list.

**Revised during implementation**: no font asset. GeckIt hands Camoufox the server's installed families that the Linux catalogue lists, and the server guide names the apt packages. A server with few fonts still shows few fonts; that is the remaining gap.

## R9. Profiles used on a server before this feature

**Decision**: when the new version first starts test browsers on a server, it records every existing profile as `previous` in `~/.geckit/camoufox/presentation.json`; new profiles get `desktop`. `profiles device <name> --desktop` moves one profile and says that sites will see a new device. On computers with a screen there is nothing to record.

**Rationale**: a new device on a signed-in account can trigger a check or a lock; that is the person's call, per profile.

## R10. How it is checked

- Pure functions (identity making, mapping to `CAMOU_CONFIG`, Xvfb argument and output handling, presentation migration, picture masking geometry) are unit-tested offline.
- A page fixture lists everything added to its document and is used by an integration check of every command in test browsers.
- The fingerprint pages (CreepJS, BrowserScan, `bot.sannysoft.com`, `browserleaks.com/webgl`) are a manual quickstart step on macOS and on an Ubuntu 24.04 server, recorded in the pull request.
