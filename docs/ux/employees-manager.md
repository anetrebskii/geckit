---
type: spec
status: draft
owner: Alex
created: 2026-11-01
---

# UX: Manager в Team

Продолжение [employees-team.md](employees-team.md). Английские строки - текст интерфейса.

## 1. Зачем

Manager жил отдельным разделом Settings, а сотрудники - в Team. Человек, который строит команду, не видит, что у неё уже есть руководитель, и не находит, где его включить: Settings > Manager не связан с теми, кому Manager раздаёт работу.

### Путь до результата

- **Вход:** Team, первая строка списка - Manager, всегда, над сотрудниками. Также "Manager settings" из строки состояния внизу Chat и "Set up Manager" открывают Team на странице Manager.
- **Страница Manager:** портрет (можно выбрать, как у сотрудника), имя "Manager", строка "Runs GeckIt for you from Telegram", пометка состояния. Раздел "What it does" - три предложения. Раздел "Instructions" - правила человека для Manager: какую модель брать и когда, кому что отдавать, как отчитываться. Ниже - те же четыре шага настройки, что были в Settings: ассистент, как начинается работа, Telegram, включение.
- **Готово:** то же, что раньше: Manager включён и Telegram связан.

Отдельный раздел Settings > Manager убирается: одно место, а не два.

## 2. Что добавляется

| Поверхность | Что появляется |
| --- | --- |
| Team, список | Строка Manager первой: портрет, "Manager", состояние; без счётчика задач |
| Страница Manager | Портрет с выбором, "What it does", "Instructions" с Edit, шаги настройки, Telegram, источники |
| `GECKIT.md` (Claude Code и Codex) | Раздел "Manager instructions" с текстом человека, только пока он не пуст |
| `geckit employees manager` | Показать и изменить инструкции и портрет из терминала или из разговора |
| Settings | Раздела Manager больше нет |
| Строка состояния Chat | "Manager settings" открывает Team > Manager |
| Телефон, Settings > Team | Строка Manager первой; страница: портрет с выбором, "What it does", инструкции только для чтения, состояние, "Set up and change Manager on your computer." |

## 3. Состояния

| Состояние | Подпись в списке | Что делать |
| --- | --- | --- |
| Не настроен (никогда не включали) | "Not set up" | Открыть и пройти шаги |
| Выключен, история есть | "Off" | Включить на шаге 4 |
| Включён, ждёт | "On" | Ничего |
| Работает | "Working" и точка "работает" | Ничего |
| Пауза | "Paused" | Resume |
| Нужны руки (blocked) | "Needs attention" | Открыть, Try again |

## 4. Переходы

| Из | Событие | В | Что видит |
| --- | --- | --- | --- |
| Team | Нажал Manager | Страница Manager | Шаги настройки |
| Страница | Нажал портрет | Сетка портретов | 12 портретов |
| Сетка | Выбрал портрет | Страница | Новый портрет сразу, сохранён без Save |
| Страница | Edit в Instructions | Редактор | Поле с текущим текстом, фокус в нём |
| Редактор | Save или Cmd+Enter | Страница | Новый текст; он записан в GECKIT.md и в инструкции сессии Manager, действует со следующего сообщения |
| Редактор | Cancel или Esc без изменений | Страница | Прежний текст |
| Редактор | Ошибка сохранения | Редактор | Текст ошибки, кнопка Retry |
| Строка состояния | Manager settings | Team > Manager | Страница Manager |
| Страница | Esc / Back | Задачи | Доска |

## 5. Что молчит

Портрет Manager пока нигде, кроме Team, не показывается: в Telegram и на доске его нет. Выбор всё равно даётся, чтобы он выглядел членом команды.

## 6. Формулировки

- Роль: "Runs GeckIt for you from Telegram"
- What it does: "You write to it in Telegram. It starts conversations here, follows them and brings back the results. It never works itself; employees and their shortcuts do the work."
- Телефон: "Set up and change Manager on your computer."
- Instructions, подпись: "Your rules for Manager, such as which model to use and when. Kept in GECKIT.md."
- Instructions, пусто: "No instructions"
- Подсказка в поле: "For example: use Opus for code changes, Sonnet for writing and research, Haiku for quick checks."

## 7. Чего намеренно нет

- Archive, Edit имени и роли, About (вместо About - Instructions): Manager постоянный, его правила - это его инструкции, а не текст человека.
- Назначать Manager задачу: он раздаёт работу, а не делает её.
- Портрет в настройке Manager (`ManagerConfig`): смена конфигурации перезапускает сессию, портрет хранится в Settings.
