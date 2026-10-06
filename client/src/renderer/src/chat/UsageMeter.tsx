export function until(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${String(days)}d ${String(hours)}h`
  if (hours > 0) return `${String(hours)}h ${String(minutes % 60)}m`
  return `${String(minutes)}m`
}

/** The same thresholds a terminal status line uses: fine, getting there, nearly out. */
const tone = (part: number): string => (part >= 0.9 ? 'high' : part >= 0.7 ? 'mid' : 'low')

export function Meter({ part }: { readonly part: number }): React.JSX.Element {
  return (
    <span className={`meter ${tone(part)}`}>
      <span style={{ width: `${String(Math.min(100, Math.round(part * 100)))}%` }} />
    </span>
  )
}

