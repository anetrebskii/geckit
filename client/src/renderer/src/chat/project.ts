/** A project folder by its last part, which is what anybody calls it. */
export const projectName = (root: string): string => root.split('/').filter((part) => part !== '').pop() ?? root

/** A folder under the home folder, written from it: ~/Projects/mine/geckit. */
export const homePath = (path: string): string => {
  const home = window.geckit.home
  return home !== '' && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path
}

export const tint = (color: number): React.CSSProperties => ({ color: `var(--project-${String(color)})` })
