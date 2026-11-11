# Team Telegram transition and rollback

This is an operator procedure, not an automatic migration. Local implementation does not authorize running it. The native client and an adapter must never consume updates concurrently. Outgoing nightly report senders may continue using the bot.

## Before switching
1. Finish or explicitly resolve the adapter queue; use an empty queue for the first transition.
2. Back up adapter source, configuration and state securely. Keep credentials out of reports.
3. Record the last acknowledged update and whether every accepted request has a known outcome. Resolve uncertain work before proceeding. Do not copy adapter permissions or queued requests into native state.
4. Stop only the adapter update receiver. Confirm there is no webhook or other receiver; GeckIt reports a conflict rather than deleting a webhook.
5. In GeckIt, choose Team topic, bot token, approver IDs (empty by default) or explicitly all verified members. Leave bot privacy enabled. Send the addressed one-time command in the selected forum topic and confirm its group/topic/sender locally.
6. Treat that command as the handover boundary. Native pairing consumes the backlog through it without running old task messages. During the handover, participants must stop submitting work until the new connection welcome arrives. Resolve any messages between the recorded adapter boundary and the welcome explicitly; do not assume old reply links survive.
7. Start fresh requests through an addressed command or by replying to the native welcome. Verify text, image with and without caption, approval, two senders and a controlled restart. Retain the old adapter disabled until acceptance is complete.

## Rollback
Stop native intake before restarting another receiver. Record the latest acknowledged native update and all accepted/completed/uncertain work. Reconcile this ledger with the adapter and deliberately advance its intake boundary; never restore the old state/offset wholesale, as that can run completed commands again. Re-enter only explicitly unresolved requests as new work. Do not revive old approval buttons. Keep adapter history as reference, separate from native Manager history.

## Limits and controls
Any named human in the topic may request work and stop a worker belonging to this shared thread, including another participant's worker. Only the installation owner in GeckIt may pause/resume Manager globally, clear history or change connections. Team tools cannot access personal workers, employee memory, other channels, global settings or remote computers. Assigning personal employees is unavailable.

At most 100 pending requests, 16384 characters per input, one supported image per message, 20 MiB download, 256 cached files / 200 MiB, 24 hours for unpinned files. Active input is pinned. Full storage rejects new input. There are at most 2048 reply links, 64 entry message links, 256 callback choices, 128 questions, 512 approval audit rows, 512 uncertain upload identities, and 2048 retained team worker source links. Removing finished team conversations in GeckIt releases worker links. Expired reply links require a fresh instruction; oldest audit rows expire. Uncertain upload identities are never silently evicted: at capacity new uploads stop. Requests older than ten minutes must be sent afresh in team mode. Existing private delayed-request behavior is unchanged.

A successful replacement has a new generation. Old queued requests and workers stay in their old thread; their output is not redirected to the replacement. Inspect or stop them locally in GeckIt. Canceling setup preserves the old connection. Same-bot setup reuses its single active receiver.

## Validation boundary
Offline fake Telegram and injected provider tests cover native routing, queue reconstruction, attachment bytes, approvals and isolation. Browser fixtures cover actual settings markup/styles at desktop and narrow widths in both themes. Live Telegram delivery, real bot membership behavior, physical mobile devices, packaged Electron and the operational cutover remain separate acceptance work.
