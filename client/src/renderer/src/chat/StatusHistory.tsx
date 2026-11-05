import { memo } from 'react'
import type { ChatSession } from '../../../shared/api'
import { formatStatusMove } from '../../../shared/status-history'

export const StatusHistory = memo(function StatusHistory({ moves = [] }: Pick<ChatSession, 'moves'>): React.JSX.Element {
  return <details className="status-history no-drag">
    <summary>Status history</summary>
    {moves.length === 0 ? <p>No status changes recorded.</p> : <ol>{moves.map((move, index) => <li key={`${move.at}:${index}`}>{formatStatusMove(move)}</li>)}</ol>}
  </details>
})
