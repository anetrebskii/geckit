/**
 * Every glyph in the application, drawn on one 16x16 grid at one weight.
 *
 * Colour comes from the parent through `currentColor`, so an icon is never
 * given a fill of its own and never carries the accent by itself.
 */

const PATHS: Record<string, string> = {
  spellcheck: 'M2 12 6 4l4 8M3.4 9.4h5.2M10.5 10.5 12.5 12.5 15 8.5',
  mic: 'M8 2.5a2 2 0 0 1 2 2v3.5a2 2 0 0 1-4 0V4.5a2 2 0 0 1 2-2ZM4 8a4 4 0 0 0 8 0M8 12v2',
  chat: 'M13.5 9.5a1.5 1.5 0 0 1-1.5 1.5H6l-3 2.5V4a1.5 1.5 0 0 1 1.5-1.5H12A1.5 1.5 0 0 1 13.5 4Z',
  settings:
    'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM13.1 9.6a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 1 1-1.7 1.7l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.2a1.2 1.2 0 1 1-2.4 0v-.1a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 1 1-1.7-1.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6h-.2a1.2 1.2 0 1 1 0-2.4h.1a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1.2 1.2 0 1 1 1.7-1.7l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9v-.2a1.2 1.2 0 1 1 2.4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 1 1 1.7 1.7l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6h.2a1.2 1.2 0 1 1 0 2.4h-.1a1 1 0 0 0-.9.6Z',
  close: 'M4 4l8 8M12 4l-8 8',
  undo: 'M3 8h7a3 3 0 0 1 0 6H6M3 8l3-3M3 8l3 3',
  copy: 'M6 6h6.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM10.5 4.5V3.5a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1',
  check: 'M3 8.5 6.5 12 13 4.5',
  down: 'M4 6.5 8 10.5 12 6.5',
  right: 'M6.5 4 10.5 8 6.5 12',
  collapse: 'M5 2.5 8 5.5 11 2.5M5 13.5 8 10.5 11 13.5',
  expand: 'M5 5.5 8 2.5 11 5.5M5 10.5 8 13.5 11 10.5',
  plus: 'M8 3.5v9M3.5 8h9',
  minus: 'M3.5 8h9',
  folder: 'M2.5 12.5v-9h4l1.5 2h5.5v7a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5Z',
  file: 'M4 2.5h5l3 3v8a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5ZM9 2.5v3.5h3',
  search: 'M7.2 12.4a5.2 5.2 0 1 0 0-10.4 5.2 5.2 0 0 0 0 10.4ZM11 11l3 3',
  stop: 'M5 5h6v6H5z',
  send: 'M8 13V3.5M8 3.5 4 7.5M8 3.5l4 4',
  trash: 'M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9',
  terminal: 'M3 4.5 6.5 8 3 11.5M8 12h5',
  more: 'M4 8h.01M8 8h.01M12 8h.01',
  sort: 'M3 4.5h10M3 8h7M3 11.5h4',
  warning: 'M8 2.8 14.2 13.2H1.8ZM8 6.5v3M8 11.3h.01',
  link: 'M6.8 9.2 9.2 6.8M6 5.2 7.4 3.8a2.4 2.4 0 0 1 3.4 3.4L9.4 8.6M10 10.8 8.6 12.2a2.4 2.4 0 0 1-3.4-3.4L6.6 7.4',
  pencil: 'M11.2 2.8 13.2 4.8 5.5 12.5 2.8 13.2 3.5 10.5ZM10 4l2 2',
  spinner: 'M8 2.5a5.5 5.5 0 1 0 5.5 5.5',
  thought: 'M5 5.5h6M5 8h6M5 10.5h3.5',
  clock: 'M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM8 5v3.2l2.2 1.4',
  refresh: 'M13 8a5 5 0 1 1-1.6-3.7M13.3 2.5v2.8h-2.8',
  branch: 'M5 5v6M5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 14a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM11 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM11 6c0 3.5-6 2-6 5',
  ahead: 'M8 12.5v-9M4.5 7 8 3.5 11.5 7',
  behind: 'M8 3.5v9M4.5 9 8 12.5 11.5 9',
  keyboard:
    'M3 4h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM4.8 6.5h.01M6.9 6.5h.01M9.1 6.5h.01M11.2 6.5h.01M5.5 9.5h5',
}

const FILLED = new Set(['stop'])

export function Icon({
  name,
  size = 14,
  className,
}: {
  readonly name: keyof typeof PATHS | string
  readonly size?: number
  readonly className?: string
}): React.JSX.Element | null {
  const path = PATHS[name]
  if (path === undefined) return null
  const filled = FILLED.has(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.45}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...(className === undefined ? {} : { className })}
    >
      <path d={path} />
    </svg>
  )
}
