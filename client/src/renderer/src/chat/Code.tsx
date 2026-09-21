import { useEffect, useRef, useState } from 'react'

import { Icon } from '../ui/Icon'

/** A copy button that says so for a moment once it has copied. */
export function CopyButton({
  className,
  title,
  copy,
}: {
  readonly className: string
  readonly title: string
  readonly copy: () => Promise<void> | void
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const back = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(back)
  }, [copied])

  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={copied ? 'Copied' : title}
      aria-label={title}
      onClick={() => void Promise.resolve(copy()).then(() => setCopied(true))}
    >
      <Icon name={copied ? 'check' : 'copy'} size={13} />
    </button>
  )
}

/** A block of code, or of what a command printed, with a button that copies it whole. */
export function Code({ detail = false, children }: { readonly detail?: boolean; readonly children?: React.ReactNode }): React.JSX.Element {
  const block = useRef<HTMLPreElement>(null)
  return (
    <div className={`code-block${detail ? ' detail-block' : ''}`}>
      <pre ref={block} {...(detail ? { className: 'detail' } : {})}>
        {children}
      </pre>
      <CopyButton
        className="copy-code"
        title="Copy"
        // Markdown ends a fenced block with a newline the code itself does not have.
        copy={() => navigator.clipboard.writeText((block.current?.textContent ?? '').replace(/\n$/, ''))}
      />
    </div>
  )
}
