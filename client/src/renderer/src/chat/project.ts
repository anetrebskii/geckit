/** A project folder by its last part, which is what anybody calls it. */
export const projectName = (root: string): string => root.split('/').filter((part) => part !== '').pop() ?? root

/** A folder under the home folder, written from it: ~/Projects/mine/geckit. */
export const homePath = (path: string): string => {
  const home = window.geckit.home
  return home !== '' && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path
}

/** The project's colour as a variable the `tinted` rule reads, so a row that is open can say its own colour over it. */
export const tint = (color: number): React.CSSProperties => ({ ['--tint']: `var(--project-${String(color)})` }) as React.CSSProperties
