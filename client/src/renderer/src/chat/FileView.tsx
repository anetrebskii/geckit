import { useEffect, useState } from 'react'

import type { FileShown } from '../../../shared/api'
import { ON_PHONE } from '../on-phone'
import { CopyButton } from './Code'
import { computerName } from './PhoneHosts'
import { FullSheet, tooOld } from './PhoneKit'
import { hostName } from './project'
import { Preview } from './Preview'
import { Prose } from './Prose'

/**
 * A file pressed in a conversation on the phone, read on the Mac and shown
 * here: a picture in the viewer, a page drawn as it is and clickable, Markdown
 * as it reads, anything else as text.
 */
export function FileView({ root, path, onClose }: { readonly root: string; readonly path: string; readonly onClose: () => void }): React.JSX.Element {
  const [shown, setShown] = useState<FileShown | undefined>()
  useEffect(() => {
    let here = true
    window.geckit.chat.file(root, path).then(
      (got) => here && setShown(got),
      (error: unknown) => here && setShown({ kind: 'none', why: tooOld(error) }),
    )
    return () => {
      here = false
    }
  }, [root, path])

  if (shown?.kind === 'picture') return <Preview src={`data:${shown.image.media};base64,${shown.image.data}`} onClose={onClose} />
  // On the phone it always comes from the host it works through, whichever host actually holds it; on the desktop, that file's own host.
  const readingOn = ON_PHONE ? computerName() : (hostName(root) ?? 'this computer')
  return (
    <FullSheet
      title={path.split('/').at(-1) ?? path}
      tool={
        shown?.kind === 'text' || shown?.kind === 'markdown' ? (
          <CopyButton className="file-view-copy" title="Copy" copy={() => navigator.clipboard.writeText(shown.text)} />
        ) : undefined
      }
      onClose={onClose}
    >
      {shown === undefined ? (
        <p className="file-view-said">Reading it on {readingOn}...</p>
      ) : shown.kind === 'none' ? (
        <p className="file-view-said">{shown.why}</p>
      ) : shown.kind === 'page' ? (
        <iframe className="file-view-page" title={path} sandbox="allow-scripts allow-forms" srcDoc={shown.html} />
      ) : shown.kind === 'markdown' ? (
        <div className="file-view-prose">
          <Prose text={shown.text} />
        </div>
      ) : (
        <pre className="file-view-text">{shown.text}</pre>
      )}
    </FullSheet>
  )
}
