import { useEffect, useState } from 'react'

import type { FileShown } from '../../../shared/api'
import { ON_PHONE } from '../on-phone'
import { CopyButton } from './Code'
import { computerName } from './PhoneHosts'
import { Cell, FullSheet, tooOld } from './PhoneKit'
import { hostName } from './project'
import { Preview } from './Preview'
import { Prose } from './Prose'

/**
 * A file pressed in a conversation on the phone, read on the Mac and shown
 * here: a picture in the viewer, a page drawn as it is and clickable, Markdown
 * as it reads, a folder as what is in it, each pressed shown in turn, anything else as text.
 */
export function FileView({ root, path: said, onClose }: { readonly root: string; readonly path: string; readonly onClose: () => void }): React.JSX.Element {
  const [trail, setTrail] = useState<readonly string[]>([said])
  const path = trail.at(-1) ?? said
  const back = trail.length > 1 ? () => setTrail(trail.slice(0, -1)) : undefined
  const [read, setRead] = useState<{ readonly path: string; readonly shown: FileShown } | undefined>()
  const shown = read?.path === path ? read.shown : undefined
  useEffect(() => {
    let here = true
    window.geckit.chat.file(root, path).then(
      (got) => here && setRead({ path, shown: got }),
      (error: unknown) => here && setRead({ path, shown: { kind: 'none', why: tooOld(error) } }),
    )
    return () => {
      here = false
    }
  }, [root, path])

  if (shown?.kind === 'picture') return <Preview src={`data:${shown.image.media};base64,${shown.image.data}`} onClose={back ?? onClose} />
  // On the phone it always comes from the host it works through, whichever host actually holds it; on the desktop, that file's own host.
  const readingOn = ON_PHONE ? computerName() : (hostName(root) ?? 'this computer')
  const nameOf = (one: string): string => one.split('/').filter((part) => part !== '').at(-1) ?? one
  return (
    <FullSheet
      title={nameOf(path)}
      {...(back === undefined ? {} : { back: nameOf(trail.at(-2) ?? said), onBack: back })}
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
      ) : shown.kind === 'folder' ? (
        <div className="phone-group">
          {shown.inside.map((one) => (
            <Cell
              key={one.name}
              label={one.name}
              icon={one.folder ? 'folder' : 'file'}
              onPress={() => setTrail([...trail, `${path.replace(/\/+$/, '')}/${one.name}`])}
            />
          ))}
          {shown.inside.length === 0 ? <Cell label={`Nothing inside ${nameOf(path)}`} /> : null}
        </div>
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
