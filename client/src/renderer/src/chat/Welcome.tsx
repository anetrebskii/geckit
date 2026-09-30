import { useCallback, useEffect, useState } from 'react'

import type { ClaudeAccount } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { PhoneAccess } from '../ui/SettingsDialog'
import { MOD } from '../ui/Shortcuts'
import { projectName } from './project'
import type { Chat } from './useChat'

/**
 * The sheet a first start opens over the board: what GeckIt is, what it needs,
 * and how the phone joins. What each page says and why is in docs/ux/welcome.md.
 */

const MAC = window.geckit.platform === 'darwin'
const WINDOWS = window.geckit.platform === 'win32'
const INSTALL = WINDOWS ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash'
const RECHECK = 5000
const PAGES = 5

type Found = 'checking' | 'missing' | 'out' | 'key' | 'unknown' | 'ready'

function found(account: ClaudeAccount | undefined): Found {
  if (account === undefined) return 'checking'
  if (!account.here) return 'missing'
  if (account.signedIn === undefined) return 'unknown'
  if (!account.signedIn) return 'out'
  return account.key === true ? 'key' : 'ready'
}

export function Welcome({ chat }: { readonly chat: Chat }): React.JSX.Element {
  const [page, setPage] = useState(0)
  const [account, setAccount] = useState<ClaudeAccount | undefined>()
  const done = useCallback(() => chat.change({ welcomed: true }), [chat])
  const state = found(account)

  const check = useCallback(() => {
    void window.geckit.chat.account().then(setAccount)
  }, [])

  useEffect(check, [check])

  useEffect(() => {
    if (page !== 1 || state === 'ready' || state === 'unknown') return
    const timer = setInterval(check, RECHECK)
    return () => clearInterval(timer)
  }, [page, state, check])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.stopPropagation()
      done()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [done])

  const project = chat.settings.projects[0]
  const unfinished =
    (page === 1 && state !== 'ready' && state !== 'unknown') ||
    (page === 2 && project === undefined)
  const last = page === PAGES - 1

  return (
    <div className="welcome" role="dialog" aria-label="Welcome to GeckIt">
      <div className="welcome-drag" />
      <button type="button" className="welcome-skip no-drag" onClick={done}>
        Skip
      </button>
      <div className="welcome-card" key={page}>
        {page === 0 ? <About /> : null}
        {page === 1 ? (
          <Claude
            account={account}
            state={state}
            onCheck={() => {
              setAccount(undefined)
              check()
            }}
          />
        ) : null}
        {page === 2 ? <Project project={project} onChoose={chat.addProject} /> : null}
        {page === 3 ? <Keys /> : null}
        {page === 4 ? <Phone chat={chat} /> : null}
      </div>
      <div className="welcome-foot">
        <div className="welcome-dots" role="tablist">
          {Array.from({ length: PAGES }, (_none, at) => (
            <button
              key={at}
              type="button"
              role="tab"
              className={at === page ? 'on' : ''}
              aria-selected={at === page}
              aria-label={`Page ${String(at + 1)}`}
              onClick={() => setPage(at)}
            />
          ))}
        </div>
        <span className="spacer" />
        {page > 0 ? (
          <button type="button" className="quiet" onClick={() => setPage(page - 1)}>
            Back
          </button>
        ) : null}
        <button type="button" className="primary" onClick={() => (last ? done() : setPage(page + 1))}>
          {last ? 'Start using GeckIt' : unfinished ? 'Continue without it' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

function About(): React.JSX.Element {
  return (
    <>
      <div className="welcome-art board-art" aria-hidden="true">
        {['In progress', 'In review', 'Done'].map((column) => (
          <div key={column} className="art-column">
            <span>{column}</span>
            <i />
            <i />
          </div>
        ))}
        <div className="art-card">
          <b />
          <i />
          <i />
        </div>
      </div>
      <h1>Welcome to GeckIt</h1>
      <p>
        Claude Code, on a board. Each conversation is a card that moves from In progress to In review to Done, and runs on
        your own Claude plan.
      </p>
      <ul className="welcome-list">
        <li>
          <Icon name="spellcheck" />
          <span>
            <b>Correct:</b> select text anywhere and press {MOD}+C+D to have it fixed.
          </span>
        </li>
        <li>
          <Icon name="mic" />
          <span>
            <b>Dictate:</b> press {MOD}+Alt+V, speak, and the words are pasted where you were typing.
          </span>
        </li>
      </ul>
    </>
  )
}

function Claude({
  account,
  state,
  onCheck,
}: {
  readonly account: ClaudeAccount | undefined
  readonly state: Found
  readonly onCheck: () => void
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const version = account?.program?.version
  const command = state === 'missing' ? INSTALL : state === 'out' || state === 'key' ? 'claude auth login' : 'claude auth status'
  const says =
    state === 'checking'
      ? 'Looking for Claude Code...'
      : state === 'missing'
        ? 'Claude Code is not on this computer. Run this in a terminal:'
        : state === 'out'
          ? `Claude Code${version === undefined ? '' : ` ${version}`} is here, and nobody is signed in. Run this in a terminal:`
          : state === 'key'
            ? 'Claude Code is signed in with an API key. Sign in with your plan instead:'
            : state === 'unknown'
              ? 'Claude Code is here. This version does not say who is signed in.'
              : `Ready: your Claude ${account?.plan === undefined ? '' : `${account.plan} `}plan${version === undefined ? '' : `, Claude Code ${version}`}.`
  const needed = state === 'missing' || state === 'out' || state === 'key'

  return (
    <>
      <div className="welcome-art terminal-art" aria-hidden="true">
        <div className="art-lights">
          <i />
          <i />
          <i />
        </div>
        <div className="art-line">
          <span className="art-prompt">$</span>
          <span className="art-typed" key={command} style={{ '--chars': command.length } as React.CSSProperties}>
            {command}
          </span>
        </div>
        {state === 'ready' ? <div className="art-answer">Signed in, {account?.plan ?? 'Claude'} plan</div> : null}
      </div>
      <h1>Claude Code</h1>
      <p>
        GeckIt drives the claude program on this computer and signs in with your Claude Pro or Max plan. It never uses an
        API key, so nothing is billed beyond the plan.
      </p>
      <div className={`welcome-status ${state}${state === 'checking' ? ' spinning' : ''}`} aria-live="polite">
        {state === 'checking' ? <Icon name="spinner" /> : state === 'ready' ? <Icon name="check" /> : null}
        <span>{says}</span>
      </div>
      {needed ? (
        <div className="welcome-command">
          <code>{command}</code>
          <button
            type="button"
            className="quiet"
            onClick={() => {
              window.geckit.copy(command, command)
              setCopied(true)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      ) : null}
      {state === 'ready' || state === 'checking' ? null : (
        <div>
          <button type="button" className="quiet" onClick={onCheck}>
            Check again
          </button>
        </div>
      )}
    </>
  )
}

function Project({ project, onChoose }: { readonly project: string | undefined; readonly onChoose: () => void }): React.JSX.Element {
  return (
    <>
      <div className="welcome-art folder-art" aria-hidden="true">
        <div className="art-list">
          <i />
          <i />
          <div className="art-slot" />
        </div>
        <div className="art-folder">
          <Icon name="folder" size={28} />
        </div>
      </div>
      <h1>A project</h1>
      <p>A project is a folder. Everything asked in it runs there, with Claude Code's access to its files.</p>
      {project === undefined ? null : (
        <div className="welcome-status ready">
          <Icon name="check" />
          <span>{projectName(project)}</span>
        </div>
      )}
      <div>
        <button type="button" className={project === undefined ? 'primary' : 'quiet'} onClick={onChoose}>
          {project === undefined ? 'Choose a folder' : 'Choose another'}
        </button>
      </div>
    </>
  )
}

function Keys(): React.JSX.Element {
  const [trusted, setTrusted] = useState(true)

  useEffect(() => {
    const look = (): void => void window.geckit.settings.accessibility().then(setTrusted)
    look()
    window.addEventListener('focus', look)
    return () => window.removeEventListener('focus', look)
  }, [])

  return (
    <>
      <div className="welcome-art keys-art" aria-hidden="true">
        <div className="art-keys art-correct">
          <kbd>{MOD}</kbd>
          <kbd>C</kbd>
          <kbd>D</kbd>
          <span>Correct</span>
        </div>
        <div className="art-keys art-dictate">
          <kbd>{MOD}</kbd>
          <kbd>Alt</kbd>
          <kbd>V</kbd>
          <span>Dictate</span>
        </div>
      </div>
      <h1>Correct and dictate</h1>
      <p>Both work in any app, from anywhere.</p>
      <p>
        Dictation runs on this computer with Whisper: nothing you say leaves it, and it needs no key. The first time you dictate, it
        downloads its model, about 570 MB, once. Correct needs nothing.
      </p>
      {MAC ? (
        trusted ? (
          <div className="welcome-status ready">
            <Icon name="check" />
            <span>Accessibility is on.</span>
          </div>
        ) : (
          <div className="welcome-status out">
            <span>To paste what you said, GeckIt needs Accessibility.</span>
            <button type="button" className="quiet" onClick={() => window.geckit.settings.openAccessibility()}>
              Open Accessibility settings
            </button>
          </div>
        )
      ) : null}
    </>
  )
}

function Phone({ chat }: { readonly chat: Chat }): React.JSX.Element {
  return (
    <>
      <div className="welcome-art phone-art" aria-hidden="true">
        <div className="art-code">
          {Array.from({ length: 25 }, (_none, at) => (
            <i key={at} className={[0, 1, 5, 6, 3, 4, 8, 9, 15, 16, 20, 21, 12, 13, 17, 23, 24].includes(at) ? 'on' : ''} />
          ))}
        </div>
        <div className="art-phone">
          <div className="art-scan" />
        </div>
      </div>
      <h1>Your phone</h1>
      <p>Follow your conversations from an iPhone.</p>
      <PhoneAccess on={chat.settings.phone} change={(phone) => chat.change({ phone })} />
    </>
  )
}
