---
type: marketing
stage: audience
status: draft
product: GeckIt
created: 2026-10-18
last-observed: 2026-10-18
---

# Audience: GeckIt

Every quote below is verbatim, with a link and a date, typos left in. Lines are tagged `(observed)` or `(hypothesised)`.

Reddit could not be read from this machine (the search API and the crawler are both blocked), so the rooms here are Hacker News, the GitHub issue trackers of the tools these people use, and GeckIt's own Product Hunt launch. That is three rooms, and it is the honest limit of this pass.

## The one-line answer

One developer running four or more coding agents at once on their own Claude or ChatGPT subscription, on their own machine, who has lost the ability to say which agent is waiting for them. (observed)

It excludes: teams who want a shared board, anyone running agents on an API key in the cloud, and anyone who runs one agent at a time.

## The struggling moment

**Four agents are running and you cannot say which one is waiting for you without clicking through four terminal tabs.** (observed, from nahime, parsak and goldmar below)

This is the sentence the copy has to recognise. Every piece of GeckIt copy so far has named the feature (a Kanban board) instead of this.

## Segments

### Segment 1: the solo developer PMing several agents

TeMPOraL's phrase for it is "one humans PMing many agents".

| | |
|---|---|
| Situation | Runs 4 to 10 agent sessions a day across several projects, on a Pro or Max subscription, alone |
| Doing today | Terminal tabs or tmux, plus a notification hook they wrote themselves |
| Where they are | Hacker News, the issue trackers of vibe-kanban / Conductor / Claude Squad, AlternativeTo's "Alternatives to Conductor" page |
| Rough size | Unknown. Vibe Kanban's HN hiring post and its issue traffic say thousands, not millions (observed) |
| Pays for software | Already paying $20 to $200 a month to Anthropic or OpenAI. Resistant to a second subscription on top (observed, KerrickStaley) |

**Why they would care a lot:** the cost of a missed "waiting for you" is not a lost click, it is an agent sitting idle for forty minutes while they work in another tab. (hypothesised)

**What they actually want, selfishly:** to stop feeling like a supervisor. The word they use for the feeling is "babysitting", and they use it bitterly. (observed, four separate commenters)

**Why they might not:** several of them have already built the workaround and are attached to it. (observed, FlorisFok, novaleaf, tomashubelbauer)

**Segment test:** passes. They recommend tools to each other constantly, by name, in public, with reasons.

### Segment 2: the person whose agent board just died

This is the acute one, and it is the reason to list on AlternativeTo at all right now.

Vibe Kanban was the default answer in this space. Bloop announced the shutdown on 2026-04-10, moved the board behind a cloud login first, and the issue tracker since then is one long stream of people asking what to use instead. (observed)

| | |
|---|---|
| Situation | Their board stopped working, went cloud-only, or needs a login it never needed before |
| Doing today | Pinning an old version (`npx vibe-kanban@0.1.8`), running a fork, or shopping |
| Where they are | vibe-kanban issues 3396, 3408, 3417, 3444; the "Alternatives to Vibe Kanban" page |
| Rough size | Unknown; issue 3408 alone drew eight separate tool recommendations (observed) |
| Pays for software | Mixed. Some would have paid and were not given the chance (observed, KerrickStaley) |

**What they actually want, selfishly:** not to be burned a third time. They are reading the licence and asking who maintains it before they install anything. (observed)

## The switch

| Stage | What happens | Evidence |
|---|---|---|
| First thought | They add a third agent and the tabs stop being distinguishable | nahime, parsak |
| Passive looking | They half-read Show HN posts for agent dashboards, upvote, move on | 54 HN comments mentioning vibe-kanban |
| **Event 1** | They miss a finished agent, or approve work in a scrollback and get it wrong | pnezis |
| Active looking | They search "Vibe Kanban alternative", "Conductor alternative", "manage parallel claude code agents" | issue 3408, AlternativeTo alternatives pages |
| **Event 2** | The tool they settled on dies, moves to a cloud login, or their plan billing changes under them | Isla-Liu, 2001zhaozhao, issue 3417 |
| Decision | Local, free, no login, works with the agent they already pay for | LearnPrompt |
| First use | They point it at one project and see whether the board tells the truth about what is running | (hypothesised) |

### Forces

| Force | What it is here |
|---|---|
| Push of the situation | "back to babysitting agents"; missed finishes; approving in a terminal scrollback |
| Pull of the new | one board across projects; a notification that actually arrives; working with the CLI they already have |
| **Anxiety of the new** | will it burn my subscription or break Anthropic's terms; is it another Electron app that runs badly; will it spawn worktree folders all over a large repo; will it be dead in six months too |
| **Habit of the present** | tmux, named tabs, and the notification hook they already wrote and are a bit proud of |

The four anxieties are the whole game. GeckIt's Product Hunt launch argued the top two and answered none of the bottom four, which is the main thing wrong with it.

## Their words

| Quote | Who and where | Date | Link | Kind |
|---|---|---|---|---|
| "I built lazyagent because I was juggling 6–8 coding agent sessions (Claude Code, Cursor, etc.) across different terminals and tabs, and it was getting impossible to quickly answer "which agent is doing what right now?"." | nahime, HN | 2026-03-12 | https://news.ycombinator.com/item?id=47349859 | pain, jargon |
| "the human staying oriented across 4 concurrent sessions - seeing what each is doing, switching between them, reviewing diffs inline, handling the merge step without context switching overhead - is the other." | parsak, HN | 2026-03-19 | https://news.ycombinator.com/item?id=47442175 | pain |
| "I built it because I kept approving agent work in the worst possible place: a terminal scrollback." | pnezis, HN | 2026-10-07 | https://news.ycombinator.com/item?id=49995844 | pain |
| "Now there is Monday again, no more coding, back to babysitting agents." | mystifyingpoi, HN | 2026-10-16 | https://news.ycombinator.com/item?id=50117321 | pain, jargon |
| "Nowadays, I spend more time babysitting AI agents than I did manually coding during COVID." | guluarte, HN | 2026-07-07 | https://news.ycombinator.com/item?id=48819116 | pain, jargon |
| "This is the missing piece of harness, which truly removes baby sitting terminals." | yashness, HN | 2026-08-10 | https://news.ycombinator.com/item?id=49239982 | pain, jargon |
| "And getting proper notifications when something is done or needs a response." | goldmar, HN | 2026-03-11 | https://news.ycombinator.com/item?id=47336376 | pain |
| "the other 50% use (claude code + codex cli) on cmux -- a ghostty based terminal that adds some bells and whistles, literally for notifications when claude is done." | vadepaysa, HN | 2026-06-16 | https://news.ycombinator.com/item?id=48559650 | workaround, recommendation |
| "Whenever Claude code wants me to give a permission or its done with the task, I get a MacOS notification." | vilvaathibanpb, HN | 2026-04-08 | https://news.ycombinator.com/item?id=47696112 | workaround |
| "Spins up for Claude Code windows, send notifications when one of them is done with Stereo and pitch that identifies the correct window in the 2x2 field." | FlorisFok, HN | 2026-03-29 | https://news.ycombinator.com/item?id=47565581 | workaround |
| "I'm building an agent wrapper over Claude Code, and use the "Jobs done" peon voice for notification" | novaleaf, HN | 2026-02-12 | https://news.ycombinator.com/item?id=46990838 | workaround |
| "This let me add a few bells and whistles that a generic SSH client wouldn't have, like notifications when Claude Code was done working etc." | tomashubelbauer, HN | 2026-02-03 | https://news.ycombinator.com/item?id=46874051 | workaround |
| "This makes me sad because I would be willing to pay for Vibe Kanban, but I didn't need the features their paid plan offered" | KerrickStaley, HN | 2026-05-22 | https://news.ycombinator.com/item?id=48241393 | trigger |
| "they didn't differentiate enough from straightup Github and Jira boards when that was easily possible, just centralize the agents along with the board." | 2001zhaozhao, HN | 2026-08-13 | https://news.ycombinator.com/item?id=49281964 | worldview |
| "And then I got caught in the collateral damage a few days ago when Anthropic announced changes to their subscription plan billing, just like every other user of that tool and similar tools like Conductor and Zed." | 2001zhaozhao, HN | 2026-05-18 | https://news.ycombinator.com/item?id=48185316 | objection, anxiety |
| "I didn't love the Git worktree flow when I tried vibe kanban, spawning lots of folders seemed like it could get problematic on large codebases" | gbro3n, HN | 2026-03-09 | https://news.ycombinator.com/item?id=47314088 | objection |
| "Worth looking into Conductor.build and Sculptor as well, though I believe both are electron and run like sh*t but Conductor is quite good." | MarcelOlsz, HN | 2026-01-24 | https://news.ycombinator.com/item?id=46748446 | objection, recommendation |
| "At some point we need to start preferring GUIs instead of terminals as the AI starts giving us more and more information." | 2001zhaozhao, HN | 2026-02-12 | https://news.ycombinator.com/item?id=46983556 | worldview |
| "no linux version :( also, how does this compare to something like vibe-kanban?" | intuxikated, HN | 2025-12-18 | https://news.ycombinator.com/item?id=46310145 | objection |
| "Vibe Kanban was fun when it was only about one humans PMing many agents. But then it IIRC went in some weird directions." | TeMPOraL, HN | 2026-08-13 | https://news.ycombinator.com/item?id=49282565 | worldview, jargon |
| "vibe-kanban [0] to visually create, monitor and approve parallel work" | afro88, HN | 2026-01-06 | https://news.ycombinator.com/item?id=46510896 | recommendation, jargon |
| "If what you actually want is a local board that tells you where each branch stands, without a server or a login" | LearnPrompt, vibe-kanban issue 3444 | 2026-09-11 | https://github.com/BloopAI/vibe-kanban/issues/3444#issuecomment-5637371403 | trigger, worldview |
| "Idk why my local data and function need to be turned off after the upgrade.... That design should only affect the cloud, not include everyone's local kanban." | Isla-Liu, vibe-kanban issue 3396, 5 thumbs up | 2026-04-29 | https://github.com/BloopAI/vibe-kanban/issues/3396#issuecomment-4340498262 | objection, worldview |
| "is this project dead?" | issue title, vibe-kanban issue 3408 | 2026-05-05 | https://github.com/BloopAI/vibe-kanban/issues/3408 | trigger |
| "We're self-deployed apps, and now is there any way to fix this, work is completely blocked" | wanstu, vibe-kanban issue 3396 | 2026-04-27 | https://github.com/BloopAI/vibe-kanban/issues/3396#issuecomment-4323680374 | pain |
| "Claude's just pushing everyone to their walled garden, including the new agent view. $20 Pro credits MONTHLY will get you next to nothing, this is a very sad yet unsurprising announcement :(" | dominikj-cf, vibe-kanban issue 3417, 3 thumbs up | 2026-05-18 | https://github.com/BloopAI/vibe-kanban/issues/3417#issuecomment-4477591655 | objection, anxiety |
| "After June 15, `claude -p` will draw from a separate credit pool — how is everyone handling this?" | issue title, vibe-kanban issue 3417 | 2026-05-15 | https://github.com/BloopAI/vibe-kanban/issues/3417 | objection, anxiety |
| "the project is dead. try https://github.com/dexloom/vibe-kanban-indie" | turbotankist, vibe-kanban issue 3435 | 2026-06-25 | https://github.com/BloopAI/vibe-kanban/issues/3435#issuecomment-4798227107 | recommendation |
| "How do you keep track of chats waiting for your answer?" | Alex, GeckIt launch comment, Product Hunt | 2026-09-27 | https://www.producthunt.com/products/geckit | jargon (his own framing, and it is the right one) |

Sara Ford's Product Hunt comment (2026-10-06, 2 upvotes) asked whether the board can be customised with more columns. Not quoted verbatim here because the fetch paraphrased it; read it on the page before using it.

### Recurring problems

| Problem, in their words | Times seen | Where | Painful | Unavoidable | Recurring | Eats time | They already hack around it |
|---|---|---|---|---|---|---|---|
| Cannot tell which agent is waiting or done | 7 | HN | y | y | y | y | notification hooks, Pushover, ntfy, a custom terminal (cmux), stereo audio pitch per window, a Warcraft peon voice |
| "babysitting" agents and terminals | 6 | HN | y | y | y | y | sandboxes, auto-approve flags, persistent goals |
| The board they used died, went cloud, or needs a login | 6 | vibe-kanban issues | y | y | n | y | pinning `npx vibe-kanban@0.1.8`, running a fork, migration scripts |
| Reviewing and approving agent work in a terminal scrollback | 2 | HN | y | y | y | y | building a separate review app |
| Subscription billing changes break third-party agent tools | 3 | HN, vibe-kanban issues | y | y | n | n | switching to API keys, local models, or giving up |
| Worktree folders sprawling across a large repo | 1 | HN | y | n | y | n | not using the tool |
| Mac-only tools | 1 | HN | y | n | n | n | none, they just leave |

The workaround column is the strongest column in the table. People have written a terminal, a stereo notification system and a Warcraft voice pack to solve "which one is done". They have paid in effort and they will pay again.

## The lexicon

| They say | They never say | Note |
|---|---|---|
| babysitting agents / baby sitting terminals | supervising, overseeing | appears in 6 quotes, bitter every time |
| which agent is doing what right now | visibility, observability | nahime's phrasing is almost the product |
| waiting for you / needs a response / when it's done | idle state, pending input | the three states that matter |
| parallel agents, concurrent sessions | multi-agent orchestration | "orchestration" is vendor language, used by vendors in these threads and nobody else |
| local, no server, no login | self-hosted, on-premise | LearnPrompt's line is the cleanest statement of the want |
| worktree | isolated workspace | they say worktree because that is literally what it is |
| coding agent, CLI agent | AI assistant, AI copilot | |
| kanban board | task management | |
| my sub, my plan, Pro/Max | subscription tier | |

Words only vendors use in these threads: orchestrate, harness (contested, some users do say it), seamless, workflow automation, productivity.

## Watering holes

| Place | Link | Activity | Are they there or are marketers there | Can I post, or only read |
|---|---|---|---|---|
| vibe-kanban issue tracker | https://github.com/BloopAI/vibe-kanban/issues | dying but the "what now" threads are still answered months later | them, plus competitors dropping links | read; a link drop here reads as spam and several got thumbs-down |
| Hacker News, Show HN and agent threads | https://news.ycombinator.com | several threads a week on agent management | mixed, heavy maker presence | yes, but as a Show HN with the problem first |
| AlternativeTo "Alternatives to Vibe Kanban / Conductor" | https://alternativeto.net/software/conductor/ | slow, evergreen, 38 alternatives on Conductor alone | them, searching | yes, this is the listing |
| Product Hunt | https://www.producthunt.com/products/geckit | one-day spike then nothing | makers mostly | already used once |
| Reddit r/ClaudeAI, r/ClaudeCode | not readable from this machine | unknown | unknown | unverified |

## Objections already heard in the wild

| Objection | Said by | How often | Link |
|---|---|---|---|
| Third-party tools get caught when the plan billing changes | 2001zhaozhao, dominikj-cf | 3 | https://news.ycombinator.com/item?id=48185316 |
| `claude -p` draws from a separate credit pool | vibe-kanban issue 3417 | 1 thread, many readers | https://github.com/BloopAI/vibe-kanban/issues/3417 |
| Electron apps in this category "run like sh*t" | MarcelOlsz | 1, confidently | https://news.ycombinator.com/item?id=46748446 |
| Worktree flow spawns folders across a large repo | gbro3n | 1 | https://news.ycombinator.com/item?id=47314088 |
| It will be abandoned like the last one | issue 3408, 1337vak | 4 | https://github.com/BloopAI/vibe-kanban/issues/3408 |
| Mac only | intuxikated | 1 | https://news.ycombinator.com/item?id=46310145 |
| It is just a Kanban board over GitHub or Jira | 2001zhaozhao | 1 | https://news.ycombinator.com/item?id=49281964 |

## Who this is not for

Teams who want a shared board with permissions and assignees. Anyone running agents on an API key or in a hosted cloud runner. Anyone who wants a VM or container per agent, which is a real want in these threads and not what GeckIt does. People running one agent at a time, who need nothing here.

## Open questions

| Question | Who can answer it | Blocking what |
|---|---|---|
| Does `claude -p` draw from a separate pool, and what is true as of today | Alex, against Anthropic's current terms | the strongest claim in the listing: "runs on your own plan" |
| Is GeckIt fast enough to survive the Electron objection | Alex, docs/performance.md | whether to answer it in the copy at all |
| What do the 86 Product Hunt upvoters actually do now | Alex, Product Hunt followers | whether segment 1 or 2 is the one to write for |
| Reddit evidence | anyone with Reddit access | r/ClaudeAI is the biggest room and it is missing from this file |

## Sources and method

| Date | What was done | Where | What came out |
|---|---|---|---|
| 2026-10-18 | Safari across 54 HN comments mentioning vibe-kanban, plus four keyword searches of HN comments | hn.algolia.com | 21 quotes |
| 2026-10-18 | Read the issue tracker of the tool these people were using | BloopAI/vibe-kanban issues | 7 quotes, the whole of segment 2 |
| 2026-10-18 | Read GeckIt's own launch and the AlternativeTo listings of its competitors | Product Hunt, AlternativeTo | the objection set and the competitor labels |
| 2026-10-18 | Reddit attempted and failed; API blocked, crawler blocked | r/ClaudeAI | nothing |

Re-check when older than six months.
