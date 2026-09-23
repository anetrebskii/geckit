/**
 * Every glyph in the application, drawn on one 16x16 grid at one weight.
 *
 * Colour comes from the parent through `currentColor`, so an icon is never
 * given a fill of its own and never carries the accent by itself.
 */

const PATHS: Record<string, string> = {
  spellcheck: 'M2.5 12 5.5 4l3 8M3.6 9.3h3.8M9.5 10.6l1.6 1.7L14 8.3',
  mic: 'M8 2.5a2 2 0 0 1 2 2v3.5a2 2 0 0 1-4 0V4.5a2 2 0 0 1 2-2ZM4 8a4 4 0 0 0 8 0M8 12v2',
  chat: 'M13.5 9a2 2 0 0 1-2 2H6.2L3 13.5V4.5a2 2 0 0 1 2-2h6.5a2 2 0 0 1 2 2Z',
  settings: 'M6.82 3.76L7.03 2.18A5.9 5.9 0 0 1 8.97 2.18L9.18 3.76A4.4 4.4 0 0 1 10.17 4.17L11.43 3.2A5.9 5.9 0 0 1 12.8 4.57L11.83 5.83A4.4 4.4 0 0 1 12.24 6.82L13.82 7.03A5.9 5.9 0 0 1 13.82 8.97L12.24 9.18A4.4 4.4 0 0 1 11.83 10.17L12.8 11.43A5.9 5.9 0 0 1 11.43 12.8L10.17 11.83A4.4 4.4 0 0 1 9.18 12.24L8.97 13.82A5.9 5.9 0 0 1 7.03 13.82L6.82 12.24A4.4 4.4 0 0 1 5.83 11.83L4.57 12.8A5.9 5.9 0 0 1 3.2 11.43L4.17 10.17A4.4 4.4 0 0 1 3.76 9.18L2.18 8.97A5.9 5.9 0 0 1 2.18 7.03L3.76 6.82A4.4 4.4 0 0 1 4.17 5.83L3.2 4.57A5.9 5.9 0 0 1 4.57 3.2L5.83 4.17A4.4 4.4 0 0 1 6.82 3.76ZM8 9.9a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z',
  close: 'M4 4l8 8M12 4l-8 8',
  undo: 'M3 8h7a3 3 0 0 1 0 6H6M3 8l3-3M3 8l3 3',
  copy: 'M6 6h6.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM10.5 4.5V3.5a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1',
  check: 'M3 8.5 6.5 12 13 4.5',
  down: 'M4 6.5 8 10.5 12 6.5',
  right: 'M6.5 4 10.5 8 6.5 12',
  collapse: 'M5.5 2.5 8 5l2.5-2.5M5.5 13.5 8 11l2.5 2.5M3.5 8h9',
  expand: 'M5.5 5 8 2.5 10.5 5M5.5 11 8 13.5l2.5-2.5M3.5 8h9',
  plus: 'M8 3.5v9M3.5 8h9',
  minus: 'M3.5 8h9',
  folder: 'M2.5 4.5a1 1 0 0 1 1-1h2.8l1.5 1.7h4.7a1 1 0 0 1 1 1v6.3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z',
  file: 'M5 2.5h3.8L12 5.7v6.8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM8.5 2.5V6H12',
  search: 'M7 11.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5ZM10.1 10.1l3.15 3.15',
  stop: 'M6 4.5h4A1.5 1.5 0 0 1 11.5 6v4a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 10V6A1.5 1.5 0 0 1 6 4.5Z',
  send: 'M8 13V3.5M8 3.5 4 7.5M8 3.5l4 4',
  trash: 'M3 4.5h10M6.2 4.5V3.2a.7.7 0 0 1 .7-.7h2.2a.7.7 0 0 1 .7.7v1.3M4.6 4.5l.7 8.2a1 1 0 0 0 1 .9h3.4a1 1 0 0 0 1-.9l.7-8.2',
  terminal: 'M3 4.5 6.5 8 3 11.5M8 12h5',
  more: 'M3.5 8m-1.15 0a1.15 1.15 0 1 0 2.3 0 1.15 1.15 0 1 0 -2.3 0M8 8m-1.15 0a1.15 1.15 0 1 0 2.3 0 1.15 1.15 0 1 0 -2.3 0M12.5 8m-1.15 0a1.15 1.15 0 1 0 2.3 0 1.15 1.15 0 1 0 -2.3 0',
  sort: 'M3 4.5h10M3 8h7M3 11.5h4',
  board: 'M2.5 3.5h3.4v9H2.5zM6.3 3.5h3.4v6H6.3zM10.1 3.5h3.4v7.5h-3.4z',
  list: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  spinner: 'M8 2.5a5.5 5.5 0 1 0 5.5 5.5',
  refresh: 'M13.4 8a5.4 5.4 0 1 1-5.4-5.4c1.51 0 2.96.6 4.04 1.64L13.4 5.6M13.4 2.6v3h-3',
  branch: 'M4.4 2.6v7.2M11.6 6.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM4.4 13.4a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM11.6 6.2a5.4 5.4 0 0 1-5.4 5.4',
  ahead: 'M8 12.5v-9M4.5 7 8 3.5 11.5 7',
  behind: 'M8 3.5v9M4.5 9 8 12.5 11.5 9',
  bolt: 'M9 2.5 4 9h4l-1 4.5L12 7H8Z',
  keyboard: 'M3 4h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM4.6 6.6h.5M7.75 6.6h.5M10.9 6.6h.5M5.8 9.4h4.4',
  star: 'M8.00 2.70L9.50 6.44L13.52 6.71L10.43 9.29L11.41 13.19L8.00 11.05L4.59 13.19L5.57 9.29L2.48 6.71L6.50 6.44Z',
  eye: 'M1.8 8s2.3-4.3 6.2-4.3S14.2 8 14.2 8s-2.3 4.3-6.2 4.3S1.8 8 1.8 8ZM8 9.9a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z',
  hidden: 'M1.8 8s2.3-4.3 6.2-4.3S14.2 8 14.2 8s-2.3 4.3-6.2 4.3S1.8 8 1.8 8ZM8 9.9a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM3 13 13 3',
  pencil: 'M10.4 3.3a1.5 1.5 0 0 1 2.2 2.1l-7 7-2.9.8.8-2.9ZM9.2 4.5l2.2 2.2',
  blocked: 'M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM4.1 4.1l7.8 7.8',
  done: 'M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM5.6 8.1l1.7 1.8 3.2-3.6',
  goal: 'M8 13.8a5.8 5.8 0 1 0 0-11.6 5.8 5.8 0 0 0 0 11.6ZM8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  select: 'M4 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V4A1.5 1.5 0 0 1 4 2.5ZM5.6 8.1l1.7 1.8 3.2-3.6',
}

const FILLED = new Set(['stop', 'more'])

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
