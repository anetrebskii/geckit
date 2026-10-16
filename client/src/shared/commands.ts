/**
 * The command being typed after a / at the very start of a message, where
 * Claude Code reads one, while the caret is still in its name.
 */
export function commandAt(text: string, caret: number): { readonly from: number; readonly asked: string } | undefined {
  const found = /^\/([^\s/]*)$/.exec(text.slice(0, caret))
  const asked = found?.[1]
  return asked === undefined ? undefined : { from: 0, asked }
}

/**
 * The commands that fit what was typed after /: a name that starts with it,
 * then one that holds it, each in the order the tool listed them, which puts
 * the project's own skills first.
 */
export function commandsFor(names: readonly string[], asked: string): string[] {
  const lower = asked.toLowerCase()
  const starting = names.filter((name) => name.toLowerCase().startsWith(lower))
  const holding = names.filter((name) => !name.toLowerCase().startsWith(lower) && name.toLowerCase().includes(lower))
  return [...new Set([...starting, ...holding])]
}
