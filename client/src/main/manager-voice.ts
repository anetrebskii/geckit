import type { ManagerDecisionOutcome, ManagerSpeech } from '../shared/manager'

export type Speech = ManagerSpeech

/** The language of a message, or none when it has no words to tell by (a command, a link, an emoji). */
export function heard(text: string): Speech | undefined {
  const words = text.replace(/\[[^\]\n]*\]|\{.*\}|https?:\/\/\S+|`[^`]*`|\/\w+/g, ' ')
  const cyrillic = words.match(/\p{Script=Cyrillic}/gu)?.length ?? 0
  const latin = words.match(/\p{Script=Latin}/gu)?.length ?? 0
  if (cyrillic + latin === 0) return undefined
  return cyrillic * 3 >= latin ? 'ru' : 'en'
}

const EN = {
  received: 'Got your message, starting in a moment.',
  working: 'Working on it.',
  asks: 'Waiting for your answer above.',
  idle: 'While I wait, here is what is going on:',
  stopped: (reason: string) => `I can't go on: ${reason}`,
  done: 'Done.',
  more: (count: number) => `and ${String(count)} more`,
  updated: (time: string) => `Updated ${time} UTC`,
  task: 'a task',
  worker: { working: 'working', asks: 'waiting for an answer in GeckIt', pending: 'message sent, not started yet', slot: 'waiting for a free slot', limit: "paused by the plan's usage limit", failed: 'stopped with an error', finished: 'finished', background: 'running in the background' },
  backgroundTask: 'a background task',
  taskAsks: 'waiting for an answer',
  taskRuns: 'running',
  moreBackground: (count: number) => `and ${String(count)} more in the background`,
  runs: { tests: 'running the tests', checks: 'checking the code', build: 'building the project', git: 'working with git', install: 'installing packages', web: 'fetching from the network', other: 'running a command' },
  doing: {
    output: "reading a background task's output",
    reading: (name: string) => `reading ${name}`,
    changing: (name: string) => `editing ${name}`,
    background: (runs: string) => `${runs} in the background`,
    watching: 'watching a background process',
    stopping: 'stopping a background task',
    searching: 'searching the code',
    opening: (where: string) => `opening ${where}`,
    web: (query: string) => `searching the web: ${query}`,
    handing: (what: string) => `handing off to a helper: ${what}`,
    skill: (skill: string) => `using the ${skill} skill`,
    using: (name: string) => `using ${name}`,
    starting: 'starting on the message',
    thinking: 'thinking it through',
  },
  stands: { off: "I'm turned off in GeckIt.", idle: 'Free. Send me a task.', working: 'Working.', paused: 'Paused. Send /resume to go on.', blocked: "I can't work right now." },
  workers: 'Workers',
  noWorkers: 'No workers are running.',
  workerState: { working: 'working', asks: 'needs an answer', unread: 'has news', idle: 'idle', limit: 'at its limit', failed: 'failed' },
  waiting: 'Waiting for your answer',
  queued: 'Messages in my queue',
  commands: `/status - what I and my workers are doing
/pause - stop starting new work
/resume - start work again
/settings - where my setup is changed
/links - what is shared and how to stop it`,
  help: (commands: string) => `**Talking to me in Telegram**

Send a task as a message. Reply to my question to answer it, or use the buttons on approvals that can be answered here.

${commands}

Typed forms and sign-in links open only in GeckIt itself.`,
  settings: `**Where my setup lives**

GeckIt, Settings, Manager changes my assistant, model, delegation and this Telegram connection.

Credentials stay on the computer. Talk to me here; approvals that can be answered here come with buttons.`,
  connected: (commands: string) => `**Connected.** Send me a task as a message, and reply to my questions to answer them.

${commands}

GeckIt must stay open on your computer.`,
  decisionLimit: "Too many questions are waiting here. Answer or discard the earlier ones, then ask me to show this one again.",
  shortened: 'My answer was cut short here. Ask me for a shorter summary or the missing part.',
  buttonGone: 'That button no longer works. Send /status or ask me for the current question.',
  closed: 'That request is already closed. /status shows what is open now.',
  off: 'I am turned off in GeckIt. Turn me on in Settings, Manager, then send it again.',
  discarded: "OK, I won't run that late message.",
  notSent: "I couldn't pass that answer on. Check /status or the approval in GeckIt.",
  notHere: "I can't take that answer here. Ask me to show the current question again.",
  badFile: "I can't open this photo or document: its details are broken or it is over 20 MiB. Send it as a smaller file.",
  badKind: 'I read text, photos and documents, not this kind of attachment. Send it as a file.',
  tooLong: 'That message is too long for me in Telegram. Send a shorter one.',
  unmatched: "I can't tell which of my messages this answers. Reply to one of my messages or write a new one.",
  fileAnswer: "A file can't answer a question or an approval. Use the buttons or reply with text, then send the file on its own.",
  answered: 'Got your answer, carrying on.',
  paused: "Paused. I won't start new work; what is already running goes on.",
  resumed: 'Back at it.',
  fileFailed: (detail: string) => detail,
  notAccepted: "I couldn't take this message. Check /status or GeckIt, Settings, Manager, then send it again.",
  tooManyLate: "Too many questions are waiting here. Answer them with Run now or Discard, then send this again. It hasn't been run.",
  late: '**This message reached me more than 10 minutes late.** Run it now?',
  run: 'Run now',
  discard: 'Discard',
  linkEnded: 'This link has already ended.',
  unshared: (title: string) => `Stopped sharing ${title}. The link no longer opens.`,
  nothingShared: "I'm not sharing anything. A link appears when my message names a localhost address or a file.",
  notAllowed: "Sorry, I can only take requests from people GeckIt lets me work for.",
  secret: "That message looks like it holds a token or key, so I didn't take it. Remove it and write again.",
  unavailable: (place: string, where: string) => `I can't answer in ${place} yet. Allow me in GeckIt, ${where}.`,
  failure: { paused: "I'm paused. Send /resume, then answer this approval.", native: "I didn't send that answer: a safety check blocked it. Look at the approval in GeckIt.", changed: 'That request has changed. /status shows what is open now.', choice: 'Pick one of the choices. Typed forms are answered in GeckIt itself.' },
  outcome: {
    'This recording could not be checked. Nothing was accepted. Check the source in Settings, then try again.': "I couldn't check this recording, so nothing was accepted. Check the source in Settings and try again.",
    'Task confirmation saved. Manager handoff is pending; it will not create duplicate work.': "Saved. I'll pick the task up shortly, without a duplicate.",
    'Task accepted by Manager.': "Got the task, I'm on it.",
    'Note saved.': 'Note saved.',
    'Recording skipped.': 'Skipped this recording.',
    'Answer sent.': 'Got your answer, carrying on.',
    'This request is no longer pending. Use /status to see current requests.': 'That request is already closed. /status shows what is open now.',
    'Review recorded. Delivery remains uncertain; nothing was resent. Other work can continue.': "Noted. Delivery isn't confirmed, so I didn't send it again. Other work goes on.",
  } satisfies Record<ManagerDecisionOutcome, string>,
}

const RU: typeof EN = {
  received: 'Сообщение получено, сейчас начну.',
  working: 'Работаю над этим.',
  asks: 'Жду ответа выше.',
  idle: 'Пока жду, вот что сейчас идёт:',
  stopped: (reason) => `Не могу продолжить: ${reason}`,
  done: 'Готово.',
  more: (count) => `и ещё ${String(count)}`,
  updated: (time) => `Обновлено в ${time} UTC`,
  task: 'задача',
  worker: { working: 'в работе', asks: 'ждёт ответа в GeckIt', pending: 'сообщение передано, ещё не начато', slot: 'ждёт свободного слота', limit: 'на паузе: лимит плана', failed: 'остановлено с ошибкой', finished: 'готово', background: 'работает в фоне' },
  backgroundTask: 'фоновая задача',
  taskAsks: 'ждёт ответа',
  taskRuns: 'идёт',
  moreBackground: (count) => `и ещё ${String(count)} в фоне`,
  runs: { tests: 'запускает тесты', checks: 'проверяет код', build: 'собирает проект', git: 'работает с git', install: 'ставит пакеты', web: 'обращается к сети', other: 'выполняет команду' },
  doing: {
    output: 'смотрит вывод фоновой задачи',
    reading: (name) => `читает ${name}`,
    changing: (name) => `правит ${name}`,
    background: (runs) => `${runs} в фоне`,
    watching: 'следит за фоновым процессом',
    stopping: 'останавливает фоновую задачу',
    searching: 'ищет по коду',
    opening: (where) => `открывает ${where}`,
    web: (query) => `ищет в интернете: ${query}`,
    handing: (what) => `поручает помощнику: ${what}`,
    skill: (skill) => `использует навык ${skill}`,
    using: (name) => `использует ${name}`,
    starting: 'берётся за сообщение',
    thinking: 'обдумывает задачу',
  },
  stands: { off: 'Меня отключили в GeckIt.', idle: 'Задач нет, можно давать новую.', working: 'Работаю.', paused: 'На паузе. Отправь /resume, чтобы продолжить.', blocked: 'Сейчас не могу работать.' },
  workers: 'Исполнители',
  noWorkers: 'Исполнители сейчас не работают.',
  workerState: { working: 'работает', asks: 'ждёт ответа', unread: 'есть новости', idle: 'без дела', limit: 'на лимите плана', failed: 'ошибка' },
  waiting: 'Ждут твоего ответа',
  queued: 'Сообщений в очереди',
  commands: `/status - что делаю я и исполнители
/pause - не начинать новую работу
/resume - снова начинать работу
/settings - где меня настраивать
/links - чем я делюсь и как это остановить`,
  help: (commands) => `**Как со мной работать в Telegram**

Пиши задачу обычным сообщением. Чтобы ответить на мой вопрос, ответь на него или нажми кнопку под запросом.

${commands}

Формы с полями и ссылки для входа открываются только в самом GeckIt.`,
  settings: `**Где меня настраивать**

В GeckIt: Settings, Manager. Там меняются ассистент, модель, делегирование и это подключение к Telegram.

Ключи остаются на компьютере. Пиши мне здесь; запросы, на которые можно ответить отсюда, приходят с кнопками.`,
  connected: (commands) => `**Подключено.** Пиши мне задачи обычными сообщениями, а на мои вопросы отвечай прямо на них.

${commands}

GeckIt должен оставаться открытым на компьютере.`,
  decisionLimit: 'Здесь накопилось слишком много вопросов. Ответь на прежние или отмени их, потом попроси меня показать этот ещё раз.',
  shortened: 'Здесь ответ пришлось обрезать. Попроси у меня краткую версию или недостающую часть.',
  buttonGone: 'Эта кнопка уже не действует. Отправь /status или спроси меня, какой вопрос сейчас открыт.',
  closed: 'Этот запрос уже закрыт. /status покажет, что сейчас открыто.',
  off: 'Меня отключили в GeckIt. Включи меня в Settings, Manager и отправь ещё раз.',
  discarded: 'Хорошо, это запоздавшее сообщение не выполняю.',
  notSent: 'Не получилось передать ответ. Проверь /status или запрос в GeckIt.',
  notHere: 'Здесь этот ответ принять не могу. Попроси меня показать текущий вопрос ещё раз.',
  badFile: 'Не могу открыть это фото или документ: данные о нём повреждены или он больше 20 МиБ. Пришли файл поменьше.',
  badKind: 'Читаю текст, фото и документы, а такое вложение не умею. Пришли его файлом.',
  tooLong: 'Это сообщение для меня в Telegram слишком длинное. Пришли покороче.',
  unmatched: 'Не понимаю, на какое моё сообщение этот ответ. Ответь на одно из моих сообщений или напиши заново.',
  fileAnswer: 'Файлом на вопрос или запрос не ответить. Нажми кнопку или ответь текстом, а файл пришли отдельным сообщением.',
  answered: 'Ответ получен, продолжаю.',
  paused: 'Пауза. Новую работу не начинаю, начатая продолжается.',
  resumed: 'Снова в работе.',
  fileFailed: () => 'Не получилось принять файл. Telegram отдаёт файлы до 20 МиБ: проверь размер и подключение и пришли ещё раз.',
  notAccepted: 'Не получилось принять это сообщение. Проверь /status или GeckIt: Settings, Manager, и отправь ещё раз.',
  tooManyLate: 'Здесь накопилось слишком много вопросов. Ответь на них кнопками "Выполнить" или "Отменить", потом пришли это снова. Пока оно не выполнено.',
  late: '**Это сообщение дошло до меня с опозданием больше 10 минут.** Выполнить сейчас?',
  run: 'Выполнить',
  discard: 'Отменить',
  linkEnded: 'Эта ссылка уже не действует.',
  unshared: (title) => `Больше не делюсь "${title}", ссылка не открывается.`,
  nothingShared: 'Сейчас я ничем не делюсь. Ссылка появляется, когда в моём сообщении есть адрес localhost или файл.',
  notAllowed: 'Извини, я принимаю запросы только от тех, для кого мне разрешено работать в GeckIt.',
  secret: 'Похоже, в сообщении есть токен или ключ, так что в работу его не беру. Убери его и напиши снова.',
  unavailable: (place, where) => `Пока не могу отвечать в ${place}. Разреши мне это в GeckIt: ${where}.`,
  failure: { paused: 'Я на паузе. Отправь /resume, потом ответь на этот запрос.', native: 'Ответ не отправлен: его остановила проверка безопасности. Посмотри запрос в GeckIt.', changed: 'Запрос изменился. /status покажет, что сейчас открыто.', choice: 'Выбери один из вариантов. Формы с полями заполняются только в самом GeckIt.' },
  outcome: {
    'This recording could not be checked. Nothing was accepted. Check the source in Settings, then try again.': 'Не получилось проверить эту запись, ничего не принято. Проверь источник в Settings и попробуй снова.',
    'Task confirmation saved. Manager handoff is pending; it will not create duplicate work.': 'Сохранено. Скоро возьмусь за задачу, дубликата не будет.',
    'Task accepted by Manager.': 'Задача у меня, берусь.',
    'Note saved.': 'Заметка сохранена.',
    'Recording skipped.': 'Эту запись пропускаю.',
    'Answer sent.': 'Ответ получен, продолжаю.',
    'This request is no longer pending. Use /status to see current requests.': 'Этот запрос уже закрыт. /status покажет, что сейчас открыто.',
    'Review recorded. Delivery remains uncertain; nothing was resent. Other work can continue.': 'Записано. Доставка не подтверждена, поэтому повторно не отправляю. Остальная работа идёт.',
  },
}

export const say = (speech: Speech | undefined): typeof EN => speech === 'ru' ? RU : EN

const KINDS: readonly (readonly [RegExp, keyof typeof EN.runs])[] = [
  [/\b(vitest|jest|pytest|mocha|playwright|go test|cargo test|(npm|yarn|pnpm)( run)? test)\b/, 'tests'],
  [/\b(tsc|typecheck|eslint|lint|prettier)\b/, 'checks'],
  [/\b(build|electron-builder|xcodebuild|gradlew|webpack)\b/, 'build'],
  [/(^|[;&|]\s*)(git|gh)\s/, 'git'],
  [/\b(npm|yarn|pnpm|pip3?|brew)\s+(install|i|add|ci)\b/, 'install'],
  [/\b(curl|wget)\b/, 'web'],
]

/** What a command does, in words, never the command itself. */
export function commandSaid(command: string, speech: Speech | undefined): string {
  const kind = KINDS.find(([pattern]) => pattern.test(command))?.[1] ?? 'other'
  return say(speech).runs[kind]
}

/** What a working conversation is doing, from the `Working - <doing>` line GeckIt keeps for it, in words a person says; nothing for a line it does not know. */
export function workerDoing(stands: string, speech: Speech | undefined): string | undefined {
  const doing = /^Working - (.+)$/.exec(stands.trim())?.[1]
  if (doing === undefined) return undefined
  const words = say(speech).doing
  const lower = doing.charAt(0).toLowerCase() + doing.slice(1)
  const match = (pattern: RegExp): string | undefined => pattern.exec(lower)?.at(-1)
  if (/^(reading|read) what a background task printed/.test(lower)) return words.output
  if (lower.toLowerCase() === 'sending to claude code') return words.starting
  if (lower.toLowerCase() === 'waiting for claude code') return words.thinking
  let found: string | undefined
  if ((found = match(/^(?:starting|started) in the background: (.+)$/)) !== undefined) return words.background(commandSaid(found, speech))
  if ((found = match(/^(?:running|ran) (.+)$/)) !== undefined) return commandSaid(found, speech)
  if (/^(starting to watch|watching in the background):/.test(lower)) return words.watching
  if (/^(stopping|stopped) a background task/.test(lower)) return words.stopping
  if (/^(searching for|searched the folder for|looking for|looked for) /.test(lower)) return words.searching
  if ((found = match(/^(?:searching the web for|searched the web for) (.+)$/)) !== undefined) return words.web(found)
  if ((found = match(/^(?:handing|handed) off(?: in the background)?: (.+)$/)) !== undefined) return words.handing(found)
  if ((found = match(/^(?:using|used) the (.+) skill$/)) !== undefined) return words.skill(found)
  if ((found = match(/^(?:reading|read) (.+)$/)) !== undefined) return words.reading(found)
  if ((found = match(/^(?:changing|changed) (.+)$/)) !== undefined) return words.changing(found)
  if ((found = match(/^(?:opening|opened) (.+)$/)) !== undefined) return words.opening(found)
  if ((found = match(/^(?:using|used) (.+)$/)) !== undefined) return words.using(found)
  return undefined
}
