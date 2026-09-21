import { useLayoutEffect, useRef } from 'react'

/** A name typed over the old one: Enter or clicking away keeps it, Esc puts the old one back. */
export function NameField({
  name,
  className,
  onDone,
}: {
  readonly name: string
  readonly className?: string
  readonly onDone: (name: string | undefined) => void
}): React.JSX.Element {
  const field = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useLayoutEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])

  const finish = (typed: string | undefined): void => {
    if (done.current) return
    done.current = true
    const kept = typed?.trim()
    onDone(kept === undefined || kept === '' || kept === name ? undefined : kept)
  }

  return (
    <input
      ref={field}
      type="text"
      className={className}
      defaultValue={name}
      aria-label="Name"
      spellCheck={false}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onBlur={(event) => finish(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        finish(event.key === 'Enter' ? event.currentTarget.value : undefined)
      }}
    />
  )
}
