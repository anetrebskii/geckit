---
type: spec
status: built
owner: Alex
created: 2026-10-02
---

# UX: библиотеки провайдеров

## 1. Зачем

Репозитории провайдеров должны иметь своё место в Settings: список подключённых источников, добавление следующего и управление обновлениями. Alex хочет подключить несколько библиотек и получать их новые версии автоматически.

Дизайн и интерактивный preview: [Provider library update design](../design/provider-library-updates.md).

## 2. Что добавляется

| Поверхность | Что появляется | Когда видно |
|---|---|---|
| Settings > Assistants | Компактные строки встроенных ассистентов; инструкции GeckIt раскрываются по запросу | Всегда |
| Settings > Assistants | Codex Mirror как отдельная строка и переключатель рядом с Codex | Когда библиотека Codex Mirror подключена |
| Settings > Assistants | Отдельная строка и переключатель Claude Code (tmux) | Когда подключена библиотека Claude tmux |
| Settings > Libraries | Список репозиториев с именем провайдера, адресом и состоянием обновления | После первой установки |
| Settings > Libraries | Компактный список, переключатель Automatic updates, Check now и Add library | На компьютере |
| Settings > Libraries | Apply update у каждой библиотеки с готовым обновлением | После проверки новой версии |
| Settings > Libraries | Remove у каждой библиотеки, с подтверждением в той же строке | Когда библиотека подключена |
| Settings > Libraries | Пустое состояние | Пока библиотек нет |
| Settings > Libraries | Ошибка установки, проверки или применения около действия | Когда действие не удалось |

```mermaid
block-beta
  columns 2
  a["Нет библиотек"] b["Библиотеки подключены"]
  a1["Assistants · переключатели"] b1["Assistants · переключатели"]
  a2["Libraries · пусто"] b2["Libraries · список репозиториев"]
  a3["Add library → GitHub URL"] b3["Add library · Check now"]
  style a2 fill:#e5e7eb,stroke:#9ca3af
  style b2 fill:#dcfce7,stroke:#16a34a
```

## 3. Состояния

| Состояние | Когда наступает | Что видит пользователь | Что ему делать |
|---|---|---|---|
| Пусто | Нет подключённых репозиториев | «No libraries installed.» | Нажать Add library |
| Ввод адреса | Нажат Add library | Поле URL, Add и Cancel вместо пустого состояния | Вставить адрес и нажать Add |
| Установка | Нажат Add, `git clone` ещё работает | «Adding library…» у кнопки | Ничего, действие закончится само |
| Подключено | Провайдер загружен | Строка с именем, иконкой и адресом | Включить или выключить ассистента выше, если нужно |
| Библиотека Claude tmux | Репозиторий установлен | Отдельная строка Claude Code (tmux) в Settings > Assistants и Composer; встроенный Claude Code остаётся отдельным ассистентом | Включить или выключить библиотеку отдельно и выбирать её для новых бесед |
| Проверка | Нажат Check now | «Checking…» у кнопки | Ничего, действие закончится само |
| Обновление готово | Новая версия проверена и записана | «Update ready» и кнопка «Apply update» | Нажать Apply update, чтобы обновить библиотеку без перезапуска |
| Подтверждение удаления | Нажат Remove у библиотеки | «Remove <name>? Its installed copy moves to Trash. Restart GeckIt to unload its code.» и кнопки Remove library, Cancel | Подтвердить или отменить |
| Удаление | Подтверждено удаление, файлы ещё удаляются | «Removing…» у кнопки | Дождаться результата |
| Удалено | Установленная копия перемещена в Trash | Строка исчезает, «Restart GeckIt to unload removed libraries.» | Перезапустить, когда удобно |
| Ошибка удаления | Файлы нельзя удалить | Строка остаётся, ошибка возле списка | Повторить |
| Ошибка установки | Адрес или репозиторий не прошёл проверку | Текст ошибки под полем | Исправить адрес или повторить |
| Ошибка ручной проверки | Хотя бы один репозиторий не удалось проверить | «Could not check every library. Try again.» | Нажать Check now позже |

## 4. Переходы

```mermaid
stateDiagram-v2
  direction LR
  classDef quiet fill:#e5e7eb,stroke:#9ca3af,color:#111827
  classDef going fill:#dbeafe,stroke:#2563eb,color:#111827
  classDef hands fill:#fee2e2,stroke:#dc2626,color:#111827
  classDef done fill:#dcfce7,stroke:#16a34a,color:#111827
  state "Нет библиотек" as empty
  state "Ввод адреса" as adding
  state "Устанавливается" as installing
  state "Подключено" as current
  state "Проверяется" as checking
  state "Обновление готово" as ready
  state "Применяется" as applying
  state "Подтверждение удаления" as confirmRemove
  state "Удаляется" as removing
  state "Ошибка" as error
  [*] --> empty: первый запуск
  empty --> adding: Add library
  current --> adding: Add library
  adding --> installing: Add
  installing --> current: проверка прошла
  installing --> error: проверка не прошла
  error --> adding: Add снова
  current --> checking: Check now
  checking --> current: версия та же
  checking --> ready: новая версия
  checking --> error: сеть недоступна
  current --> confirmRemove: Remove
  confirmRemove --> current: Cancel
  confirmRemove --> removing: Remove library
  removing --> empty: последняя удалена
  removing --> current: другие остались
  ready --> current: перезапуск загружает обновление
  ready --> applying: Apply update
  applying --> current: новая версия загружена
  applying --> ready: ошибка, старый провайдер восстановлен
  class empty quiet
  class installing going
  class current done
  class checking going
  class confirmRemove hands
  class removing going
  class ready done
  class applying going
  class error hands
```

| Из | Событие | В | Что видит пользователь |
|---|---|---|---|
| Пусто или подключено | Нажал Add library | Ввод адреса | URL, Add и Cancel |
| Ввод адреса | Нажал Add с адресом GitHub | Установка | «Adding library…» |
| Установка | Репозиторий скачан, манифест и интерфейс прошли проверку | Подключено | Новая строка библиотеки |
| Установка | Скачивание или проверка не удались | Ошибка | Ошибка под полем, адрес остаётся |
| Ошибка | Изменил адрес или нажал Add ещё раз | Установка | «Adding library…» |
| Подключено | Само, без пользователя, при старте и раз в день, если Automatic updates включены | Проверка | Ничего |
| Подключено | Нажал Check now | Проверка | «Checking…» |
| Проверка | Версия та же | Подключено | Ничего при автоматической проверке; «Libraries are up to date.» при ручной |
| Проверка | Новая версия прошла проверку | Обновление готово | «Update ready» и кнопка «Apply update» |
| Проверка | Сеть или новая версия не прошла проверку | Подключено или ошибка | Ничего при автоматической проверке; ошибка при ручной |
| Обновление готово | Нажал Apply update | Применяется | «Applying…»; текущие ответы продолжаются |
| Применяется | Провайдер загружен и заменён | Подключено | Готовая отметка исчезает; «<name> updated.» объявляется как статус |
| Применяется | Проверка или замена не удалась | Обновление готово | Старая версия восстановлена; ошибка предлагает повторить |
| Обновление готово | Перезапустил GeckIt до Apply update | Подключено | Загружается staged версия; отметка исчезает |
| Подключено | Нажал Remove | Подтверждение удаления | У строки вопрос, Remove library и Cancel |
| Подтверждение удаления | Нажал Cancel | Подключено | Строка снова обычная |
| Подтверждение удаления | Нажал Remove library | Удаляется | «Removing…» |
| Удаляется | Файлы удалены | Подключено или пусто | Строка исчезла, статус просит перезапустить GeckIt |
| Удаляется | Ошибка файловой системы | Ошибка удаления | Строка остаётся, ошибку можно повторить |

## 5. Что молчит

| Состояние | Почему не показываем |
|---|---|
| Фоновая проверка без новой версии | Пользователь не может и не должен за ней следить |
| Ошибка фоновой проверки из-за сети | Старая рабочая версия остаётся; следующая проверка повторится сама |
| Git commit и служебный путь копии | Для решения пользователя важны репозиторий и необходимость перезапуска |

## 6. Пороги и время

```mermaid
flowchart LR
  A["Запуск GeckIt<br/>фоновая проверка"] --> B["Через 24 часа работы<br/>повторная проверка"] --> C["Update ready<br/>Apply update"] --> D["Новая версия активна<br/>без перезапуска"]
  style A fill:#dbeafe,stroke:#2563eb,color:#111827
  style B fill:#dbeafe,stroke:#2563eb,color:#111827
  style D fill:#dcfce7,stroke:#16a34a,color:#111827
```

| Число | Значение | Почему столько |
|---|---|---|
| 24 часа | Интервал фоновой проверки при работающем приложении | Достаточно для обновлений кода, не создаёт постоянных сетевых запросов |
| 120 секунд | Предел скачивания одного репозитория | Не оставляет установку или ручную проверку зависшей навсегда |

## 7. Формулировки

| Состояние | Текст |
|---|---|
| Пусто | «No libraries installed.» |
| Подсказка | «Providers from GitHub. Apply updates without restarting GeckIt.» |
| Установка | «Adding library…» |
| Проверка | «Checking…» |
| Обновление готово | «Update ready» и кнопка «Apply update» |
| Применение | «Applying…» |
| Успешное применение | «<name> updated.» |
| Подтверждение удаления | «Remove <name>? Its installed copy moves to Trash. Restart GeckIt to unload its code.» |
| Удаление | «Removing…» |
| Удалено | «Restart GeckIt to unload removed libraries.» |
| Ошибка удаления | «Could not remove <name>. Try again.» |
| Проверено без обновлений | «Libraries are up to date.» |
| Ошибка ручной проверки | «Could not check every library. Try again.» |
| Безопасность | «Provider code runs on this computer. Add a repository you trust.» |

## 8. Краевые случаи

- **Пусто:** одна короткая строка вместо пустого контейнера.
- **Всё сразу:** несколько репозиториев стоят отдельными строками; длинный адрес обрезается визуально, целиком остаётся в `title`.
- **Небольшое окно:** навигация и содержимое прокручиваются внутри диалога, нижние действия остаются видимыми; после Add library форма прокручивается в видимую область.
- **Обрыв:** старая версия остаётся рабочей; ручная проверка показывает ошибку, фоновая молчит.
- **Повтор:** Add блокируется, пока идёт установка; существующий репозиторий не устанавливается второй раз.
- **Устаревшая копия:** новая версия пишется отдельно и подменяет файлы только после проверки. Apply update переключает новые беседы сразу; текущий ответ завершается на старом коде, а следующее сообщение продолжает беседу на новой версии.
- **Два провайдера одного семейства:** ограничения интерфейса провайдеров сохраняются, в частности один заменитель Codex.
- **Каждая библиотека добавляет ассистента:** установленная библиотека получает собственную строку и переключатель в Settings > Assistants, собственный выбор в Composer и собственное состояние включения. Установка не выключает встроенного ассистента или другую библиотеку. Для Claude tmux сохранить account/model calls через Claude и отдельный GeckIt assistant identity; не представлять библиотеку только как настройку транспорта Claude.
- **Codex Mirror:** после обновления прежней библиотеки-заменителя Codex остаётся включён, если он был включён; Mirror появляется отдельным включённым ассистентом. Выключение одного не выключает другой. Обе строки бесед могут вести к одной сессии Codex.
- **Удаление библиотеки:** установленная копия отправляется в Trash, ожидающее обновление удаляется. GeckIt не удаляет свои заметки о беседах; файлы бесед провайдер держит сам. Ассистент исчезает из выбора сразу; работающий процесс может закончить текущий ответ, а уже загруженный код выгружается после перезапуска. Повторная установка той же библиотеки требует перезапуска.

## 9. Чего намеренно нет

| Не делаем | Почему |
|---|---|
| Автоматический перезапуск | Он может оборвать работающие беседы |
| Переключение действующей сессии во время ответа | Оно меняло бы поведение посреди ответа |
| Каталог или рейтинг публичных репозиториев | Пользователь приносит конкретные URL; каталог требует модерации и доверия |

## 10. Развилки

### Когда применять обновление

| Вариант | Вердикт |
|---|---|
| Во время работы GeckIt | Нет |
| После следующего запуска | Да |

**Почему:** интерфейс провайдера управляет процессами и сессиями. Подмена активного объекта посреди ответа может потерять события или управление.

### Где держать библиотеки

| Вариант | Вердикт |
|---|---|
| Под каждым встроенным ассистентом | Нет |
| Отдельная секция Libraries в Settings | Да |

**Почему:** один репозиторий может быть самостоятельным провайдером или заменой встроенного. Список источников показывает связь с GitHub независимо от переключателей ассистентов.

## 11. Сверка с требованиями

| Требование | Где закрыто |
|---|---|
| Подключить несколько библиотек | Разделы 2, 3, 8 |
| Автоматически получать обновления | Разделы 4, 5, 6, 10 |
| Улучшить экран из скриншота | Разделы 2, 7, 10 |

**Чего не хватает в требованиях:** интервал проверки и момент применения обновления выбраны здесь.

## Main integration - 2026-10-08

Alex authorized moving Libraries and independent external providers into main. Preserve the documented installation, assistant selection, update and removal flows. This integration has no Agent VPN settings, status, admission checks or native routing dependency. Builtin providers remain available alongside installed libraries. Preserve newer main fixes for session recovery, imported transcripts and phone favorites.

### Integration verification

- Validation passed: 668 tests across 58 files, node/web typecheck, source/test lint, desktop and mobile builds, external Codex provider example test and whitespace check.
- Full-context preview review covered Libraries and Assistants in light/dark themes, installation input, empty state, update indicators and removal confirmation. Model details covered complete, partial, loading and unavailable metadata, long identifiers and phone layout at 390 x 844. Desktop model details and Assistants were inspected at 1280 x 720.
- Keyboard review confirmed URL autofocus, disabled empty submission, cancellation, visible focus, Escape closure with restored opener focus and scrolling to model pricing/quotas while retaining the title. Fixtures use in-memory settings; no live library was installed or removed.
- Static performance review found the existing board/phone row memoization, stable conversation identity and memoized list ordering retained. Library rows use memoization with stable callbacks and offscreen content visibility; typing the repository URL does not invalidate unchanged row props. Provider icons are memoized by primitive props. Polling runs only while visible; formatter construction remains outside render loops. No new infinite animation was introduced. The mobile bundle was rebuilt.
- Needs measuring: library-list rendering in the running integrated Electron app. Native runtime profiling, live installation/update, physical iPhone and released-installer availability were not verified. Browser fixtures establish visual behavior, not native runtime performance.

### Failed removal diagnosis - 2026-10-08

Alex reported a failed Codex Mirror removal in the actual Libraries screen. Keep the installed row and confirmation on failure, and preserve files and conversation history. The error must expose the actionable failure reason instead of hiding it behind a generic retry message.

- File/removal failure: "Could not remove <name>. <reason>". Strip Electron invocation wrappers; if no usable reason is available, retain "Could not remove <name>. Try again."
- If the running main process does not yet have the library-removal handler: "Restart GeckIt to finish updating library management, then try again." The running renderer can update before the main process restarts; retrying alone cannot load the new handler.
- Successful removal still moves the library to Trash and requests restart to unload its code.

The running app was verified on 2026-10-08: its library-removal handler was registered, a disposable-folder Trash probe passed, and retrying the reported Codex Mirror removal through that handler succeeded. The installed directory disappeared, `providerPlugins` became empty, `providerRemovalPending` became true and builtin Codex remained enabled. Conversation deletion was not invoked. The earlier screenshot failure could not be reproduced after the main process restarted; its underlying exception was hidden by the old generic error message.

### Claude tmux assistant identity - 2026-10-08

Alex clarified that every installed library must add its own assistant entry and remain enabled independently alongside builtins and other libraries. The first iteration treated `claude-tmux` as only a Claude transport selector; that does not meet the requirement and is superseded. Give this library an independent GeckIt provider/session identity while delegating its Claude account and model operations as needed. Show the library in Settings > Assistants and Composer. Never make installing it disable or replace builtin Claude.

#### Claude tmux conversation ownership

Alex reported tmux cards for conversations that were not created in GeckIt. The library shares Claude's native transcript directory, but that directory does not establish tmux ownership. Only sessions created with the tmux assistant in GeckIt, or explicitly restored under that assistant, belong to its history. Persisted GeckIt notes establish ownership across restarts; an active GeckIt conversation remains visible before its transcript reaches disk.

| From | Event | To | What the user sees |
|---|---|---|---|
| Unrelated Claude history | Board refresh, search or Hidden listing, automatically | Unrelated Claude history | No duplicate tmux card or result; builtin Claude retains its existing history behavior |
| New tmux conversation | User starts a task with Claude Code (tmux) | Owned tmux conversation | One tmux card, including while its first message waits for a slot |
| Owned tmux conversation | GeckIt restarts or refreshes, automatically | Owned tmux conversation | Existing tmux card and history |
| Owned tmux conversation | User hides it | Hidden tmux conversation | Card leaves the board and is available in Hidden |
| Hidden tmux conversation | User restores it | Owned tmux conversation | Same tmux card returns |

Unrelated transcripts stay silent in tmux search and Hidden as well as on the board. No new copy, controls, timing thresholds, theme rules or layout are introduced. Existing hide, restore, fork and delete behavior applies to owned conversations. Filtering does not delete transcripts or notes. A shared native Claude ID alone must never create a second assistant identity.

Verification: all three ownership regressions pass, covering board/search/Hidden, persistence, new/forked conversations and queued conversations. Typecheck, targeted lint and desktop build pass. Full suite: 664 passed, 19 failed; an isolated baseline without this correction reproduces exactly the same 19 failed test names. Native full-window light/dark, keyboard, scrolling and target viewport review was unavailable because Computer Use access to GeckIt was denied. Renderer components and styling were not changed.

The settings preview visibly shows Claude Code and Claude Code (tmux) as separate rows alongside Codex and other libraries. Claude Code (tmux) uses a split-pane icon. A legacy manifest fixture (`id: claude-tmux`, `family: claude`) verified that switching builtin Claude off leaves Claude Code (tmux) on, and switching the library off leaves builtin Claude unchanged. Full-window light and dark screenshots at the available desktop viewport showed the distinct icons and independent switches; keyboard focus remains visible. Composer selection is wired through the same normalized provider list and was checked in source; this preview does not render the Composer. A 900 x 600 browser viewport and the native GeckIt Local window were unavailable for this follow-up review. Native runtime behavior remains unverified.
