# Feature Specification: Context items, folders and projects

**Feature Branch**: `003-context-items`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "Context entity for GeckIt. A context item is something the user attaches as a label when creating a task or inside a chat. Each item has a key, title, link(s), image(s) and context text. Items come from providers: GitHub, Linear, or a custom provider, which must implement a small API: search, list items, get item. The user types and gets a Spotlight-like quick search across providers to pick what to attach (addresses Pooja's case: quickly type and select any variant). Context is cached to make it fast. Rename today's "projects" to "folders". A new "project" is a list of folders plus context providers. A folder belongs to exactly one project, so the user never selects a project: they select a folder and the project is found from it. Spec only, no plan or code."

## Clarifications

### Session 2026-09-30

- Q: Do projects replace profiles? → A: No. Profiles stay as they are and are sets of folders; projects are a separate grouping of folders and providers.
- Q: What is a custom provider physically? → A: A web address that answers search, list and get.
- Q: Could providers be plugins, GitHub and Linear included? → A: Yes. Every provider answers the same contract; anything is a plugin or a web address.
- Q: What does "built in" mean for the popular ones? → A: Not compiled into GeckIt: GeckIt knows one catalog of official plugins in Alex's public repository and offers them with one click.
- Q: Is a plugin only about context? → A: No. A GeckIt plugin declares capabilities; context is the first and only one in this release, and others can be added later on their own contracts.
- Q: Who keeps sign-ins, GeckIt or the plugin? → A: Split. The plugin says how it signs in (a sign-in already on the computer, a token, or a browser sign-in); GeckIt asks the person and keeps any secret in the system's credential store.
- Q: Can plugins and projects be configured without the window? → A: Yes, through the `geckit` CLI, so a person in a terminal or Claude in a conversation can do it.
- Q: Can a provider have settings beyond sign-in? → A: Yes. A plugin declares its own settings, such as "Only assigned to me", repositories or teams; each provider in a project keeps its values, and they decide what the provider returns.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach an issue to a new task by typing a few letters (Priority: P1)

The person starts a new task in a folder. In the task form they type a few letters of an issue, a key such as `FOR-1087` or `#3964`, or words from its title. A list like Spotlight opens under the field and fills as they type, with items from every provider of the folder's project: key, title and where it comes from. Arrow keys and Enter, or a click, attach the item. It shows as a label on the form and, once the task starts, on its card. Claude receives the item's title, key, links, images and context text with the first message, so the person does not paste the issue by hand.

This is Pooja's case: she knows roughly which issue she means, types part of it, and picks the right one from what comes up without opening the tracker.

**Why this priority**: It is the whole value of the feature. Providers, cache and projects exist to make this one moment fast.

**Independent Test**: With one project holding one folder and a GitHub provider, open New task in that folder, type part of an existing issue title, see the issue in the list within a second, press Enter, start the task, and find in the conversation that Claude was given the issue's body and link, and on the card a label with the issue key.

**Acceptance Scenarios**:

1. **Given** a folder in a project with a GitHub and a Linear provider, **When** the person types `onboard` in the context field of New task, **Then** items from both providers whose key or title matches appear, grouped or marked by provider, best matches first.
2. **Given** the list is open, **When** the person presses Down then Enter, **Then** the chosen item becomes a label on the form and the field is empty and ready for another.
3. **Given** two labels are attached, **When** the task is started, **Then** the first message carries both items' context and the card shows both labels.
4. **Given** a label on the form, **When** the person presses its x or Backspace in an empty field, **Then** the label is removed and nothing of it is sent.
5. **Given** the person types an exact key such as `FOR-1087` that is not in the cache, **When** they press Enter, **Then** the item is fetched from its provider and attached, or a line says it was not found.

---

### User Story 2 - Attach context inside a running conversation (Priority: P1)

In an open conversation the person attaches an item from the composer the same way: a trigger in the composer opens the same quick search, the chosen item becomes a label above the field, and its context goes with the next message. The conversation's card gains the label.

**Why this priority**: Work often starts before the person knows which issue it belongs to; the second place people reach for an issue is mid-conversation.

**Independent Test**: In a conversation in a folder with a provider, open the quick search from the composer, attach an item, send a message, and see in the transcript that the item's context went with it and on the card that the label was added.

**Acceptance Scenarios**:

1. **Given** an open conversation, **When** the person attaches an item and sends a message, **Then** the item's context goes with that message only, and later messages do not repeat it.
2. **Given** an item already attached to this conversation, **When** the person picks it again, **Then** it is not sent a second time and the list marks it as already attached.
3. **Given** a conversation with labels, **When** it is opened on the phone, **Then** the same labels are shown, and the phone can attach items the same way.

---

### User Story 2a - Start again with a past selection (Priority: P1)

When the person opens New task, before typing anything, the context field offers the selections used on earlier tasks in this folder's project, newest first. A selection is the whole set of items attached to one past task, shown as one row of its labels, for example `FOR-1087 · Oshi Health onboarding` + `FOR-1102`. One click on the row attaches the whole set; a second click on Start starts the task. So when Pooja keeps working on the same variant with the same context, she starts the next task with two clicks and no typing.

**Why this priority**: Repeated work on the same context is the common case for Pooja; typing the same keys every time is the friction this feature exists to remove.

**Independent Test**: Start a task with two items attached, open New task again in a folder of the same project, see that pair offered as one row at the top, click it, click Start, and find both labels on the new card and both items' context in its first message.

**Acceptance Scenarios**:

1. **Given** past tasks in this project had selections, **When** the person opens New task, **Then** up to 5 of them are offered before any typing, newest first, each as one row of its labels.
2. **Given** the same set of items was used on several tasks, **When** selections are offered, **Then** it is offered once, at the place of its latest use.
3. **Given** a past selection is offered, **When** the person clicks it, **Then** all its items are attached, each read fresh as in FR-020, and the person can still remove one or add more.
4. **Given** the person starts typing, **When** the field has text, **Then** past selections give way to search results, and single items used before rank above others that match equally.
5. **Given** an item in a past selection is no longer in its tracker, **When** the selection is clicked, **Then** the other items are attached and the missing one is named.
6. **Given** a past selection the person no longer wants offered, **When** they remove it from the list, **Then** it is not offered again until it is used again.

---

### User Story 3 - Folders, and projects made of folders and providers (Priority: P1)

What GeckIt calls a project today becomes a folder, everywhere it is named. A project is now a named set of folders plus the context providers they share, for example "TwinsAI": the folders `Twins-AI`, `Twins-AI-Infrastructure`, `Twins-AI-Knowledge`, and the providers GitHub `twins-ai/*` and nothing else. A folder is in at most one project. The person never picks a project when starting work: they pick a folder, and the project, with its providers, follows from it.

**Why this priority**: Without a project there is nowhere to say which providers a folder searches. It must exist, even minimally, before Story 1 works.

**Independent Test**: In Settings, make a project, add two folders and a provider to it; open New task in either folder and see that provider's items in the quick search; open New task in a folder outside the project and see none of them.

**Acceptance Scenarios**:

1. **Given** the app after the update, **When** the person looks at the board, the pickers, New task and Settings, **Then** every place that said "project" for a folder says "folder", and "project" means only the new grouping.
2. **Given** a folder already in project A, **When** the person adds it to project B, **Then** it is moved from A to B, and the person is told it left A.
3. **Given** a folder in no project, **When** the person starts a task there, **Then** the task works as today, and the context field offers "Add this folder to a project" in place of results.
4. **Given** a folder on a host (`ssh://`), **When** it is added to a project, **Then** it behaves as a local folder does for context.

---

### User Story 4 - Providers: official plugins, company plugins and web addresses (Priority: P2)

In a project's settings the person adds providers. The list offers the official plugins from GeckIt's catalog first, GitHub and Linear, installed with one click the first time. Next to them are plugins the person already has, for example the one their company ships beside its skills, and a web address with a token if it needs one. All of them answer the same three questions: search for items matching some text, list items, and get one item by key, plus whether they need signing in. The person does not see a difference between kinds beyond where each came from. Each plugin declares its own settings, and adding a provider shows them as a form: GitHub asks for repositories or an organisation and whether to include only what is assigned to the person; Linear asks for teams, states, and "Only assigned to me". The values belong to that provider in that project and decide what it returns, so one project can have Linear with only the person's own issues and another with the whole team's. Each provider shows whether it is reachable, whether it needs signing in, and when its items were last read.

**Why this priority**: GitHub alone serves most of the value; Linear, plugins and web addresses widen it to every other tracker without GeckIt having to know them.

**Independent Test**: Install a plugin that serves three fixed items, add it to a project, and find them in the quick search by key and by title words; do the same with a web address serving the same items.

**Acceptance Scenarios**:

1. **Given** a GitHub provider whose sign-in is missing or expired, **When** the person opens the quick search, **Then** the provider's cached items still show, with a line on the provider saying it needs signing in again and where to do it.
2. **Given** a custom provider that does not answer, **When** the person searches, **Then** results from the other providers and the cache still show, and the unreachable one is named once, not per keystroke.
3. **Given** a custom provider whose answer is malformed, **When** it is added, **Then** it is refused with the reason, and nothing is saved half-configured.
4. **Given** a company plugin is installed and on in a folder, **When** that folder's project has no such provider, **Then** the project's settings offer to add it; nothing is added without the person saying so.
5. **Given** a plugin is updated or removed, **When** the person next searches, **Then** the update is used, or the removed provider is named once as gone and its cached items are deleted.
6. **Given** GitHub was never installed, **When** the person picks it in Add provider, **Then** its tagged version is installed from the catalog, it says it provides context, and after the person agrees it is added; offline, it says the catalog cannot be reached and nothing is half-installed.
7. **Given** a Linear provider with "Only assigned to me" on, **When** the person searches, **Then** only issues assigned to them are offered, and an exact key of someone else's issue is still found by get, marked as outside the filter.
8. **Given** a setting whose choices come from the tracker (teams, repositories), **When** the form is opened after signing in, **Then** the choices are listed from the plugin; before signing in, the field says to sign in first.
9. **Given** the person changes a provider's settings, **When** they save, **Then** the plugin is asked to check them and refuses with its reason or accepts, and the provider's cache is read again so items outside the new settings stop being offered.

---

### User Story 4a - Configure projects, plugins and providers from the `geckit` CLI (Priority: P2)

Everything Settings does for projects, plugins and providers can also be done with the `geckit` command: create, rename and delete a project, add a folder to it or take one out, list the catalog and the installed plugins, install or remove one, add a provider to a project, set its settings, sign it in, see how each provider stands, and refresh its cache. So a person sets up a project from a terminal or a script, and Claude, asked in a conversation "make a TwinsAI project with these three folders and our Linear", does it without the person opening Settings.

**Why this priority**: Setting up several projects by hand is slow and hard to repeat; the CLI makes it scriptable, and lets Claude do it in a conversation.

**Independent Test**: With GeckIt running, create a project from a terminal, add two folders and the GitHub provider to it, agree to the provider in the app, and find its items in the quick search in either folder; then list the project from the CLI and see both folders and the provider reachable.

**Acceptance Scenarios**:

1. **Given** GeckIt is running, **When** `geckit` is asked to add a provider to a project, **Then** the change is made by the running app and appears in the window at once.
2. **Given** the change installs a plugin or turns on a capability, **When** it is asked from the CLI, **Then** the person agrees to it in the app as in FR-015e, and the command waits for and prints the answer.
3. **Given** a provider needs a token, **When** it is signed in from the CLI, **Then** the token is read from the terminal without echo or from standard input, never from an argument, and is kept as in FR-016.
4. **Given** GeckIt is not running, **When** a command that changes anything is run, **Then** it says GeckIt is not running and changes nothing; commands that only read still answer.
5. **Given** a script, **When** it asks for the JSON form, **Then** every command prints machine-readable output with the same fields as the human form.
6. **Given** a folder already in project A, **When** the CLI adds it to project B, **Then** it is moved as in FR-003 and the command prints that it left A.
7. **Given** a project with providers that are signed in, **When** the CLI deletes it, **Then** the person agrees to it in the app, since its sign-ins, cache and past selections go with it; its folders stay and are in no project.

---

### User Story 5 - Cached context makes search instant (Priority: P2)

Each provider's items are kept on this computer. The quick search answers from the cache first, at once, and asks the provider in the background; new or changed items slide in without the list jumping under the cursor. Opening a project refreshes its cache quietly.

**Why this priority**: Speed is what makes typing-and-picking beat opening the tracker; without the cache the list waits on the network at every keystroke.

**Independent Test**: With the network off, open the quick search in a project that was used before and find items by key and title.

**Acceptance Scenarios**:

1. **Given** items were cached earlier, **When** the network is off, **Then** search still returns them, marked as possibly out of date only if older than a day.
2. **Given** an item was edited in its tracker since it was cached, **When** it is attached, **Then** its current version is fetched before it is sent, and the cached copy is replaced.
3. **Given** the cache holds items of a provider that was removed, **When** the provider is removed, **Then** its cached items are deleted with it.

---

### Edge Cases

- A folder that is in no project: no providers, the context field says so and offers to add the folder to a project.
- Two providers return the same item (a GitHub issue linked from Linear): shown twice, each with its provider; nothing is merged.
- An item with dozens of images or a very long body: attached, with the images and text capped, and the label saying what was left out.
- An item deleted or made private in its tracker after being cached: attaching it says it is no longer there and does not send the stale copy.
- The person types faster than a provider answers: results from earlier keystrokes never replace those of later ones.
- A conversation started in a terminal and opened in GeckIt: it has no labels until one is attached here.
- A folder moved from one project to another: its existing conversations keep their labels; new searches use the new project's providers.
- A project with no providers: the context field is not shown for its folders.
- Labels on a conversation whose provider was later removed: the label stays, with its key and title, and its link still opens.

## Requirements *(mandatory)*

### Functional Requirements

**Folders and projects**

- **FR-001**: Everything GeckIt calls a project today MUST be called a folder, in all copy, the CLI's output, docs and the phone. "Project" MUST mean only the new grouping.
- **FR-002**: The person MUST be able to create, rename and delete a project, and add or remove folders (local or on a host) and providers in it.
- **FR-003**: A folder MUST belong to at most one project. Adding it to another MUST move it and say so.
- **FR-004**: Starting work MUST ask only for a folder; the project and its providers MUST be found from the folder.
- **FR-005**: Existing settings keyed by folder (colours, favourites, hidden) MUST carry over unchanged by the rename. Profiles MUST stay as they are: a profile is a named set of folders, chosen in Settings, and only the word changes from "projects" to "folders" in them. Projects and profiles are independent: a profile may hold folders of several projects, and a project's folders may sit in several profiles.

**Context items**

- **FR-006**: A context item MUST have a key unique within its provider, a title, zero or more links, zero or more images, and context text; it MUST also record its provider and when it was last read.
- **FR-007**: The person MUST be able to open a quick search from New task, from Ask, and from the conversation composer, on the computer and on the phone.
- **FR-008**: The quick search MUST match on key and on words of the title and context text, rank exact key matches first, then title matches, then the rest, and be driven by keyboard alone (type, arrows, Enter, Esc).
- **FR-009**: The quick search MUST search every provider of the current folder's project at once and show which provider each result is from.
- **FR-010**: An attached item MUST appear as a label on the form or composer, removable before sending, and afterwards on the conversation's card and in the conversation.
- **FR-011**: When a message is sent, the context of items attached since the last message MUST be given to Claude with it: key, title, links, context text and images. An item MUST NOT be sent twice in one conversation unless the person attaches it again after it changed.
- **FR-012**: Links of attached items MUST be collected on the card as links written in the conversation are today.
- **FR-013**: Labels MUST be stored with the conversation so they survive a restart, show on the phone, and are readable through the `geckit` CLI.

**Past selections**

- **FR-013a**: Each set of items attached to a task when it started MUST be remembered per project as a past selection, with when it was last used.
- **FR-013b**: New task MUST offer up to 5 past selections of the folder's project, newest first, before anything is typed; identical sets MUST be offered once.
- **FR-013c**: One click on a past selection MUST attach all its items, so a task with the same context starts with two clicks: the selection, then Start.
- **FR-013d**: The person MUST be able to remove a past selection from what is offered; it comes back only when used again.
- **FR-013e**: While typing, items the person attached before MUST rank above other equal matches.

**Providers**

- **FR-014**: Every provider, official or not, MUST answer one contract: search by text, list items, get one item by key, each returning items in the shape of FR-006, and say whether it is signed in and, when not, which of three ways it signs in: a sign-in already on this computer (with the command or link to fix it), a token (with a label and where to make one), or a browser sign-in (with the address to open). GeckIt MUST NOT treat any provider differently beyond this contract.
- **FR-014a**: GeckIt MUST know one catalog of official plugins, in a public repository of the author's, and offer its plugins in Add provider with one click. The catalog MUST hold GitHub (issues and pull requests of chosen repositories or an organisation) and Linear (issues of a chosen workspace and teams) at release, and can grow without a GeckIt release. Nothing from it is compiled into the app, and only tagged versions are installed, never the tip of a branch.
- **FR-015**: A provider MUST be either a GeckIt plugin with the `context` capability or a web address. A plugin MUST be delivered as a Claude Code plugin, from GeckIt's catalog or any marketplace the person has, carrying GeckIt's part in a file of its own beside Claude Code's, so a company ships it with its skills and it is updated with them. A web address is given by the person, optionally with a token.
- **FR-015d**: A GeckIt plugin MUST declare the capabilities it provides, each with the version of its contract. This release knows one, `context` v1 (FR-014). GeckIt MUST ignore capabilities and versions it does not know, and still load what it does know from the same plugin.
- **FR-015e**: When a plugin is added, GeckIt MUST name what each capability it will use does ("Provides context from GitHub") and use it only after the person agrees; a capability that appears in a later version MUST be asked about on its own.
- **FR-015a**: A plugin or web address MUST be called once when it is added and refused with the reason if it does not answer the contract. Nothing from a plugin MUST run until the person adds it to a project, and the provider MUST name the plugin it comes from.
- **FR-015b**: Providers MUST run on this computer, also for folders on hosts.
- **FR-015c**: The contract MUST be documented so anyone can build a provider, with the official GitHub and Linear plugins as its reference.
- **FR-016**: A plugin MUST NOT be asked to store secrets. GeckIt MUST ask the person for a token or open the browser sign-in, keep the resulting secret only in the system's credential store, never in its settings file or the plugin's folder, and hand it to the plugin each time it starts it. A sign-in already on this computer (such as the GitHub CLI's) MUST be reused, with nothing kept by GeckIt.
- **FR-016a**: A sign-in MUST belong to one provider in one project, so two projects can use the same plugin with different accounts. Removing the provider or the plugin MUST delete its secrets.
- **FR-016b**: A provider whose sign-in is missing or expired MUST show it with the way to fix it, while its cached items stay searchable. The phone MUST show the state and never hold a secret; signing in happens on the computer.
- **FR-016c**: A web address provider's token MUST be kept the same way.

**Provider settings**

- **FR-016d**: A plugin MUST declare the settings its provider takes, each with a name, a line saying what it does, a kind (text, on/off, one choice, several choices), whether it is required, and a default. GeckIt MUST draw them as a form when a provider is added or edited, and offer the same as CLI options.
- **FR-016e**: Where a setting's choices come from the tracker (teams, repositories, states), the plugin MUST list them on request, after sign-in.
- **FR-016f**: Setting values MUST belong to one provider in one project, be kept in GeckIt's settings (a setting the plugin marks secret is kept as in FR-016), and be handed to the plugin with every search, list and get.
- **FR-016g**: When settings are saved, the plugin MUST be able to refuse them with a reason; accepted changes MUST refresh the provider's cache and drop items outside the new settings.
- **FR-016h**: Get by an exact key MUST still find an item outside the settings, marked as such, so a filter never hides an item the person names outright.
- **FR-017**: A provider failing MUST NOT block the search, the task or the message; it MUST be named once with what to do.

**The `geckit` CLI**

- **FR-017a**: The `geckit` command MUST create, rename and delete projects, add folders to a project and take them out (moving a folder between projects as in FR-003), list projects with their folders and providers, list the catalog and installed plugins, install and remove plugins, add, change and remove a provider in a project, sign a provider in and out, show each provider's state, and refresh a provider's cache.
- **FR-017b**: Commands that change anything MUST be carried out by the running app, which owns the settings, and MUST refuse with a clear line when it is not running. Commands that only read MUST work without it.
- **FR-017c**: Installing a plugin, turning on a capability, or deleting a project from the CLI MUST be agreed to by the person in the app (FR-015e); the command waits for the answer and prints it. Other changes are made at once.
- **FR-017d**: Secrets MUST NOT be accepted as command arguments; they are read from the terminal without echo or from standard input.
- **FR-017e**: Every command MUST have a JSON form with the same fields as its human form, and the commands MUST be described in the guide GeckIt writes for Claude, so a conversation can use them.

**Cache**

- **FR-018**: Items MUST be cached on this computer per provider, and the quick search MUST answer from the cache before any provider answers.
- **FR-019**: The cache MUST be refreshed in the background when a project's folder is opened and while the quick search is used, without moving results under the cursor.
- **FR-020**: An item MUST be read fresh from its provider when it is attached, falling back to the cached copy, marked as such, when the provider cannot be reached.
- **FR-021**: Removing a provider or a project MUST delete its cached items.

### Key Entities

- **Folder**: a directory, on this computer or a host, where conversations run. What is called a project today. Belongs to at most one project.
- **Project**: a name, a set of folders, and a set of context providers. The folders share the providers.
- **Plugin**: a package delivered as a Claude Code plugin, from GeckIt's catalog or another marketplace, with a GeckIt part that declares its capabilities and their contract versions. It may carry Claude Code's own parts (skills, hooks) beside it.
- **Capability**: one thing a plugin offers GeckIt, with a versioned contract. `context` is the only one in this release.
- **Context provider**: a source of context items for a project, answering the `context` contract: a plugin with that capability, or a web address. Has its sign-in, the setting values its plugin declared (such as repositories, teams, "Only assigned to me"), and its state (reachable, needs sign-in, last read).
- **Context item**: key, title, links, images, context text, provider, last read. Cached per provider.
- **Past selection**: the set of context items one task was started with, kept per project with when it was last used; offered again in New task.
- **Label**: a context item attached to a conversation: the item's key, title and links as they were when attached, and when it was attached and sent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From an empty context field, a person who knows a word of an issue's title attaches it in under 5 seconds, without leaving GeckIt.
- **SC-002**: For a project used before, the first results appear within 200 ms of a keystroke, with the network on or off.
- **SC-003**: With 5,000 cached items across providers, search stays within SC-002.
- **SC-004**: 100% of places that named a folder "project" before the change say "folder" after it, checked by a search of the interface copy.
- **SC-005**: Starting a task never asks for a project; the number of choices before Start stays what it is today.
- **SC-005a**: A task with the same context as a recent one starts in two clicks after New task opens, with no typing.
- **SC-006**: One unreachable provider never delays results from the others or the cache by more than 200 ms.

## Assumptions

- A folder in no project is allowed and works as today, with no context.
- The item's context is sent once, as it was when attached; later changes in the tracker are not followed.
- GitHub items are issues and pull requests; Linear items are issues. Documents, comments and other kinds are out of scope for this release.
- Capabilities other than context, such as actions on a card, tasks created from a tracker's queue, notices when a card moves, status bar items or link previews, are out of scope; the plugin shape only leaves room for them.
- Whether Claude Code accepts GeckIt's own file inside a plugin under strict validation, and whether a plugin's server can be kept away from Claude while GeckIt uses it, is to be checked in planning.
- Attaching is read-only: nothing is written back to the tracker (no comment, no link, no status change).
- The phone searches through the paired computer's cache and providers; it holds no cache of its own.
- A UX document in `docs/ux/` and a prototype in `docs/design/` come before implementation, as the constitution requires.
- Pooja's case is taken to be: finding and attaching one of many similar issues by typing part of it, without switching to the tracker.
