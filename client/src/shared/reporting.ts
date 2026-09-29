/**
 * What an error report may say, and what is held until somebody says it may be sent: taken from Notula's
 * `@notula/reporting`, shared by the Mac and the phone so the two cannot drift. Pure, with no `node:` import.
 */

/** Install directories, longest first, replaced before anything else. */
export interface Roots {
  /** Where the packaged application lives; its own frames stay readable. */
  readonly app?: readonly string[]
}

/**
 * Hosts a report may name in full.
 *
 * Everything else keeps its scheme and host and loses the rest: the path of a
 * git remote is the repository's name, and a query string is where a token
 * would be if one ever leaked into a URL.
 *
 * GitHub is deliberately not on this list, obvious though it looks. Its paths carry
 * the owner and the repository name exactly as a remote does.
 * Knowing a request to `api.github.com` failed is the useful half; knowing
 * which repository it was about is the half that cannot leave.
 */
const NAMEABLE = new Set(['api.anthropic.com'])

/** `git@github.com:owner/repo.git`. Read before the address rule, which would
 *  otherwise take the host half for a person. */
const SCP_REMOTE = /\b[\w.-]+@[\w.-]+\.[a-z]{2,}:[\w./~-]+/gi
const URL = /\bhttps?:\/\/[^\s"'<>)\]]+/gi
const ADDRESS = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi
const WINDOWS_PATH = /(?:\\\\\?\\)?\b[A-Za-z]:\\[^\s"'<>)\]]*/g
/**
 * A path in quotes, taken whole, spaces and all.
 *
 * The rules below stop at the first space, because a path that ran on through
 * one would swallow the sentence after it - "failed at /a/b after 3 tries"
 * would lose the retry count. That is right for a path mentioned in prose and
 * catastrophic for the one place paths actually arrive: `EPERM: operation not
 * permitted, rename '/Users/…/Basic company information.md'`, where everything
 * after the first space is the document's name, which is the one thing this
 * file exists to keep in. It reached Sentry that way for a month.
 *
 * Inside quotes there is no sentence to swallow - the closing quote is where
 * the name ends - and every `fs` error Node raises quotes its paths. A quoted
 * run that does not begin like a path is left to the rules below, so
 * `'rename'` in `Error invoking remote method 'rename'` is untouched.
 */
const QUOTED_PATH = /(['"`])((?:\/|~\/|[A-Za-z]:\\|\\\\)[^'"`\n]*)\1/g
/**
 * Two or more segments from a root. The lookbehind is what keeps `<app>/main`
 * whole: by the time this runs the application's own directory is already a
 * token, and only the paths nobody replaced are left to take.
 */
const POSIX_PATH = /(?<![\w>~])(?:\/[\w.@+-]+){2,}\/?/g

export function redact(value: string, roots: Roots = {}): string {
  let text = value

  // Longest first, so a resources directory inside the app directory does not
  // leave half of itself behind.
  for (const root of [...(roots.app ?? [])].sort((a, b) => b.length - a.length)) {
    if (root.length > 0) text = text.split(root).join('<app>')
  }

  // The same directory under the name the crash reporter gives it. Sentry
  // rewrites the application's own files to `app:///…` before they reach here,
  // and that is this bundle rather than anybody's disk - exactly what `<app>`
  // already means. Left alone it is a run of slash-separated segments, and the
  // path rule below took every renderer frame's filename with it, which is a
  // stack trace that no source map can be matched against.
  text = text.replace(/\bapp:\/\/\/?/g, '<app>/')

  // A URL that survives in full is still a run of slash-separated segments, and
  // the path rule below would take it apart again. Anything deliberately kept
  // is set aside here and put back at the end, so the two rules cannot argue.
  const kept: string[] = []
  text = text.replace(URL, (match) => {
    const decided = keepHostOnly(match)
    if (!decided.startsWith('https://') && !decided.startsWith('http://')) return decided
    kept.push(decided)
    // A NUL either side: a marker made of spaces and digits would be
    // indistinguishable from "failed after 3 retries" on the way back.
    return `\u0000${String(kept.length - 1)}\u0000`
  })

  text = text.replace(QUOTED_PATH, (_, quote: string) => `${quote}<path>${quote}`)
  text = text.replace(SCP_REMOTE, '<remote>')
  text = text.replace(ADDRESS, '<address>')
  text = text.replace(WINDOWS_PATH, '<path>')
  text = text.replace(POSIX_PATH, '<path>')

  // eslint-disable-next-line no-control-regex -- the NUL markers set above
  return text.replace(/\u0000(\d+)\u0000/g, (_, index: string) => kept[Number(index)] ?? '<url>')
}

function keepHostOnly(match: string): string {
  let url: globalThis.URL
  try {
    url = new globalThis.URL(match)
  } catch {
    return '<url>'
  }
  // Credentials in a URL are never worth keeping, whoever the host is.
  if (url.username.length > 0 || url.password.length > 0) return '<url>'
  if (!NAMEABLE.has(url.hostname)) return `${url.protocol}//${url.hostname}/<path>`
  return `${url.origin}${url.pathname}`
}

/**
 * A backstop against something pathological, and nothing more.
 *
 * It has to clear the deepest thing a real report contains by a wide margin. A
 * stack frame is already seven levels down - `exception.values[0]
 * .stacktrace.frames[0].filename` - and a cap set near that quietly deletes
 * every frame, which turns a crash report into a crash notification. Cycles are
 * caught by `seen` rather than by this number.
 */
const DEPTH = 20

/**
 * The same rule applied to everything reachable in a report.
 *
 * Recursive because a breadcrumb's data, an exception's message and a frame's
 * filename are all strings in different places, and a rule that has to be
 * remembered at each of them is a rule that will be forgotten at the next one.
 */
export function redactDeep<T>(value: T, roots: Roots = {}, depth = 0, open = new WeakSet<object>()): T {
  if (typeof value === 'string') return redact(value, roots) as T
  if (value === null || typeof value !== 'object') return value
  // `open` holds this value's own ancestors, not everything already seen: an
  // event that mentions the same object twice is ordinary, and dropping the
  // second mention would lose data that is not a cycle at all.
  if (depth >= DEPTH || open.has(value)) return undefined as T
  open.add(value)

  let out: unknown
  if (Array.isArray(value)) {
    out = value.map((item) => redactDeep(item, roots, depth + 1, open))
  } else {
    const object: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      object[key] = redactDeep(item, roots, depth + 1, open)
    }
    out = object
  }

  open.delete(value)
  return out as T
}

/**
 * The crash question's three answers. The card's close button is 'later':
 * a card dismissed is not a decision, and treating it as one is how consent
 * gets manufactured.
 */
export type CrashAnswer = 'send' | 'later' | 'never'

/**
 * What is held when GeckIt hits an error, and when the question may be asked.
 *
 * The application watches for its own errors, redacts them at the point of capture, and holds
 * them; this module is that record and its rules, pure so a test can run a
 * simulated year of errors against it without an Electron around it.
 */

/** One redacted error, identical in content to what would be transmitted. */
export interface CapturedError {
  readonly message: string
  readonly stack: string
  readonly at: number
}

export interface CrashRecord {
  /**
   * At most three, most recent last.
   *
   * Redacted before storing, not before sending: what is on disk is what
   * would be sent, so a held report is not a second, rawer copy of anything.
   */
  readonly held: readonly CapturedError[]
  /** How many times the question has been put and put off. */
  readonly asked: number
  /**
   * Signatures of distinct errors since the last "not now".
   *
   * Distinct means distinct: the same error a hundred times in a loop is one
   * entry here, not a hundred arguments for asking again.
   */
  readonly fresh: readonly string[]
  /** "Never" was the answer, which is an answer and is kept. */
  readonly never?: boolean
}

export const NO_CRASHES: CrashRecord = { held: [], asked: 0, fresh: [] }

/** The point is to have something to show, not to build a log. */
const HELD = 3

/**
 * Two asks in a lifetime, and the second only after this many further distinct
 * errors. That is the whole budget; anything more is nagging for permission,
 * which is the behaviour that makes people distrust the thing being asked
 * about.
 */
const ASKS = 2
const FURTHER = 2

/** An error as two strings, whatever was actually thrown. */
export function describeError(thrown: unknown): { message: string; stack: string } {
  if (thrown instanceof Error) {
    const message = `${thrown.name}: ${thrown.message}`
    const lines = (thrown.stack ?? '').split('\n')
    // V8 repeats the message as the stack's first line; the report prints the
    // message itself, so only the frames are kept.
    const frames = lines[0]?.includes(thrown.message) ?? false ? lines.slice(1) : lines
    return { message, stack: frames.join('\n').trimEnd() }
  }
  if (typeof thrown === 'object' && thrown !== null && 'message' in thrown) {
    const shaped = thrown as { message?: unknown; stack?: unknown }
    return {
      message: String(shaped.message ?? thrown),
      stack: typeof shaped.stack === 'string' ? shaped.stack : '',
    }
  }
  return { message: String(thrown), stack: '' }
}

/**
 * A held error, put back into the shape Sentry can read.
 *
 * This was a `captureMessage` of the two halves joined by a newline, which
 * cost both of them: a message event carries no exception, so the frames were
 * printed as a string nobody could click and the issue was grouped by its
 * whole text rather than by where it broke. And `describeError` writes the
 * name into the message - the line a person reads in the report sheet - so
 * handing the joined string back produced titles reading `Error: Error: ...`.
 *
 * Splitting the name off again and rebuilding the V8 stack shape gives the
 * SDK's own parser what it expects, and the issue is titled and grouped the
 * way the same error would have been had consent existed when it was thrown.
 */
export function rebuild(error: CapturedError): Error {
  const split = /^([A-Za-z]*Error): ([\s\S]*)$/.exec(error.message)
  const rebuilt = new Error(split?.[2] ?? error.message)
  rebuilt.name = split?.[1] ?? 'Error'
  // V8 prints the message line first and the frames under it; `describeError`
  // keeps only the frames, because the sheet prints the message itself.
  rebuilt.stack =
    error.stack.length > 0 ? `${error.message}\n${error.stack}` : error.message
  return rebuilt
}

/** What makes two errors the same error: the first line of each half. */
function signatureOf(error: CapturedError): string {
  const frame = error.stack.split('\n').find((line) => line.trim().length > 0) ?? ''
  return `${error.message.split('\n')[0] ?? ''}|${frame.trim()}`
}

/**
 * One more error, redacted here - at the point of capture, before anything is
 * written to disk - so no caller can hold a rawer copy than the one shown.
 */
export function capture(record: CrashRecord, thrown: unknown, at: number, roots: Roots): CrashRecord {
  const described = describeError(thrown)
  const error: CapturedError = {
    message: redact(described.message, roots),
    stack: redact(described.stack, roots),
    at,
  }
  const signature = signatureOf(error)
  return {
    ...record,
    held: [...record.held, error].slice(-HELD),
    fresh: record.fresh.includes(signature) ? record.fresh : [...record.fresh, signature],
  }
}

/**
 * Whether the question may be put now.
 *
 * Never in the abstract: only with something to show. The switch already being
 * on is the question already answered, and `never` is too. The second ask
 * waits for two further distinct errors - which is itself the argument for
 * asking - and there is no third.
 */
export function questionDue(record: CrashRecord, reporting: boolean): boolean {
  if (reporting || record.never === true || record.held.length === 0) return false
  if (record.asked === 0) return true
  return record.asked < ASKS && record.fresh.length >= FURTHER
}

/**
 * The question, answered.
 *
 * "Later" starts the count of further distinct errors from nothing. "Never"
 * deletes everything held, so declining means there is nothing left to leak.
 * "Send" clears the held list because the caller has just transmitted it.
 */
export function answered(record: CrashRecord, answer: CrashAnswer): CrashRecord {
  if (answer === 'later') return { ...record, asked: record.asked + 1, fresh: [] }
  if (answer === 'never') return { ...record, held: [], fresh: [], never: true }
  return { ...record, held: [], fresh: [] }
}

/** What the card shows under "What would be sent": each held error as it would go. */
export function heldText(record: CrashRecord): string {
  return record.held.map((one) => `${new Date(one.at).toISOString()}\n${one.message}\n${one.stack}`.trim()).join('\n\n')
}
