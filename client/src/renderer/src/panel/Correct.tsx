import { useCallback, useEffect, useRef, useState } from 'react'

import type { CorrectAction, ModelsSaid, SessionProvider, Settings } from '../../../shared/api'
import { assistantFor, assistantsIn, modelName } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { Picker } from '../ui/Menu'
import type { Choice } from '../ui/Menu'

/**
 * One piece of text, put right in place.
 *
 * The result replaces what was typed and goes on the clipboard, because what
 * this is for is pasting it back where it came from. The text that was there
 * before is one press away until something else is typed.
 */

const KEY = window.geckit.platform === 'darwin' ? 'Cmd' : 'Ctrl'

const ACTIONS: readonly { action: CorrectAction; label: string; key: string }[] = [
  { action: 'grammar', label: 'Grammar', key: '1' },
  { action: 'improve', label: 'Improve', key: '2' },
  { action: 'translate', label: 'Translate', key: '3' },
  { action: 'explain', label: 'Explain', key: '4' },
  { action: 'custom', label: 'Custom', key: '0' },
]

export function Correct({
  settings,
  change,
}: {
  readonly settings: Settings
  readonly change: (change: Partial<Settings>) => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [before, setBefore] = useState<string | undefined>()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [asking, setAsking] = useState(false)
  const [custom, setCustom] = useState('')
  // What claude says it has. Asked when the menu is opened, because asking it means starting it.
  const [models, setModels] = useState<{ readonly provider: SessionProvider; readonly said: ModelsSaid }>()
  const field = useRef<HTMLTextAreaElement>(null)
  const instruction = useRef<HTMLInputElement>(null)

  const enabled = assistantsIn(settings)
  const provider = assistantFor({ ...settings, chatProvider: settings.correctProvider })
  const model = provider === 'codex' ? settings.correctCodexModel : settings.correctPlanModel
  const catalog = models?.provider === provider ? models.said : 'unasked'
  const assistant = provider === 'codex' ? 'Codex' : 'Claude Code'

  useEffect(() => field.current?.focus(), [])

  // What the shortcut picked up in whatever application was in front.
  useEffect(
    () =>
      window.geckit.panel.onText((said) => {
        if (said === '') return
        setText(said)
        setBefore(undefined)
        setTimeout(() => field.current?.focus(), 40)
      }),
    [],
  )

  useEffect(() => {
    if (!copied) return
    const soon = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(soon)
  }, [copied])

  const run = useCallback(
    async (action: CorrectAction, said?: string) => {
      const body = text.trim()
      if (body === '' || working) return
      setWorking(true)
      setError('')
      const answer = await window.geckit.correct({
        action,
        text,
        ...(said === undefined ? {} : { custom: said }),
        model,
        provider,
      })
      setWorking(false)
      if (!answer.ok || answer.text === undefined) {
        setError(answer.error ?? 'It did not answer')
        return
      }
      setBefore(text)
      setText(answer.text)
      void navigator.clipboard
        .writeText(answer.text)
        .then(() => setCopied(true))
        .catch(() => undefined)
    },
    [text, working, model, provider],
  )

  const revert = useCallback(() => {
    if (before === undefined) return
    setText(before)
    setBefore(undefined)
  }, [before])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || asking) return
      if (event.key === 'z' && before !== undefined) {
        event.preventDefault()
        revert()
        return
      }
      const found = ACTIONS.find((one) => one.key === event.key)
      if (found === undefined || text.trim() === '' || working) return
      event.preventDefault()
      if (found.action === 'custom') setAsking(true)
      else void run(found.action)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [run, revert, before, text, working, asking])

  const planChoices: readonly Choice[] = [
    { value: '', label: 'Default', says: provider === 'claude' ? 'Haiku' : 'As Codex is set up' },
    ...(Array.isArray(catalog)
      ? catalog.map((one) =>
          one.disabled === true
            ? { value: one.value, label: one.name, disabled: true, ...(one.says === undefined ? {} : { says: one.says }) }
            : { value: one.value, label: one.name, ...(one.id === undefined ? {} : { says: modelName(one.id) }) },
        )
      : [
          {
            value: '__asking',
            label: catalog === 'asking' ? `Asking ${assistant}...` : `${assistant} did not say which models it has`,
            disabled: true,
          },
        ]),
  ]

  // Asked at every opening: main keeps the answer, and asks Claude Code again once another version of it answers.
  const askModels = (): void => {
    if (!Array.isArray(catalog)) setModels({ provider, said: 'asking' })
    void window.geckit.chat.models(undefined, provider).then((said) => setModels({ provider, said: said ?? 'unsaid' })).catch(() => setModels({ provider, said: 'unsaid' }))
  }
  const named = (Array.isArray(catalog) ? catalog.find((one) => one.value === model)?.name : undefined) ?? (model === '' ? 'Default' : model)

  return (
    <div className="correct">
      <div className="correct-field">
        <textarea
          ref={field}
          value={text}
          disabled={working}
          placeholder={`Paste or type text here. Holding ${KEY}, press C then D to pick up what is selected anywhere.`}
          onChange={(event) => {
            setText(event.target.value)
            setBefore(undefined)
          }}
        />
        {before === undefined ? null : (
          <button
            type="button"
            className="icon-button correct-revert"
            onClick={revert}
            title={`Put back (${KEY}+Z)`}
            aria-label="Put the text back"
          >
            <Icon name="undo" />
          </button>
        )}
      </div>

      {working ? <div className="working" /> : null}
      {error === '' ? null : <div className="error">{error}</div>}

      <div className="actions">
        {ACTIONS.map((one) => (
          <button
            key={one.action}
            type="button"
            className="action"
            disabled={working || text.trim() === ''}
            title={`${KEY}+${one.key}`}
            onClick={() => (one.action === 'custom' ? setAsking(true) : void run(one.action))}
          >
            {one.label}
          </button>
        ))}
      </div>

      <div className="footer">
        {enabled.length < 2 ? <span>{assistant}</span> : <Picker label={assistant} choices={enabled.map((one) => ({ value: one, label: one === 'codex' ? 'Codex' : 'Claude Code' }))} chosen={provider} title="Assistant" disabled={working} onPick={(value) => change({ correctProvider: value as SessionProvider })} />}
        <Picker
          label={<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{named}</span>}
          choices={planChoices}
          chosen={model}
          title="Model"
          disabled={working}
          onOpen={askModels}
          onPick={(value) => {
            if (value === '__asking') return
            change(provider === 'codex' ? { correctCodexModel: value } : { correctPlanModel: value })
          }}
        />
      </div>

      {asking ? (
        <div className="dialog-scrim" onMouseDown={() => setAsking(false)}>
          <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Custom</h2>
            <p>Say what should be done with the text.</p>
            <input
              ref={instruction}
              type="text"
              value={custom}
              autoFocus
              placeholder="Rewrite this in a more casual tone"
              style={{ width: '100%' }}
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || custom.trim() === '') return
                event.preventDefault()
                setAsking(false)
                void run('custom', custom)
              }}
            />
            <div className="dialog-actions">
              <button type="button" className="quiet" onClick={() => setAsking(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={custom.trim() === ''}
                onClick={() => {
                  setAsking(false)
                  void run('custom', custom)
                }}
              >
                Do it
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {copied ? <div className="toast">Copied</div> : null}
    </div>
  )
}
