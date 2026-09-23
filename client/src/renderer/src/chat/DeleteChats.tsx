import type { ChatSession } from '../../../shared/api'

/** Asking before conversations are thrown away, wherever they are being thrown away from. */
export function DeleteChats({
  chats,
  onClose,
  onDelete,
}: {
  readonly chats: readonly ChatSession[]
  readonly onClose: () => void
  readonly onDelete: () => void
}): React.JSX.Element {
  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
        {chats.length === 1 ? (
          <>
            <h2>Delete "{chats[0]?.title === '' ? 'Untitled' : chats[0]?.title}"?</h2>
            <p>
              Claude Code keeps this conversation in a file of its own. Deleting it here deletes that file, and nothing
              anywhere keeps a copy.
            </p>
          </>
        ) : (
          <>
            <h2>Delete {chats.length} conversations?</h2>
            <p>
              Claude Code keeps each conversation in a file of its own. Deleting them here deletes those files, and
              nothing anywhere keeps a copy.
            </p>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="quiet" autoFocus onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
