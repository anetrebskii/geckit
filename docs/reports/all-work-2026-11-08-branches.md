# Branch reconciliation, 2026-11-08

Snapshot after fetch; main base `376105a093a142721c04b6e0771c29088adc9b2e`. Delivery requires current ancestry, patch equivalence or explicit source reconciliation. Private dependency snapshot `8bda76f` is preserved, excluded from product delivery.

| Ref | Exact tip | Result | Evidence |
| --- | --- | --- | --- |
| `refs/heads/chore/bundled-tools-20261027` | `7473b6c5306a6dcb649206da49d21726c2cdd280` | Delivered | exact ancestor of origin/main |
| `refs/heads/codex/reinstall-failed-library` | `db2d94d421dc27cf263614c704f0af7910bdd028` | Delivered | exact ancestor of origin/main |
| `refs/heads/deliver/remember-app-access-20261014` | `41ffe74076d82e1fd70ef264ed4a33213d7efec1` | Delivered | exact ancestor of origin/main |
| `refs/heads/delivery/all-pending-20261104` | `1a561b795da5a89692dfe06c75ec83d7751c7900` | Delivered | exact ancestor of origin/main |
| `refs/heads/delivery/all-ready-20261106` | `fd6bab89651175e50755f16ea313d24d91b8d986` | Delivered | PR55 merge 44565059a7bcc9c4785b15c50b810f430c963543 is ancestor; later evolution retained |
| `refs/heads/delivery/conversation-export` | `fc0de11f03068b56f1fde5631b69fc73ce02c80b` | Delivered | exact ancestor of origin/main |
| `refs/heads/delivery/discord-cli-01a1b5e2` | `b9eac0e5a0ea4fd8b51be00517bfc7f37a281b90` | Delivered | exact ancestor of origin/main |
| `refs/heads/delivery/discord-cli-final-01a1b5e2` | `79cdf2ec56df7431c70e14ac0472aa66619635c4` | Delivered | exact ancestor of origin/main |
| `refs/heads/delivery/manager-history-20261106` | `fad701a41c825cc735081df50f6a7520696ed7ad` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/heads/delivery/remote-control-20261106` | `35efcef2a9d3db59d04be54214e926e6224234b3` | Delivered | exact ancestor of origin/main |
| `refs/heads/delivery/telegram-tables-20261106` | `5637396b71c6d477e963183be82b658008a374ff` | Delivered | PR57 merge 5831a6ce0009351e14b1f04ad77f8a7ff71c26bc is ancestor; later evolution retained |
| `refs/heads/docs/mobile-retry-delivery` | `54a14e51bc6c68dfd9209f39d7867f2738e6a64d` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/agent-settings-shortcuts` | `3ab012de747fbb591885e29b4a50cc5e9c89df82` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/heads/feat/agent-vpn` | `74a86a4965f5b98d2c6767eec7fe3e47240fb23c` | Unfinished, preserved | handoff explicitly paused; native qualification tasks incomplete |
| `refs/heads/feat/board-columns` | `b1ca7dbc88a4d222cb21cc6637dc81cbc9424be8` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/calendar-recurrence-delivery` | `9b0818c15be3b8e19f4a91b4084c49ea5d8eac01` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/channel-libraries` | `f206178aee489b411b3bce51b9219cae24011a39` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/chrome-extension` | `36489a11bb6133d1c045831c84f36b493482b850` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/codex-chrome` | `f9aabbc3364cd6b1917ec368e65ad9423a47747f` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/configuration-transfer-ui` | `8e602d2dcc5636cd8ca643335dc8836235e58808` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/conversation-export` | `ca5bd19d1317912b142a120739a3847fd9e9ed87` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/discord-channel` | `c845b0b55a0a9e0475c56681024aee50c4f35b09` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/employees` | `fedd10e8914b063ce1c7a92ece976eeecb379dfa` | Delivered/reconciled | 4939bd0f ancestor; reviewed final implementation supersedes source snapshot |
| `refs/heads/feat/gecko-character` | `a1dd722abcd10339c54f8e1a2153351d9f21096b` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/manager-history-actions` | `38c212938552834c2c4ead33aecc8a2f1ef17e85` | Delivered/reconciled | 56 ancestor; reviewed final implementation supersedes source snapshot |
| `refs/heads/feat/manager-session-delete` | `ab1cc2368d1f8b86ecd061aca1294ba2a4e0f560` | Delivered/reconciled | 55 ancestor; reviewed final implementation supersedes source snapshot |
| `refs/heads/feat/manager-shortcuts-delivery` | `5af1bb950d7b15606787c39552fee2f2b93d47a0` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/manager-source-intake` | `3a48d6d60f58ba56761a6d0923b25cc27d6864bd` | Delivered | PR43 merge f2617d4d2ef5256b74dbdc934d86fd23f59c3599 is ancestor; later evolution retained |
| `refs/heads/feat/manager-threads` | `ee88e78b5b151863089be148f01b361ed4ea75da` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/manager-watch-no-card` | `7d2757a2462d4897a7237c717950982108716b6d` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/queue-reorder-publish` | `f62edcc234f4dff85222c65c127c11258d982fa4` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/remote-clients` | `d36c5b856e9a10b4bccae1396d357f0a79e9b8bd` | Delivered/reconciled | 35efcef2 ancestor; reviewed final implementation supersedes source snapshot |
| `refs/heads/feat/simple-remote-control` | `085120443f00ebcb4c08728c1a333c6532a0cfaa` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/slack-thread-context` | `9c3f2995d1b84236d5b34fda7944a1272dc93ef1` | Delivered | exact ancestor of origin/main |
| `refs/heads/feat/unified-host-cli` | `72cf6c2cef681daf895e34cbe55a6216748568eb` | Delivered | exact ancestor of origin/main |
| `refs/heads/feature/011-manager-telegram` | `fe8f5c8688567aa795faed01163615ea67a60af7` | Delivered | exact ancestor of origin/main |
| `refs/heads/feature/012-telegram-local-links` | `172b7391f1d68d3fda5253998b5d8ed312248852` | Delivered/reconciled | 27 ancestor; reviewed final implementation supersedes source snapshot |
| `refs/heads/feature/013-telegram-tables` | `4b8c2e7ffc6bfc51c77d7828cb4ef6f9bff93cf1` | Delivered/reconciled | 57 ancestor; reviewed final implementation supersedes source snapshot |
| `refs/heads/feature/live-library-updates` | `c91d1b5976b7e94cd1395b3b7ee3d92c446c61e5` | Delivered | PR17 merge e586a3a1d547c84ac4b4a484eb9edd98dc132c10 is ancestor; later evolution retained |
| `refs/heads/feature/telegram-attachments` | `a284e1d5d17b89bf597272961b0baaaa2b1cdda6` | Delivered | exact ancestor of origin/main |
| `refs/heads/feature/telegram-local-links` | `8635361f16cec21727ed8ab1b7c6b10dc255b02f` | Delivered | PR27 merge 96debe9c30ae9aae447609f6ecb6bdd2a12e374e is ancestor; later evolution retained |
| `refs/heads/feature/telegram-reply-context` | `0538ffbb56f15a9619dae161c01fb90da224395a` | Delivered | exact ancestor of origin/main |
| `refs/heads/fewer-claude-starts` | `ae12bc9ca86ad13070f6e6d0f60cd76f8aac1bd0` | Ready, review pending | hosts foundation via PR12; missing PR13 restored as647ad747 |
| `refs/heads/fix/browser-instructions` | `6ec32802839652a6e7a6d59bf035da8993e1ffad` | Delivered/reconciled | 55 ancestor; reviewed final implementation supersedes source snapshot |
| `refs/heads/fix/chat-drawer-limits` | `00f279ef700ecf949f0becacbdd711ff7d91bdb3` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/chat-loading-delivery` | `d72dc516e86c5d3f227721c9f6478de233e86336` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/claude-child-activity` | `2f6ffd49efd9bfe30494bcde5a99bcd66032ba8e` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/heads/fix/codex-failure-label` | `81ca81729860dbfffe7491edf219da313f821915` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/codex-terminal-commands` | `ce10a1b88a7fd6285f17629439b262d5a8db9c32` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/compact-sending-control` | `72c920c9240af54c485f7e3311dd0e1528d71067` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/computer-names` | `645332b0ec275521e5e94aec2e7656d56bbf1d3c` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/computers-dialog` | `f48f235b3e4266af3eb69dc0454b5415d4143f23` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/discard-idle-geckit-tabs` | `746fc6589f9c7b10389bc1ec9ccaf87311cbd792` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/gecko-badge-clip-20261029` | `57addd11814c7b44e0865e8606451bc30f23f86c` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/gecko-chat-messages` | `dce5d90d1710c4400662b7d6b6a49fec3c86858d` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/gecko-menu-speed` | `2b693b1da8e4c9d31a0a6232f6c78a3482ee0602` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/hook-block-ui` | `230492dbe4a99030a7edbc2faf51826ac2fbe320` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/import-board-visibility` | `0b4ac1355f1e178613dae92a3c09d47f3a5063c1` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/inline-model-sending` | `c8a8c5c76b4627648fdd6a46a89c76f9975dce8d` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/manager-cli-finalize` | `8b5fd6a53f453669651b0fc2228f2c6e285eaae8` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/manager-cli-main` | `fdaa02d7978832a629413245fffb9e6240031829` | Delivered/reconciled | 15b57de1 ancestor; reviewed final implementation supersedes source snapshot; private dependency snapshot8bda76f excluded |
| `refs/heads/fix/manager-cli-preferences` | `fdaa02d7978832a629413245fffb9e6240031829` | Delivered/reconciled | 15b57de1 ancestor; reviewed final implementation supersedes source snapshot; private dependency snapshot8bda76f excluded |
| `refs/heads/fix/manager-cli-preferences-main` | `1ce467ed82ceba919c64a5b3f5ccf58d8ac56980` | Delivered/reconciled | 15b57de1 ancestor; reviewed final implementation supersedes source snapshot; private dependency snapshot8bda76f excluded |
| `refs/heads/fix/mobile-session-visibility` | `8a05c19ddb9aa932630fcce599d9fc0dadb82630` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/mobile-task-ui` | `d287fad1364ab8cf5ccc4f7ce7fc822d831be876` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/new-task-drop-isolation-20261022` | `b996781e40faa47070798e0ed3d3331850f2c13b` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/heads/fix/new-task-employee-selector` | `373dd57971a09a00ff15b34b4a841c125c7e9f9b` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/phone-composer-size` | `121033b8f178674b9771d38f1d2a573be73ea7fc` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/pr18-resize` | `9288b16a89383b8510c6d75879daddbb368a4f57` | Delivered/reconciled | 18 ancestor; reviewed final implementation supersedes source snapshot |
| `refs/heads/fix/pr57-header-only-01a1b03b` | `04ed72b89fe7c63cb0eb37d50ed784158102cd18` | Delivered/reconciled | 57 ancestor; reviewed final implementation supersedes source snapshot |
| `refs/heads/fix/provider-credit-balances` | `b9f5be607ecef564fb7792e965a2ec029afd5018` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/heads/fix/provider-goals-live-libraries` | `688fc3a5d285dd114d495e0dd916226a165cc8db` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/publish-whisper-layout-20261024` | `9ac08547f48eb68119dc1c1bdc380136c052c58b` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/heads/fix/remember-computer-use-access` | `6353a870c810fc818ad77de00189b6e2635d16c5` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/remember-task-folder` | `5ebaf74af2b880e70dd08ac05b5924ce8e360028` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/heads/fix/remote-hosts-20261107` | `d09b0c116a15d77c029bf6d7f5b9e9256d6beb49` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/retry-steering-20261024` | `e215ce0a4357e3d7887c815b8e37d382e8dfa70c` | Delivered | PR31 merge 1770fe930736e70ebb827919bab5a31a1e8b4084 is ancestor; later evolution retained |
| `refs/heads/fix/same-provider-handoff` | `eb461240999b6213ee3bcad5aa54044f10ebc1bc` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/telegram-approval-formatting` | `e4e703a58e0f73024fca8cf1a4cda8c629158e40` | Delivered | exact ancestor of origin/main |
| `refs/heads/fix/telegram-manager-typing` | `15a48d8df1c5afdfaf142cf37fb24bb49f080327` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/heads/fix/telegram-recovery-20261022` | `120273462739a342a9bb2072f6dc68eb67423924` | Delivered | PR29 merge 7602fcd825af6fb1d539d59957f6eaa8c4251f7d is ancestor; later evolution retained |
| `refs/heads/fix/tmux-session-origin` | `7306f4a53fedfaea9e0a465bd71841664bb39ee0` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/heads/fix/voice-memos-connect` | `4569b967373a1ca10b1ff122552e15ace313c494` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/heads/fix/vpn-lookup-recovery-20261014` | `6a9af5df3903f6056866baef1a227c470fd26d41` | Delivered | exact ancestor of origin/main |
| `refs/heads/fs-rebase` | `f1b50b3ab0d55bd108eabcfeb63ad3e146b95b5e` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/heads/integrate/manager-threads` | `5686fd3212406240925a2bc7b2d156c6ec325a68` | Delivered | exact ancestor of origin/main |
| `refs/heads/main` | `085120443f00ebcb4c08728c1a333c6532a0cfaa` | Delivered | exact ancestor of origin/main |
| `refs/heads/manager-hours-design` | `6d6abb36fc799f593e9dc7e6fd8a93f05d4cc1c3` | Delivered | PR45 merge 632b9c9b4a3d649704205464dece2e2183415c3b is ancestor; later evolution retained |
| `refs/heads/phone` | `5a105c2293ff48f9eb7f8601441fc29f7ff8389f` | Delivered | exact ancestor of origin/main |
| `refs/heads/phone-design` | `f9b172b087fd0ea0e3c9d620b678b5bb05793705` | Delivered | exact ancestor of origin/main |
| `refs/heads/pr2-review` | `e0bb1242c605f7030a312bd2e34605f7d1f13416` | Delivered/reconciled | 2 ancestor; reviewed final implementation supersedes source snapshot |
| `refs/heads/privacy-fs` | `d6698e4248daf295cb4c219fd50ad8224c4bc750` | Delivered | exact ancestor of origin/main |
| `refs/heads/push-settings-reload` | `2d3fdc9935fc70c7b40cd80257d5c5a198bcd520` | Delivered | exact ancestor of origin/main |
| `refs/heads/review/pr20-let-go` | `eaca922f84a5970a3d88489ada589285c7765ac1` | Delivered/reconciled | 20 ancestor; reviewed final implementation supersedes source snapshot |
| `refs/heads/test/manager-recovery-receipts-20261024` | `6f3dafece37544cfdac82fc0ff567d7abdbfb364` | Delivered | exact ancestor of origin/main |
| `refs/heads/whisper-cli-ci` | `3b4d2f410db566924fdc2a8cf8553fae918932d7` | Delivered | exact ancestor of origin/main |
| `refs/heads/windows-claude` | `2e1b88ac222aa1d141dde60a1a036d2c42677c8d` | Delivered | exact ancestor of origin/main |
| `refs/remotes/origin/001-remote-hosts` | `aa2a22a28e50dcfbf7034a92dc056379297b9434` | Ready, review pending | hosts foundation via PR12; missing PR13 restored as647ad747 |
| `refs/remotes/origin/HEAD` | `376105a093a142721c04b6e0771c29088adc9b2e` | Delivered | exact ancestor of origin/main |
| `refs/remotes/origin/delivery/all-ready-20261106` | `fd6bab89651175e50755f16ea313d24d91b8d986` | Delivered | PR55 merge 44565059a7bcc9c4785b15c50b810f430c963543 is ancestor; later evolution retained |
| `refs/remotes/origin/delivery/discord-cli-01a1b5e2` | `b9eac0e5a0ea4fd8b51be00517bfc7f37a281b90` | Delivered | exact ancestor of origin/main |
| `refs/remotes/origin/delivery/manager-history-20261106` | `fad701a41c825cc735081df50f6a7520696ed7ad` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/remotes/origin/delivery/telegram-tables-20261106` | `04ed72b89fe7c63cb0eb37d50ed784158102cd18` | Delivered | PR57 merge 5831a6ce0009351e14b1f04ad77f8a7ff71c26bc is ancestor; later evolution retained |
| `refs/remotes/origin/dependabot/npm_and_yarn/client/electron-45.2.2` | `f8bc2f277052f1f83eda5df139ce442758742d96` | Unfinished upgrade | PR61; current CI in report |
| `refs/remotes/origin/dependabot/npm_and_yarn/client/electron-vite-6.0.0` | `29afc462a48c7f5ac3b078e14aee7a873c09efad` | Delivered | exact ancestor of origin/main |
| `refs/remotes/origin/dependabot/npm_and_yarn/client/minor-and-patch-4cc7317656` | `81eb1db82fdd4160cb1c88d917a7d3aae04a2483` | Review blocked | PR60; current CI in report |
| `refs/remotes/origin/dependabot/npm_and_yarn/client/sentry/electron-8.3.0` | `68db3bc503aabc993a1acf1324a714d043febb49` | Unfinished upgrade | PR63; current CI in report |
| `refs/remotes/origin/dependabot/npm_and_yarn/client/types/node-26.6.6` | `40ebc234610e83116cb2deda7c6fee4b08297d42` | Review blocked | PR62; current CI in report |
| `refs/remotes/origin/dependabot/npm_and_yarn/client/typescript-7.0.2` | `0fb8f930b10e457a6ac0d9e437bddc554064d2bc` | Unfinished upgrade | PR37; current CI in report |
| `refs/remotes/origin/feat/agent-settings-shortcuts` | `3ab012de747fbb591885e29b4a50cc5e9c89df82` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/remotes/origin/feat/agent-vpn` | `74a86a4965f5b98d2c6767eec7fe3e47240fb23c` | Unfinished, preserved | handoff explicitly paused; native qualification tasks incomplete |
| `refs/remotes/origin/feat/discord-channel` | `c845b0b55a0a9e0475c56681024aee50c4f35b09` | Delivered | exact ancestor of origin/main |
| `refs/remotes/origin/feat/gecko-character` | `e3a421bff59a1fcc52b76ed7d6e43b2cee6600a3` | Delivered/reconciled | a1dd722a ancestor; reviewed final implementation supersedes source snapshot |
| `refs/remotes/origin/feat/typed-mcp-opens-menu` | `21e4b1318d182435c42d09d8e080a7890935264b` | Ready, review pending | 21e4b131 cherry-picked as82e54d83 |
| `refs/remotes/origin/feat/vpn-ip-guard` | `1f1457dcc747fdef6e628181b76f79112a35e66f` | Delivered/reconciled | b460df5f ancestor; reviewed final implementation supersedes source snapshot |
| `refs/remotes/origin/feat/windows-screen-control` | `e3c1b92a7b429f48af9ec027083e58e934afc2cb` | Delivered | PR23 merge 16df58104f7431e1d3f07700d281f42b51a91d89 is ancestor; later evolution retained |
| `refs/remotes/origin/feature/board-columns-below` | `9288b16a89383b8510c6d75879daddbb368a4f57` | Delivered | PR18 merge 42e6260a69ac0fe170b8573b357ade58408760ba is ancestor; later evolution retained |
| `refs/remotes/origin/feature/let-go` | `eaca922f84a5970a3d88489ada589285c7765ac1` | Delivered | PR20 merge d88d0561d7fa86f8b6bb09cf4c12179024e3ceb9 is ancestor; later evolution retained |
| `refs/remotes/origin/feature/telegram-local-links` | `8635361f16cec21727ed8ab1b7c6b10dc255b02f` | Delivered | PR27 merge 96debe9c30ae9aae447609f6ecb6bdd2a12e374e is ancestor; later evolution retained |
| `refs/remotes/origin/feature/windows-attention` | `f689df8bfd2dac604113ec4c8f7ba1ec0945027d` | Delivered | PR19 merge 8858ecfffc3aee308f636252f992339b1485a6d5 is ancestor; later evolution retained |
| `refs/remotes/origin/fix/claude-child-activity` | `2f6ffd49efd9bfe30494bcde5a99bcd66032ba8e` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/remotes/origin/fix/headless-service-shutdown` | `f473052bf9ade46ffb2fdc3305f9622c1935a940` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/remotes/origin/fix/manager-cli-preferences-main` | `1ce467ed82ceba919c64a5b3f5ccf58d8ac56980` | Delivered/reconciled | 15b57de1 ancestor; reviewed final implementation supersedes source snapshot; private dependency snapshot8bda76f excluded |
| `refs/remotes/origin/fix/new-task-drop-isolation-20261022` | `b996781e40faa47070798e0ed3d3331850f2c13b` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/remotes/origin/fix/provider-goals-live-libraries` | `688fc3a5d285dd114d495e0dd916226a165cc8db` | Delivered | exact ancestor of origin/main |
| `refs/remotes/origin/fix/publish-whisper-layout-20261024` | `9ac08547f48eb68119dc1c1bdc380136c052c58b` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/remotes/origin/fix/remember-task-folder` | `5ebaf74af2b880e70dd08ac05b5924ce8e360028` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/remotes/origin/fix/telegram-manager-typing` | `15a48d8df1c5afdfaf142cf37fb24bb49f080327` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/remotes/origin/fix/telegram-recovery-20261022` | `120273462739a342a9bb2072f6dc68eb67423924` | Delivered | PR29 merge 7602fcd825af6fb1d539d59957f6eaa8c4251f7d is ancestor; later evolution retained |
| `refs/remotes/origin/fix/tmux-session-origin` | `7306f4a53fedfaea9e0a465bd71841664bb39ee0` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/remotes/origin/fix/unpack-service-native-addons` | `98c9153778d56fe200033da32eb6b021684b2567` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/remotes/origin/fix/voice-memos-connect` | `4569b967373a1ca10b1ff122552e15ace313c494` | Delivered | all branch patches equivalent in origin/main (git cherry) |
| `refs/remotes/origin/main` | `376105a093a142721c04b6e0771c29088adc9b2e` | Delivered | exact ancestor of origin/main |
| `refs/remotes/origin/manager-hours-design` | `6d6abb36fc799f593e9dc7e6fd8a93f05d4cc1c3` | Delivered | PR45 merge 632b9c9b4a3d649704205464dece2e2183415c3b is ancestor; later evolution retained |
| `refs/remotes/origin/remote-hosts-design` | `4e74aa3356c3df3446f1e78ea01ea19a4f946e9b` | Delivered/reconciled | 12 ancestor; reviewed final implementation supersedes source snapshot |
| `refs/remotes/origin/test/manager-recovery-receipts-20261024` | `6f3dafece37544cfdac82fc0ff567d7abdbfb364` | Delivered | exact ancestor of origin/main |
