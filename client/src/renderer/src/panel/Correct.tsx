import { useCallback, useEffect, useRef, useState } from 'react'

import type { CorrectAction, CorrectEngine, ModelsSaid, Settings } from '../../../shared/api'
import { modelName } from '../../../shared/api'
import { defaultModelFor, modelsFor } from '../../../shared/models'
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

const ENGINES: readonly Choice[] = [
  { value: 'plan', label: 'Claude plan', says: 'no key' },
  { value: 'key', label: 'API key', says: 'faster' },
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
  const [models, setModels] = useState<ModelsSaid>('unasked')
  const field = useRef<HTMLTextAreaElement>(null)
  const instruction = useRef<HTMLInputElement>(null)

  const engine = settings.correctEngine
  const model = engine === 'plan' ? settings.correctPlanModel : settings.correctKeyModel

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
        engine,
        action,
        text,
        ...(said === undefined ? {} : { custom: said }),
        model,
        provider: settings.provider,
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
    [text, working, engine, model, settings.provider],
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
    { value: '', label: 'Default', says: 'as claude is set up' },
    ...(Array.isArray(models)
      ? models.map((one) => ({
          value: one.value,
          label: one.name,
          ...(one.id === undefined ? {} : { says: modelName(one.id) }),
        }))
      : [
          {
            value: '__asking',
            label: models === 'asking' ? 'Asking claude...' : 'claude did not say which models it has',
          },
        ]),
  ]

  const askModels = (): void => {
    if (models !== 'unasked' && models !== 'unsaid') return
    setModels('asking')
    void window.geckit.chat.models().then((said) => setModels(said ?? 'unsaid'))
  }
  const keyChoices: readonly Choice[] = modelsFor(settings.provider).map((one) => ({ value: one, label: one }))

  const named =
    engine === 'plan'
      ? ((Array.isArray(models) ? models.find((one) => one.value === model)?.name : undefined) ??
        (model === '' ? 'Default' : model))
      : model || defaultModelFor(settings.provider)

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
        <Picker
          label={engine === 'plan' ? 'Claude plan' : 'API key'}
          choices={ENGINES}
          chosen={engine}
          title="Answered by"
          onPick={(value) => change({ correctEngine: value as CorrectEngine })}
        />
        <Picker
          label={<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{named}</span>}
          choices={engine === 'plan' ? planChoices : keyChoices}
          chosen={model}
          title="Model"
          {...(engine === 'plan' ? { onOpen: askModels } : {})}
          onPick={(value) => {
            if (value === '__asking') return
            change(engine === 'plan' ? { correctPlanModel: value } : { correctKeyModel: value })
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
