# Tasks: Hosts on the phone

**Input**: `spec.md`, `plan.md`, `docs/ux/remote-hosts-phone.md`

## Phase 1: Main (parallel with Phase 2)

- [x] T101 [P] [US5] `Hosts.update(id, draft)`: rename without connecting, re-check on a connection field; IPC `hosts:update`, `hosts:forget`; preload; phone stubs
- [x] T102 [P] [US5] `HostDisk.list/read` answer from what is kept here when the host is not up; the last listing kept on disk; sessions read again when a host comes up; tests
- [x] T103 [P] [US5] Update restart waits for local conversations only
- [x] T104 [P] [US5] Search and Hidden read the copies of conversations on hosts
- [x] T105 [P] [US5] Remove host: stop its runs there, drop them from runs.json, remove its shortcuts
- [x] T106 [P] [US5] Voice orders name host projects `project · host`
- [x] T107 [P] [US5] Recording note on a host leaves out the video
- [x] T108 [P] [US4] Phone call `hosts.forwardLink(root, href)`; the phone's openLink forwards before opening, passing the moved note

## Phase 2: Phone

- [x] T110 [P] [US1] Rows: the amber out-of-reach line in `PhoneBoard.tsx`
- [x] T111 [P] [US1] Header: the host's dot and `project · host` in `PhoneNav.tsx`
- [x] T112 [US1] The pill "Reconnecting to <host>" and the held Send on the phone
- [x] T113 [US1] `PhoneHostSheet.tsx`: password, passphrase, code, trust; "Remember on <computer>"; in place of the cards on the phone
- [x] T114 [US3] Settings, Host: the section that was Mac; the phone says host where it said Mac (a Hosts page with Connect and Disconnect was built and taken out again: on the phone it read as the host connecting hosts)
- [x] T115 [US2] Where page and host folders in Settings, Add a project, and in the new task's project sheet
- [x] T116 [US1] Project, profile and Hidden lists label host projects
- [x] T117 [US4] iOS: `LocalPage.open({ url, note })` puts the note over the title

## Phase 3: Computer

- [x] T120 [P] [US5] Cmd+K: a group only where the profile has its projects, Local too
- [x] T121 [P] [US5] Settings, Profiles: projects grouped under Local and each host, labelled
- [x] T122 [US5] Edit on each host in Settings, Hosts: the Add sheet filled in, Save, Forget the password

## Phase 4: Verify

- [x] T130 Lint, typecheck, tests
- [x] T131 Dev instance with the owner's host: board with the host off asks nothing; edit host; Cmd+K groups; profiles
- [x] T132 The phone view against the same dev instance: rows, sheet, Hosts, Where, folders, add, localhost
- [x] T133 CLAUDE.md and the UX document brought in line with what was built

## Found while verifying

- [x] T134 `edgesScript` named a file whose slug starts with a dash to `head` and `tail`, which read it as an option, so a conversation over 128 KB on a host had no row; named from `./` now, with a test that runs the script in `sh`
- [x] T135 A listing that failed wrote an empty cache over the last one; a failed read keeps it
- [x] T136 A port taken here for IPv6 alone looked free, so a host's page and a local dev server shared `localhost`; a port that answers on 127.0.0.1 or ::1 is taken
- [x] T137 A typed password not remembered was dropped after Add a host; it is kept while GeckIt runs, as before
