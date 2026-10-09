# Weroost update

Source site: `/Users/alex/Projects/aln/weroost-sites/geckit/landing`.

1. Copy `geckit-devices.png` from this folder to the site's `public/geckit-devices.png`.
2. In `site.config.ts`, replace `seo.ogImage` with `https://geckit.app/geckit-devices.png`.
3. In `src/pages/index.astro`, replace the SoftwareApplication JSON-LD `image` with `https://geckit.app/geckit-devices.png`.
4. Publish the site through its existing Weroost deployment workflow.
5. Verify published HTML emits the new URL in `og:image` and `twitter:image` and emits `twitter:card=summary_large_image`. Verify image HTTP 200 and `Content-Type: image/png` using normal and Twitterbot requests where possible. Review the whole served image and its readability at social card size.

The shared Base layout already supports these image tags. The old image remains available. X may retain its cached previews for existing posts.

## Handoff blocker

Initial CLI attempts could not reach the local socket. Retried `geckit-local start --conversations -` with sandbox escalation; the command connected and is waiting for the GeckIt conversation handoff response. No Weroost source changes or publication have been performed in this session.
