import { isAbsolute, relative, resolve, sep } from 'node:path'

/** What the assistant is asking to do, in the shape a request is read into. */
export type Wanted =
  | { readonly kind: 'write'; readonly paths: readonly string[] }
  | { readonly kind: 'command'; readonly command: string }
  | { readonly kind: 'web'; readonly url: string }
  | { readonly kind: 'read'; readonly path: string }
  | { readonly kind: 'question'; readonly question: string; readonly choices: readonly string[] }
  | { readonly kind: 'start'; readonly plan: string }
  | { readonly kind: 'other'; readonly tool: string; readonly detail: string }

/**
 * A path as the project names it, or nothing where it is outside the project.
 *
 * The tool names files absolutely most of the time and relatively some of the
 * time, so everything is resolved against the project first.
 */
export function within(root: string, path: string): string | undefined {
  if (path === '') return undefined
  const inside = relative(root, resolve(root, path))
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return undefined
  return inside.split(sep).join('/')
}

/** The files among these paths, as the project names them. */
export function filesAmong(root: string, paths: readonly string[]): string[] {
  const found: string[] = []
  for (const path of paths) {
    const inside = within(root, path)
    if (inside !== undefined && !found.includes(inside)) found.push(inside)
  }
  return found
}
