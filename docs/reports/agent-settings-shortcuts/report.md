# Настройки и shortcuts без дополнительного подтверждения

Сессия: `codex:01a1ace8-8e2b-7dd3-aa4e-724fb333b230`. База: `origin/main` → `748fc82`. Ветка: `feat/agent-settings-shortcuts`. Изменение находится в исходниках; установленный GeckIt не обновлялся.

## Результат

Рабочий агент и аутентифицированный Manager получают общий поддерживаемый контракт чтения и частичного изменения настроек. Валидные настройки, сохранённые shortcuts и инструкции/портрет Manager применяются без дополнительной карточки Allow/решения Manager. Shortcut в этом продукте - сохранённый prompt новой задачи или Manager с проектом, параметрами ассистента, целью и необязательным расписанием; это не клавиатурная комбинация.

Новый обработчик сохраняет через существующий `setSettings`, поэтому использует прежнее хранение конфигурации и события применения. Неуказанные поля сохраняются; массивы заменяются целиком; карты `browserNames`, `projectColors`, `guidePlugins` объединяются по ключам. Вся patch валидируется до записи. Необязательный `--expected` защищает от перезаписи изменившихся полей. Потеря ответа требует повторного чтения, а не слепого повторения записи.

## Команды

Исполняемый CLI той копии GeckIt, где установлено изменение:

```sh
geckit settings schema
geckit settings show
geckit settings edit --patch '{"theme":"dark","workingAtOnce":3}'
geckit settings edit --patch '{"theme":"light"}' --expected '{"theme":"dark"}'
geckit employees shortcuts --json
geckit employees shortcut add none --name 'Daily check' --project '<registered-project-name>' --prompt '<assignment>' --every 'day 9:00'
geckit employees shortcut edit <shortcut-id> --prompt '<updated-assignment>'
geckit employees shortcut pause <shortcut-id>
geckit employees shortcut resume <shortcut-id>
geckit employees shortcut give <shortcut-id> <employee-id-or-none>
geckit employees shortcut run <shortcut-id>
geckit employees shortcut remove <shortcut-id>
```

В source-копии имя CLI - `geckit-local`; до обновления активной копии новые команды в ней недоступны. Для изолированной сборки: `GECKIT_DATA=<isolated-data> node client/out/service/cli.js settings schema` при запущенном сервисе той же сборки на этих данных.

Manager использует те же `settings schema/show/edit` и `employees shortcuts/shortcut ...` через существующий аутентифицированный Manager CLI. `capabilities` публикует команды, поля и ограничения; schema, advertised capabilities и handlers согласованы. Инструкции Manager: `settings manager`, затем `settings manager-edit --instructions '<text>' --expected-instructions '<last-read-text>'`, затем повторное чтение. Worker меняет эти предпочтения существующим `employees manager edit --instructions '<text>' [--avatar 1]`.

`settings schema` перечисляет все доступные поля, включая внешний вид, concurrency, модели включённых ассистентов, списки/профили зарегистрированных проектов, фразы, open-with, интеграционные предпочтения и VPN-проверку. Чтение исключает credentials, pairing keys и channel secrets. Settings patch не включает провайдеров, не устанавливает библиотеки, не выдаёт channel grants и не регистрирует hosts/projects. Реальные native/provider permissions, делегирование Manager и подтверждения несвязанных операций сохраняются.

## Где были пробелы

- Worker CLI не имел общего поддерживаемого settings edit/schema; Manager settings show был ограниченной проекцией без edit.
- Компактный доступ Manager к employees отклонял shortcuts, хотя полноценный handler уже существовал.
- `Employees.command` запрашивал Allow для shortcut и Manager preferences; `ManagerOperations.confirmation` отдельно требовал решение для manager-edit.
- Guide, CLI help и Manager capabilities описывали прежние ограничения. Теперь они используют новый контракт; остальные gates не сняты.

Основные файлы: `client/src/shared/agent-settings.ts`, `client/src/main/agent-settings.ts`, `client/src/cli/settings.ts`, `client/src/core/operator.ts`, `client/src/main/employees.ts`, `client/src/main/manager-operations.ts`, `client/src/main/guide.ts`, `client/src/main/manager-protocol.ts`. UX: `docs/ux/agent-settings-shortcuts.md`. Канонический feature list и audit обновлены в рамках явно запрошенной функции.

## Evidence

- `tests.log`: полный suite - 1640 passed, 1 skipped; 121 passed files, 1 skipped. `application.log`: дополнительно 8/8 headless integration tests после добавления проверки concurrency; лимит 1 удерживает вторую задачу, изменение на 3 запускает её без перезапуска (с прежней задержкой очереди 3-10 секунд).
- `typecheck.log`, `lint.log`, `build.log`: TypeScript, ESLint и сборка desktop/service/renderer прошли.
- `mobile-build.log`: `npm run build --prefix mobile` прошёл; предупреждение Vite о крупных chunks, без изменения renderer/CSS.
- `test/agent-settings.test.ts`: schema, неизвестные поля, типы/enums, отрицательная/дробная concurrency, запрещённые provider/credential поля, карты/массивы, VPN, profiles, conflict, атомарный отказ без записи.
- `test/employees-team.test.ts`: lifecycle shortcuts, отсутствие ask, сохранение существующих approvals других team-операций.
- `test/headless-service.test.ts`: настоящая сборка сервиса, socket handler, worker CLI и аутентифицированный subprocess CLI Manager на временных данных. Проверены no-confirmation при approve delegation, disk/readback, повторный запуск только изолированного сервиса, изменённый prompt действительно dispatches и возвращает результат, invalid cron/provider/settings не записываются. Provider заменён fixture; installed runtime не участвует.
- `test/manager.test.ts`: аутентификация, сохранение инструкций, conflict и отсутствие решения для настроек; несвязанные решения сохраняются.
- Fixture восстановления дополнен обязательным `tasks: []`; это исправление тестового контракта, не поведения внешнего провайдера.

## Непроверенное и блокер

Установленный GeckIt/Manager не перезапускался, не обновлялся; реальные Claude/Codex turns и native разрешения не проверялись. Изолированные integration-тесты подтверждают host/CLI, хранение и dispatch, а не подключение к внешним провайдерам.

Визуальная проверка Settings/Shortcuts desktop/phone light/dark и keyboard/focus/scroll не выполнена. Performance review: новые ветки не добавляют renderer hot paths, таймеры или layout work; отдельные performance-измерения не проводились. Renderer/CSS не изменялись, но косвенно затронутые существующие экраны требуют проверки. Поддерживаемый test browser отказал: `This conversation is not registered with GeckIt`. Автоматическая проверка разрешений отклонила открытие preview в личном Chrome-профиле как недопустимый fallback. Запрошено явное разрешение только новой фоновой tab-scoped вкладки localhost:5188; без ответа этот путь не использован. Требование проверки взято из `apple-ui/references/review.md` и поручения Алекса; оно не считается пройденным по сборке или fixture.

Main checkout, PR #53 и worktrees `/private/tmp/geckit-child-activity`, `/private/tmp/geckit-tmux-child-activity` сохранены. Release, deploy, установка и push main не выполнялись.

## Доставка

Подготовлен draft PR из собственной ветки; merge/push main не выполняется. После проверки remote собственный временный worktree подлежит safe cleanup. До отдельной визуальной проверки результат остаётся с отмеченным ограничением. Ссылка на PR и фактический cleanup фиксируются в day-plan и итоговом ответе.
