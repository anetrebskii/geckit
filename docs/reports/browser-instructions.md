# Обязательный браузер через GeckIt: локальный результат

Дата: 2026-11-06. Ветка `fix/browser-instructions`, worktree `/private/tmp/geckit-browser-instructions`, база `236bcef9` (локальный main на момент начала). Новый коммит не создавался; diff готов к ревью. Push, PR, публикация, изменение разрешений и перезапуск пользовательского GeckIt не выполнялись. Worktree сохранён.

## Изменённые файлы

- `client/src/main/guide.ts`: одно общее правило для generated guides и browser skills; убрано прежнее исключение Claude `unless the person names one`. Команды, поддержка штатного test browser, условия включения и native permissions не менялись.
- `client/test/guide.test.ts`: две проверки installed/source, каждая генерирует инструкции обоих провайдеров при включённой интеграции, затем выключает её и проверяет реальные файлы. Изолированы home/config/data, CorePlatform и source environment; GeckIt service и пользовательский браузер не запускаются.
- `docs/reports/browser-instructions.md`: этот отчёт.
- Вне репозитория обновлён `/Users/alex/Projects/mine/my-workspace/tasks/2026-11-06.md`.

## Точная итоговая формулировка

Ниже фактический browser-раздел сформированного Claude guide. Только путь CLI заменён на `<command>`: `cliPath()` выбирает команду данной копии GeckIt (`geckit` или `geckit-local`, на Windows Codex использует `.cmd`). Codex installed получает тот же текст с `geckit-browser` вместо `geckit:browser`. Source Codex получает общие четыре абзаца и полную существующую справку inline вместо ссылки на skill. Skills содержат те же четыре абзаца и справку, без вступления «The person turned on».

> The person turned on Chrome through GeckIt. Use `<command> browser` for all browser actions and page reading through GeckIt's browser integration. The person's Chrome is reached through the GeckIt Browser extension; GeckIt's own test browser is available only for the documented test-browser scenarios.
>
> Work only in the tab the person named or a new background tab you open for this task. Do not take over unrelated tabs or switch Chrome profiles to find the target tab.
>
> If GeckIt's browser integration is unavailable, disconnected, paused, denied or does not support the requested action, report the specific failure or unsupported action and stop the affected browser work. Do not fall back to other browser tools, direct page fetching, Playwright/CDP, AppleScript or native computer control. GeckIt's documented test browser is not a way around a refusal or permission denial.
>
> Native provider permissions still apply. This browser requirement grants no new permission: do not bypass a denial, change permissions, extract credentials or switch profiles to evade a restriction. The `geckit:browser` skill says how: load it before the first browser command.

Существующие сценарии GeckIt test browser сохранены: страницы, закрытые для расширений; изолированные проверки; отсутствие профиля с расширением. Это часть штатного `geckit browser`, а не разрешение обходить отказ. Управление личными профилями остаётся через CLI, с выбором нужного аккаунта перед открытием страницы, без переключения профилей ради поиска целевой вкладки или обхода ограничений.

## Источники и подключение

| Путь | Авторитетный источник и механизм |
| --- | --- |
| Общий toggle | `client/src/core/runtime.ts:298`: startup вызывает `keepBrowserBridge(settings.chromeBridge)`, затем `setAllInstructions`. Обработчик settings (`:309`) повторяет обновление при смене toggle. `sessions/provider.ts:129,202` направляет built-in Codex/Claude в `keepCodexGuide`/`keepGuide`. |
| Общий текст | `guide.ts:410` — `browserRules`; `:458` — `BROWSER_SKILL`; `:473` — `BROWSER`, возвращающий пустую строку при `!browserBridgeOn()`. |
| Claude installed | `guide.ts:317` — `keepGuide`: записывает `<CLAUDE_CONFIG_DIR>/GECKIT.md` и добавляет `@GECKIT.md` в `CLAUDE.md`. `keepBrowserSkills` (`:84`) создаёт `<data>/claude-plugin/.claude-plugin/plugin.json` и `skills/browser/SKILL.md`. В локальном `holdClaude` (`sessions/claude.ts:135`) включённый bridge и существующий plugin folder заменяют `--chrome` на `--plugin-dir <folder>`. Skill называется `geckit:browser`. |
| Claude source | `keepGuide` пишет `<data>/GECKIT.md`, выставляет `GECKIT_SOURCE_GUIDE` и `GECKIT_SOURCE_CLI`. `sessions/claude.ts:65` (`sourceArgs`) добавляет `--append-system-prompt` со ссылкой на этот guide и правильной source-командой. Browser skill остаётся в source-копии plugin folder. Installed файлы сохраняются. |
| Codex installed | `guide.ts:366` — `keepCodexGuide`: записывает `<CODEX_HOME>/GECKIT.md`, добавляет строку `Read <absolute guide path> ...` в `AGENTS.md`. `keepBrowserSkills` создаёт `<CODEX_HOME>/skills/geckit-browser/SKILL.md`. |
| Codex source | `keepCodexGuide` пишет `<data>/GECKIT-CODEX.md`, выставляет `GECKIT_SOURCE_CODEX_GUIDE`. `codexGuide` (`:483`) включает `BROWSER(..., false, fromSource())`, то есть полную справку inline. `sessions/codex-protocol.ts:66` передаёт ссылку через `developerInstructions`; `sessions/codex.ts:53` сохраняет effective developer instructions пользователя. Existing tests проверяют thread/start, thread/fork, thread/resume. Installed Codex guide/skill source-копия не переписывает. |

Это правка инструкций встроенных провайдеров, а не принудительный runtime-фильтр всех инструментов. Подключение Claude plugin подтверждено чтением actual launch branch; реальный Claude subprocess не запускался.

## Фактические артефакты и проверки

Дополнительный capture из тех же production-функций сохранён в `/private/tmp/geckit-browser-instructions-evidence/`. `installed/enabled` содержит два guides и два skills; `source/enabled` — два guides и Claude skill (Codex справка inline). В `connection.json` сохранены реальные import/source pointers. В обоих `disabled` сохранены guides без browser-раздела. Временный capture test удалён; постоянная регрессия находится в `guide.test.ts`.

Проверена матрица installed/source × Claude/Codex × enabled/disabled. Обязательные четыре абзаца присутствуют в каждом включённом payload; старое исключение отсутствует. При выключении bridge исчезают browser rule/how из guides и удаляется plugin skill; installed Codex skill удаляется только installed-копией. Source-копия сохраняет чужой installed skill, что отдельно проверено. Общие GeckIt guides и import pointers при выключении только browser toggle остаются: остальные функции GeckIt продолжают иметь инструкции.

Из `client/`:

```sh
npm exec vitest run test/guide.test.ts test/browser-bridge.test.ts test/employees-guide.test.ts test/codex.test.ts
npm run typecheck
npm run lint
```

Результат последнего прогона: **113 passed, 4 test files passed**, typecheck и полный lint — exit 0. `git diff --check` — exit 0. Логи: `/private/tmp/geckit-browser-focused.log`, `/private/tmp/geckit-browser-typecheck.log`, `/private/tmp/geckit-browser-lint.log`.

Промежуточный capture-прогон выявил ненужный fs.watch в новом fixture и sandbox EPERM существующего Unix-socket daemon test. Fixture исправлен: skill generation запускается без service launcher, затем launcher добавляется только для guide generation. Окончательный набор с доступом к локальному тестовому Unix socket прошёл без ошибок. Полный lint один раз попал на удаление временного capture-файла; окончательный прогон после удаления прошёл.

## Границы проверки

Проверены настоящая генерация/запись/удаление файлов в изолированных каталогах, import/source pointers и протокольные тесты Codex с fake app-server. Это не live browser/provider integration: не проверялось поведение модели в новом реальном разговоре, SSH-хост, все сторонние provider libraries или физические платформы Windows/Linux. UI не менялся, визуальная проверка не требуется. Сборка/упаковка и полный набор несвязанных тестов не запускались для этой текстовой правки.

Пользовательские guides, browser toggle, native approvals, credentials, текущие разрешения и Instagram не менялись. Рабочий GeckIt продолжает использовать прежнюю сборку; новые инструкции применятся через штатную генерацию обновлённой версией. Чужие изменения основного checkout сохранены.

Новая feature-entry не требуется: существующие пункты Chrome through GeckIt и Test browsers уже описывают этот workflow. Библиотека проверенных how-to просмотрена; подходящих записей для инженерной правки инструкций нет. Day-plan переведён в `#inreview`, с веткой, worktree, проверками и ограничениями.
