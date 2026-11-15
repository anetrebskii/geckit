# Проверка общего контракта каналов

2026-11-14. Ветка `feat/channel-contract-v2`, локальные изменения без коммита. Codex session `01a1da97-84e3-7780-936a-086c7c987d55`.

## Результат

Telegram, Slack и Discord создаются через один `ChannelModule.create(context)`. Установленные библиотеки получают тот же контракт, включая собственные настройки, миграции, sealed storage, вложения, запросы и публикацию состояния. Отличия в доступных возможностях объявлены в capabilities. Регистрация bundled-модулей задаёт только состав поставки, правила обновления/удаления.

Удалены TelegramRow, ManagerTelegram renderer, отдельный DiscordSetup, renderer.telegram и Telegram phone endpoints. В Manager нет панели Telegram или разбора старых Telegram-полей. Все шаги подключения принадлежат модулям через `settings(context, request)`. При отсутствии hook форма строится из manifest. Permissions всегда принадлежат общему host. Telegram использует структурный код ошибки контракта вместо host-класса ManagerDecisionFailure.

Миграции выполняются для библиотек при запуске, установке и обновлении. Legacy Manager JSON преобразует модуль через `restoreManager`; ошибка преобразования прерывает восстановление вместо сохранения пустой записи. Snapshot и live update на телефон проходят одинаковый `present` hook. Host не знает имён legacy-файлов Telegram.

## Проверки

| Проверка | Результат |
| --- | --- |
| Typecheck | Все четыре tsconfig прошли |
| ESLint | Без ошибок и предупреждений |
| Desktop и service build | Прошли |
| Mobile build | Прошёл; предупреждение сборщика о крупных chunks сохранено |
| Финальный focused run | 87 тестов в 5 файлах прошли: channels, telegram-channel, discord, manager-ui, desktop-service-client |
| Финальная проверка snapshot | 37 тестов Channels и desktop-service-client прошли после выравнивания live/reconnect presentation |
| Полный прогон | 1987 passed, 22 skipped, 1 failed; последующие два теста адаптера входят в финальный focused run |
| Оставшийся полный сбой | `test/recurrence.test.ts:76`: cache endpoint, expected 65 < 13. Этот тест и реализация recurrence не менялись; сбой присутствовал до текущих исправлений |
| Изоляция библиотек | Каждый из трёх каналов собран esbuild отдельно, без Manager, core, service, filesystem store или Electron в runtime-зависимостях |
| Установленная библиотека | Settings hook, migration, runtime request, configure и phone presentation проверены через настоящий Channels с временным каталогом библиотеки |
| Telegram adapter | Saved record migration, private thread/send, pause/resume, host answers, decisions, review notices, verified team ready и durable delivery через context проверены с фиктивным транспортом |
| Поиск имён каналов | core/, service/, Manager, approvals, intake, operations, status и voice не содержат имён каналов; общий registry и тестовые fixtures допускаются |
| Diff whitespace | `git diff --check` чистый |

## Renderer в браузере

Реальные SettingsDialog, Channels и ChannelScreen, реальные settings hooks Telegram/Discord. IPC и внешние сервисы заменены явной фикстурой `client/test/browser/team-telegram/main.tsx`, которая монтирует `settings-preview.tsx`. Это проверяет обработчики UI, передачу значений и отображение результата, но не реальный Telegram/Slack/Discord аккаунт и не нативное хранение секретов.

Проверены полный светлый экран 1280x900 и тёмный 390x844, прокрутка длинного содержимого, переносы, отсутствие горизонтального переполнения страницы и формы, видимый фокус. В узком окне навигация Settings теперь идёт горизонтальной строкой над формой. Исправлены потеря фокуса при асинхронной ошибке/сохранении и обход подтверждения через Enter.

| Сценарий | Наблюдение |
| --- | --- |
| Telegram team setup | Пустой token и неверный approver ID отклонены; введённое сохраняется; Enter переводит к одноразовой команде |
| Telegram candidate | Фиктивный командный аккаунт подтверждён, отображается Connected |
| Disconnect | Общее подтверждение; Escape отменяет действие и возвращает фокус, следующий Escape закрывает только настройку |
| Unknown library ID | Форма и действие появились без renderer ветки по ID; Confirm отображает ответ библиотеки; Enter тоже требует Confirm |
| Discord | Checked setup показывает intent, серверы и длинные имена; allowlist сохраняется и остаётся в форме; фокус возвращается на Save channel settings |
| Slack manifest form | Неверный user ID отклонён с сохранением ввода и фокусом на ошибке; после исправления Save закрывает форму и возвращает фокус на Set up |

Снимки: [светлый Slack](channel-contract-v2-evidence/light-desktop-slack.png), [тёмный Telegram](channel-contract-v2-evidence/dark-narrow-telegram.png), [тёмный Discord](channel-contract-v2-evidence/dark-narrow-discord.png). Тестовая вкладка закрыта, отдельный Vite preview остановлен. Работающий GeckIt не перезапускался.

## Performance review

No performance problems found в затронутом пути Settings по статической проверке `docs/performance.md`; производительность работающего приложения не измерялась.

| Затронутый пункт | Вердикт | Основание |
| --- | --- | --- |
| Работа на каждое нажатие | holds | Ввод хранится локально в открытой форме; нет обхода conversations или transcript |
| Форматирование | holds | Новых Intl/toLocale вызовов нет; модуль использует ISO-время |
| Обновления и очистка | holds | Экран обновляется по событию, без polling; подписка снимается, поздние ответы игнорируются |
| Анимация | holds | Telegram-specific стили/анимация удалены; новых анимаций нет |

Остальные пункты checklist относятся к спискам conversations, hover и основному chat renderer и этим изменением не затронуты.

## Непроверенное

Живые боты, реальные аккаунты, реальная доставка через Telegram/Slack/Discord, нативное окно установленного приложения и физический телефон не проверялись. Тесты API/CLI используют временные каталоги, локальные сокеты и фиктивные внешние транспорты. Старые телефонные сборки с Telegram-only API больше не совместимы: это прямое следствие последнего требования без исключений.

Запись задачи в плане дня переведена в `#inreview` с этим отчётом. Валидатор плана сообщает 20 ранее существовавших ошибок в других записях; они не исправлялись. Предложено уточнение существующего пункта в `docs/features.md`; без ответа пользователя утверждённый список оставлен без изменений.

## Уточнение 2026-11-15: возможности всегда включены

Удалены May talk to Manager, Manager control, Files и Shared links из общей формы всех каналов. Остался выбор папок. Все объявленные библиотекой capabilities включены автоматически, старые manager:false и grants:[] не блокируют канал. Необъявленные возможности остаются недоступны; общий выключатель Manager, On канала и allowlist папок действуют.

Повторно проверены реальные формы Slack, Discord, Telegram и неизвестной внешней библиотеки в renderer fixture. Save закрывает каждую форму; изменение папок Slack сохраняется после повторного открытия. Escape отменяет изменения Telegram и возвращает фокус на Set up, Tab переходит между оставшимися контролами. Осмотрены полный светлый экран 1280x900 и темный 390x844 с прокруткой к папкам и кнопкам; удаленных контролов нет, Save/Cancel доступны. Снимки: channel-contract-v2-evidence/light-permissions-removed.png и dark-permissions-removed.png. IPC и транспорт фиктивные; живые аккаунты не проверялись.

Typecheck, прямой ESLint src/test, desktop/service build и mobile build прошли. Статический performance review: удалены состояния/обработчики переключателей, новой работы на ввод, polling, форматтеров и анимаций нет. Новые измерения производительности не требуются для удаления контролов. Полный тестовый прогон из предыдущего раздела не повторялся.

Финальный focused run после уточнения: 88 tests passed в пяти файлах. git diff --check чистый. Проверочная вкладка закрыта; preview остановлен; работающий GeckIt не перезапускался.

## Последнее уточнение: минимальные настройки Discord и Slack

Discord объявляет только botToken и allow, Slack только botToken и appToken. Общая форма папок удалена для всех каналов и установленных библиотек; при module-owned settings дополнительная пустая host-форма с Save больше не добавляется. Контракт projects() возвращает все проекты GeckIt, start() принимает любой добавленный проект и отказывает неизвестному пути. Старый список проектов канала не ограничивает доступ.

Slack всегда проверяет принадлежность пользователя к своему workspace через users.info и отвечает всем его пользователям, включая гостей. Боты, удаленные пользователи и внешние workspace исключены. Старый allowlist не применяется. Discord сохраняет allowlist пользователей, но игнорирует старые ограничения places/directMessages. Проверки секретов в обоих каналах всегда включены, включая входящие и исходящие файлы. Операционный On канала и глобальный Manager остаются отдельными выключателями соединения и Manager.

Проверки: 98 tests passed в channels, discord, channel-files, manager-ui, telegram-channel, desktop-service-client; typecheck всех четырех tsconfig и прямой ESLint src/test прошли; desktop/service и mobile builds прошли (прежнее предупреждение крупных mobile chunks). Проверены точные схемы полей, legacy allowlist, гости/внешние аккаунты/боты, секреты, Discord DM/другие каналы, файлы, повторная проверка авторизации после асинхронного gate и доступ ко всем проектам.

В браузере проверены реальные SettingsDialog/Channels/ChannelScreen с фиктивным IPC и транспортом: светлый 1280x900 и темный 390x844; Slack имеет ровно два secret-поля, Enter сохраняет, после открытия оба показывают Saved без раскрытия значения. Discord имеет token и People who may write; сохраненный список остается после повторного открытия, пустой token дает Enter your bot token., проверка сохраненного setup убирает ошибку. Просмотрены полные экраны, фокус, Escape/Tab, прокрутка и отсутствие горизонтального переполнения. Telegram и неизвестная внешняя библиотека также не содержат host-полей папок/разрешений. Снимки: light-slack-minimal.png, light-discord-minimal.png, dark-slack-minimal.png и dark-discord-minimal.png в channel-contract-v2-evidence/.

Это проверка renderer fixture и изолированных host/adapter тестов. Реальные аккаунты, внешняя доставка и нативное окно не проверены. Рабочий GeckIt не перезапускался; изменения локальные, без коммита. Статическая performance-проверка: удалены локальные состояния и DOM папок/переключателей, новых formatter, polling или анимаций нет; per-conversation пути не затронуты. Slack использует существующий кэш workspace membership с TTL.


## Исправление native IPC 2026-11-15

По реальному скриншоту Settings обнаружен пропущенный `channels:screen` в `CORE_CHANNELS` Electron main. Метод уже был в renderer API и core application, но не регистрировался через `ipcMain.handle`, что давало `No handler registered`. Добавлен общий маршрут для всех библиотек. Renderer и настройки модулей не менялись.

`test/desktop-service-client.test.ts`: 12 passed. Новый статический guard сверяет все операции каналов renderer API со списком маршрутов Electron. Новый тест через реальный локальный RPC socket и `connectDesktop` проверяет загрузку, действие с values и возврат ошибки для Telegram, Discord и произвольного library ID. Обработчик настройки в RPC-тесте фиктивный; Electron-процесс и живые аккаунты этот тест не запускает. Typecheck (четыре tsconfig), ESLint изменённых исходников/теста, desktop/service build и `git diff --check` прошли.

Применение к уже запущенному приложению требует загрузки нового Electron main; перезагрузка только renderer не регистрирует IPC. Активное приложение и беседы не перезапускались. Повторная проверка Set up в пользовательском окне после загрузки нового main не выполнялась.
