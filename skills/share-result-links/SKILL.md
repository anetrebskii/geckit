---
name: share-result-links
description: Give people openable links instead of bare references. Use before Manager names anything with an address (pull request, issue, ticket, commit, run, document, page), a local file, folder or localhost address in a reply or question, including results relayed from workers. Covers GeckIt's automatic local links and the links command.
---

# Share result links

## Purpose

Every result Manager names must open with one tap from where the person reads it: Slack, Telegram, Discord, GeckIt or a phone. `#18`, `LIN-42`, `PROJ-7`, `eb162e4`, `PR 21`, `the Notion page`, `/var/lib/app/report.html` and `localhost:5173` open nothing there. Replace them with real links.

## Inputs

- The worker's report, read with `sessions show`. Workers are told to report full URLs.
- The worker ID tracked by this thread, its project and the path relative to the worker's folder.
- The destination's reply skill, which decides link syntax (Slack `<url|label>`, Telegram and Discord `[label](url)`).

## Work

1. **Anything with an address.** Every tool counts: pull requests, issues and tickets (GitHub, Linear, Jira), commits, releases, CI runs, deploys, documents and pages (Notion, Google Docs, Figma), Slack messages and dashboards. Write each as its full URL, for example `https://github.com/acme/site/pull/18`. Give it a short label where the destination allows: `<https://github.com/acme/site/pull/18|PR #18>` in Slack. Never write a bare `#18`, `PR 18`, `LIN-42`, short hash or document title as the only reference.
2. **Missing URL.** If the worker's report has only a number, key, hash or title, look for the URL in its fuller history with `sessions show --id <worker> --last 30`. If it is still missing, ask the worker with `sessions send` for the full URLs and report once you have them. Never build a URL by guessing the owner, repository, workspace or host.
3. **Local file, folder or website in a reply or question.** Write its absolute path or `http://localhost:<port>/` address, alone or in backticks. On the way out to Slack, Telegram and Discord, in replies and in question and approval cards alike, GeckIt turns each one it can share into a GeckIt link on those words. In Slack and Discord that covers files inside registered projects. Name the single file or the result folder, not the whole project, unless the person needs to browse it. A path that cannot be shared stays plain text.
4. **Where nothing links automatically.** GeckIt's own Manager chat, Telegram team chats and a file outside the projects need an explicit link:
   `{"id":"<new-id>","args":["links","share","--id","<worker-id>","--path","<path-relative-to-worker-folder>"]}`
   Outside team threads, `--project <project> --path <relative-path>` and `--url http://localhost:<port>/` also work. Put the result's `link` on the file's name in the destination's link syntax.
5. **Questions and approvals.** Put links in the question text. Choice labels stay short plain text such as `Accept PR #18 and #21`; they are buttons and cannot hold links. When relaying a worker's question, add the URLs of everything it names.
6. **Ending links.** Links last 12 hours. `links list` shows live ones; `links stop --id <link-id>` ends one when the person asks or the result is withdrawn.

## Unknowns

- **Sharing refused.** GeckIt refuses hidden files, credentials, keys, the home folder and anything outside registered projects. Say the file could not be shared and why in one line; do not retry with a parent folder to get around it. Offer `channels send-file` when the person needs the file itself.
- **SSH worker.** Links reach this computer only. For a worker on a host, deliver through the worker or say the link is unavailable.
- **Team thread.** Many people read it. Share only the result the request is about, never a whole project when one file answers it.
- **Expired link.** Make a fresh one; do not repost the old link.

## Output

Reply text where every named result is a working link with a short label, in the destination's link syntax, plus the time a GeckIt link ends when that matters (`open until 18:40`). No bare numbers or short hashes standing alone, and no local path left where GeckIt does not link it.

## Verification

Before sending, scan the reply for `#` followed by digits, ticket keys such as `ABC-123`, short hashes and named documents: each must be inside a full URL link. Local paths and `localhost` addresses in a channel reply are fine as absolute paths; GeckIt links them. In Manager chat and Telegram team chats, each must carry a link from a `links share` result in this turn or a live entry in `links list`. Do not open links to test them unless the person asks.
