import { describe, expect, it } from 'vitest'

import { NO_CRASHES, answered, capture, describeError, questionDue, rebuild } from '../src/shared/reporting'
import type { CrashRecord } from '../src/shared/reporting'

import { redact, redactDeep } from '../src/shared/reporting'

const APP_ROOTS = { app: ['/Applications/GeckIt.app/Contents/Resources/app.asar'] }

describe('redact', () => {
  it('takes the path out of a filesystem error', () => {
    const said = redact(
      "ENOENT: no such file or directory, open '/Users/alex/Projects/acme-docs/docs/pricing.md'",
    )
    expect(said).toBe("ENOENT: no such file or directory, open '<path>'")
    expect(said).not.toContain('acme-docs')
    expect(said).not.toContain('pricing')
    expect(said).not.toContain('alex')
  })

  it("keeps the application's own frames readable", () => {
    expect(redact('/Applications/GeckIt.app/Contents/Resources/app.asar/out/main/index.js', APP_ROOTS))
      .toBe('<app>/out/main/index.js')
  })

  it("keeps the crash reporter's name for the same directory readable", () => {
    // `@sentry/electron` rewrites the application's own files to `app:///...`
    // before they reach the redactor. The path rule used to take the filename
    // with it and leave `app://<path>`, which is a frame no source map can be
    // matched against - and the maps are uploaded on every release for exactly
    // this.
    expect(redact('at publish (app:///renderer/assets/index-a1b2c3.js:9:42)'))
      .toBe('at publish (<app>/renderer/assets/index-a1b2c3.js:9:42)')
  })

  it("reads the product's own release as an address, which is why it is put back", () => {
    // Pinned rather than fixed here: loosening the address rule enough to spare
    // `notula@1.15.0` would spare somebody@their-employer.com too. `beforeSend`
    // restores the release after redacting instead.
    expect(redact('notula@1.15.0')).toBe('<address>')
  })

  it('takes a Windows path', () => {
    expect(redact(String.raw`cannot open C:\Users\alex\work\handbook\readme.md`))
      .toBe('cannot open <path>')
  })

  it('takes an scp-style git remote', () => {
    expect(redact('fatal: could not read from git@github.com:acme/private-docs.git'))
      .toBe('fatal: could not read from <remote>')
  })

  it('keeps the host of a URL and drops what names the repository', () => {
    // The endpoint that failed is worth knowing. Which repository it was about
    // is the part that may not leave, and on GitHub that is the path.
    expect(redact('GET https://api.github.com/repos/acme/private-docs/collaborators failed'))
      .toBe('GET https://api.github.com/<path> failed')
  })

  it('drops a URL carrying credentials whoever the host is', () => {
    expect(redact('https://alex:ghp_secret@github.com/acme/private-docs.git')).toBe('<url>')
  })

  it("names the product's own site in full", () => {
    expect(redact('schema at https://api.anthropic.com/schema/v1/workspace.json'))
      .toBe('schema at https://api.anthropic.com/schema/v1/workspace.json')
  })

  it('takes an email address', () => {
    expect(redact('author maya@acme.example wrote it')).toBe('author <address> wrote it')
  })

  it('leaves a bare number alone next to a kept URL', () => {
    // The marker standing in for a preserved URL used to be a digit between
    // spaces, which this sentence also contains.
    expect(redact('https://api.anthropic.com/schema failed after 3 retries'))
      .toBe('https://api.anthropic.com/schema failed after 3 retries')
  })

  it('leaves an ordinary message alone', () => {
    expect(redact('Cannot read properties of undefined (reading "doc")'))
      .toBe('Cannot read properties of undefined (reading "doc")')
  })
})

describe('redactDeep', () => {
  it('reaches a message nested in a report', () => {
    const event = {
      exception: {
        values: [{ type: 'Error', value: "open '/Users/alex/Projects/acme-docs/spec.md'" }],
      },
      breadcrumbs: [{ message: 'fetch https://api.github.com/repos/acme/private-docs' }],
    }

    const clean = redactDeep(event)
    expect(clean.exception.values[0]!.value).toBe("open '<path>'")
    expect(clean.breadcrumbs[0]!.message).toBe('fetch https://api.github.com/<path>')
    expect(JSON.stringify(clean)).not.toContain('acme-docs')
    expect(JSON.stringify(clean)).not.toContain('private-docs')
  })

  it('keeps the stack frames of a real Sentry event', () => {
    // A frame sits seven levels down. A depth cap set near that deletes every
    // frame and turns a crash report into a crash notification.
    const event = {
      exception: {
        values: [{
          type: 'Error',
          value: "ENOENT open '/Users/alex/Projects/acme/spec.md'",
          stacktrace: {
            frames: [
              { filename: '/Users/alex/app/out/main/index.js', lineno: 42, function: 'publish' },
            ],
          },
        }],
      },
    }

    const clean = redactDeep(event)
    const frame = clean.exception.values[0]!.stacktrace.frames[0]!
    expect(frame.lineno).toBe(42)
    expect(frame.function).toBe('publish')
    expect(frame.filename).toBe('<path>')
    expect(clean.exception.values[0]!.value).toBe("ENOENT open '<path>'")
  })

  it('keeps a value mentioned twice, which is not a cycle', () => {
    const shared = { note: 'kept' }
    const clean = redactDeep({ a: shared, b: shared })
    expect(clean.a).toEqual({ note: 'kept' })
    expect(clean.b).toEqual({ note: 'kept' })
  })

  it('survives a cycle', () => {
    const looped: Record<string, unknown> = { name: 'top' }
    looped['self'] = looped
    const clean = redactDeep(looped)
    expect(clean['name']).toBe('top')
    expect(clean['self']).toBeUndefined()
  })

  it('gives up rather than descending forever', () => {
    const deep: Record<string, unknown> = {}
    let at = deep
    for (let i = 0; i < 20; i += 1) {
      const next: Record<string, unknown> = {}
      at['next'] = next
      at = next
    }
    expect(() => redactDeep(deep)).not.toThrow()
  })

  it('passes numbers, booleans and null through', () => {
    expect(redactDeep({ a: 1, b: true, c: null })).toEqual({ a: 1, b: true, c: null })
  })
})

/**
 * Every one of these was read off the `notula-desktop` issue feed, where a
 * document title and a document's own frontmatter had been sitting for a month.
 * The path rule stops at the first space, and a document is called "Basic
 * company information.md" rather than "notes.md".
 */
describe('a document name with a space in it', () => {
  it('does not survive the space in a rename', () => {
    const said = redact(
      "rename: Error: EINVAL: invalid argument, rename '/Users/alex/Docs/Nota antiga.md' -> '/Users/alex/Docs/Nota - Administração Empresarial: Funções e Responsabilidades.md'",
    )
    expect(said).not.toContain('Administração')
    expect(said).not.toContain('antiga')
    expect(said).toBe(
      "rename: Error: EINVAL: invalid argument, rename '<path>' -> '<path>'",
    )
  })

  it('does not survive when the name is the document text', () => {
    const said = redact(
      "EPERM: operation not permitted, rename '/Users/alex/w/a.md' -> '/Users/alex/w/type: note tags: - Básico created: 2026-09-10 --- # Informações básicas da empresa.md'",
    )
    expect(said).not.toContain('Informações')
    expect(said).not.toContain('Básico')
  })

  it('leaves a quoted word that is not a path alone', () => {
    expect(redact("Error invoking remote method 'rename': failed")).toBe(
      "Error invoking remote method 'rename': failed",
    )
  })

  it('keeps the sentence after a path that is not quoted', () => {
    expect(redact('failed at /Users/alex/docs/x.md after 3 tries')).toBe('failed at <path> after 3 tries')
  })

  it('takes a Windows path in quotes with its spaces', () => {
    const said = redact(String.raw`EPERM: rename 'C:\Users\alex\My Documents\Q3 plan.md'`)
    expect(said).not.toContain('Q3 plan')
    expect(said).not.toContain('My Documents')
  })
})


const NOW = 1_700_000_000_000
const ROOTS = { app: ['/Applications/GeckIt.app/Contents/Resources/app'] }

function error(message: string, frame = 'at watch (/Applications/GeckIt.app/Contents/Resources/app/main/watcher.js:88:21)'): Error {
  const made = new Error(message)
  made.stack = `Error: ${message}\n    ${frame}`
  return made
}

describe('what is held', () => {
  it('keeps at most three, most recent', () => {
    let record: CrashRecord = NO_CRASHES
    for (let i = 0; i < 100; i += 1) {
      record = capture(record, error(`failure ${String(i)}`), NOW + i, ROOTS)
    }
    expect(record.held).toHaveLength(3)
    expect(record.held[2]?.message).toContain('failure 99')
  })

  it('redacts at the point of capture, so what is on disk is what would be sent', () => {
    const nasty = error(
      'ENOENT /Users/alex/Projects/acme-billing/notes.md via git@github.com:acme/billing.git for alex@acme.com',
    )
    const record = capture(NO_CRASHES, nasty, NOW, ROOTS)
    const held = JSON.stringify(record.held)
    expect(held).not.toContain('acme-billing')
    expect(held).not.toContain('acme/billing')
    expect(held).not.toContain('alex@acme.com')
    expect(held).not.toContain('/Users/alex')
    // The application's own frames stay readable - that is the useful half.
    expect(record.held[0]?.stack).toContain('<app>/main/watcher.js')
  })

  it('counts distinct errors, and the same error a hundred times as one', () => {
    let record = capture(NO_CRASHES, error('one'), NOW, ROOTS)
    for (let i = 0; i < 100; i += 1) record = capture(record, error('one'), NOW + i, ROOTS)
    expect(record.fresh).toHaveLength(1)
    record = capture(record, error('two'), NOW, ROOTS)
    expect(record.fresh).toHaveLength(2)
  })
})

describe('when the question is put', () => {
  it('asks only with something to show, and never while the switch is on', () => {
    expect(questionDue(NO_CRASHES, false)).toBe(false)
    const one = capture(NO_CRASHES, error('one'), NOW, ROOTS)
    expect(questionDue(one, false)).toBe(true)
    expect(questionDue(one, true)).toBe(false)
  })

  it('asks once more after two further distinct errors, and never a third time', () => {
    const first = capture(NO_CRASHES, error('one'), NOW, ROOTS)
    const putOff = answered(first, 'later')
    expect(questionDue(putOff, false)).toBe(false)

    // The same error again is not an argument for asking again.
    const sameTwice = capture(capture(putOff, error('one'), NOW, ROOTS), error('one'), NOW, ROOTS)
    expect(questionDue(sameTwice, false)).toBe(false)

    const twoMore = capture(capture(putOff, error('two'), NOW, ROOTS), error('three'), NOW, ROOTS)
    expect(questionDue(twoMore, false)).toBe(true)

    // A simulated year of errors after the second "not now": silence.
    let after = answered(twoMore, 'later')
    for (let i = 0; i < 365; i += 1) {
      after = capture(after, error(`day ${String(i)}`), NOW + i, ROOTS)
      expect(questionDue(after, false)).toBe(false)
    }
    expect(after.asked).toBe(2)
  })

  it('treats Never as an answer: everything held is deleted and it stays quiet', () => {
    const some = capture(capture(NO_CRASHES, error('one'), NOW, ROOTS), error('two'), NOW, ROOTS)
    const never = answered(some, 'never')
    expect(never.held).toHaveLength(0)
    expect(questionDue(capture(never, error('three'), NOW, ROOTS), false)).toBe(false)
  })

  it('clears what was held once Send has transmitted it', () => {
    const some = capture(NO_CRASHES, error('one'), NOW, ROOTS)
    expect(answered(some, 'send').held).toHaveLength(0)
  })
})

describe('describing what was thrown', () => {
  it('keeps the frames and drops the repeated message line', () => {
    const described = describeError(error('went wrong'))
    expect(described.message).toBe('Error: went wrong')
    expect(described.stack).not.toContain('went wrong')
    expect(described.stack).toContain('at watch')
  })

  it('copes with things that are not errors', () => {
    expect(describeError('a string').message).toBe('a string')
    expect(describeError({ message: 'shaped' }).message).toBe('shaped')
    expect(describeError(undefined).message).toBe('undefined')
  })
})


describe('rebuild', () => {
  it('gives a held error back its name, its message and a stack Sentry can parse', () => {
    const held = capture(NO_CRASHES, new TypeError('cannot read x of undefined'), 1000, {}).held[0]!
    const back = rebuild(held)
    expect(back.name).toBe('TypeError')
    expect(back.message).toBe('cannot read x of undefined')
    // V8's shape: the message line, then the frames under it. Handing Sentry
    // the two halves joined without it produced issues titled
    // `Error: TypeError: ...` and grouped by their whole text.
    expect(back.stack?.split('\n')[0]).toBe('TypeError: cannot read x of undefined')
    expect(back.stack).toContain('at ')
  })

  it('holds an error that arrived with no frames at all', () => {
    // What a failed call to the main process looks like: the stack does not
    // survive the trip into the window, so only the line is left.
    const held = capture(NO_CRASHES, { message: 'An object could not be cloned.' }, 1000, {}).held[0]!
    const back = rebuild(held)
    expect(back.name).toBe('Error')
    expect(back.message).toBe('An object could not be cloned.')
  })
})
