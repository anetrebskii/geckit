# Describing a repeating task, shortcut or scheduled prompt

Each run starts a new conversation that knows only the saved prompt and checklist. Write both so a run can act without the conversation that created them. The prompt says what the run must know; the checklist says what the run must do, in order. Never put steps in both: a numbered list in the prompt competes with the checklist, and the run follows the list instead of the items.

## Prompt

Write the prompt in the person's language, as Markdown sections of a few lines each, with no numbered steps and no expected output. Use the sections that have content, in this order:

- `## Purpose`: one sentence naming the result of one run.
- `## Inputs`: project, repository and folders; files to read first; sources and accounts; browser profile; time window ("today", "the last 7 days"). Give absolute paths and exact identifiers.
- `## Rules`: limits and prohibitions that hold for every step: counts per run, what must not be touched, what is never invented, spending, messages to people, personal data, what the run is authorized to publish.
- `## Release`: only when the run deploys. Copy the person's permission with its date and wording, then the exact commands and the checks between them. Checklist items refer to this section.

Keep everything a run needs in this one prompt. When several prompts share context, repeat that block in each; a run cannot read another prompt. Remove sentences that repeat a rule already stated.

## Checklist

Give a worker shortcut a checklist with `--items`, not a `--goal`, whenever the run has more than one step. The run works through the items in order, one at a time.

- One item per step, in order, three to eight items. Write the title as the result that is true once the step is done ("Report saved in reports/<date>.md"), not as an action.
- Put the how in the item's `description`: the skill to use, the source, the limit, the format. Keep it to the facts that step needs; rules for every step stay in the prompt.
- The last item is the reply: what it contains and its format.
- Use `check: none` for intermediate results and `check: person` for a step that must wait for the person's approval, for example before changing an external tracker.
- Mark `final: true` on an item that later work can undo, such as a pushed commit or a logged publication.

## Push and publish

Work that only exists on this computer, or only as a draft, is not done. Whenever a run writes to a repository or posts anywhere, make that its own item with `check: review`:

- Repository: "Changes are committed and pushed", with the description "Show the commit hash and `git status -sb` without ahead; own files only, no force-push". Mark it `final`. Where the person's instructions say only "commit", say "commit and push" unless they said not to push.
- Comments, replies, posts, reviews and issue comments: "<What> published", with the description "Show the link to each published item, opened on its page; drafts and pending reviews do not count".
- Release: one item for the deployment with its checked address, then the push item.

Keep publishing inside the person's authorization, and write the permission into `Rules` ("Publishing replies is part of this task"). When the person did not authorize publishing, the run produces drafts and the checklist says "not published".

## Example

```text
--prompt "## Purpose
Address review comments on my PRs.

## Rules
Do not ask me to confirm the list of PRs. Do not touch n8n."
--items '[
 {"title":"PRs with new comments are found","check":"none"},
 {"title":"Every fix is committed and pushed","check":"review","final":true,
  "description":"Fix what the comment asks for. Show the commit hash and git status -sb without ahead."},
 {"title":"Every other comment has a published reply","check":"review","final":true,
  "description":"Reply where no change is needed. Show the link to each reply."},
 {"title":"Review is re-requested on every addressed PR","check":"review"},
 {"title":"Reply lists each PR with fixes, replies and the review request","check":"none"}]'
```
