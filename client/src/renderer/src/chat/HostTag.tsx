import { hostName } from './project'

/** The host a project is on, after its name in the faint words: ` · devbox`. Nothing for a local one. */
export function HostTag({ root }: { readonly root: string }): React.JSX.Element | null {
  const name = hostName(root)
  return name === undefined ? null : <span className="host-tag"> · {name}</span>
}
