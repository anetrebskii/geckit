import { createContext, useContext, useEffect, useState } from 'react'
import type { JSX } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Code } from './Code'
import { pathIn, pathOfLink, pathsIn } from '../../../shared/paths'

/**
 * What the assistant said, drawn as the Markdown it wrote, tables and all.
 *
 * Built into React elements rather than into HTML, so nothing the assistant
 * echoes out of a file can become markup: a tag in the text is shown as the
 * text it is, and a picture is a link rather than something fetched.
 */

interface Node {
  type: string
  value?: string
  children?: Node[]
  data?: { hName: string; hProperties: { className: string[] } }
}

/** What pressing a file asks for. */
export type FileHow = 'open' | 'reveal' | 'menu'

export const OPENS = 'Open it. Cmd+click shows it in the Finder, right-click chooses what opens it.'

/** The project the paths in an answer are said from, and what pressing one does. */
export const Files = createContext<
  { readonly root: string; readonly onFile: (path: string, how: FileHow) => void } | undefined
>(undefined)

// Found once, a path stays found; one not there is asked again when it is next drawn, as it may be written by then.
const there = new Set<string>()

function useThere(root: string | undefined, path: string): boolean {
  const key = `${root ?? ''}\n${path}`
  const [found, setFound] = useState<string | undefined>()
  useEffect(() => {
    if (root === undefined || there.has(key)) return
    let live = true
    void window.geckit.chat.exists(root, path).then((is) => {
      if (!is) return
      there.add(key)
      if (live) setFound(key)
    })
    return () => {
      live = false
    }
  }, [root, path, key])
  return root !== undefined && (found === key || there.has(key))
}

/** A path the assistant wrote, drawn as a link when it is on disk. */
function Mention({
  path,
  code,
  children,
}: {
  readonly path: string
  readonly code: boolean
  readonly children: React.ReactNode
}): JSX.Element {
  const files = useContext(Files)
  const found = useThere(files?.root, path)
  const Tag = code ? 'code' : 'span'
  if (files === undefined || !found) return <Tag>{children}</Tag>
  return (
    <Tag
      className="file-link"
      role="link"
      tabIndex={0}
      title={OPENS}
      onClick={(event) => {
        // Letting go after selecting part of it is not a press.
        if (window.getSelection()?.isCollapsed === false) return
        files.onFile(path, event.metaKey ? 'reveal' : 'open')
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        files.onFile(path, 'menu')
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') files.onFile(path, 'open')
      }}
    >
      {children}
    </Tag>
  )
}

const MENTION = 'mention'

/** Cuts the paths out of the sentences, so each can be asked about on its own. Links and code are left as they are. */
function pathsAsMentions() {
  const said = (text: string): Node[] =>
    pathsIn(text).map((part) =>
      part.path
        ? {
            type: MENTION,
            data: { hName: 'span', hProperties: { className: [MENTION] } },
            children: [{ type: 'text', value: part.text }],
          }
        : { type: 'text', value: part.text },
    )
  const walk = (node: Node): void => {
    if (node.children === undefined || ['link', 'linkReference', 'inlineCode', 'code', MENTION].includes(node.type)) {
      return
    }
    node.children = node.children.flatMap((child) =>
      child.type === 'text' && child.value !== undefined ? said(child.value) : [child],
    )
    for (const child of node.children) walk(child)
  }
  return walk
}

function tagsAsText() {
  const walk = (node: Node): void => {
    if (node.type === 'html') node.type = 'text'
    for (const child of node.children ?? []) walk(child)
  }
  return walk
}

const open = (href: string | undefined) => (event: React.MouseEvent) => {
  event.preventDefault()
  if (href !== undefined) window.geckit.chat.openLink(href)
}

const COMPONENTS: Components = {
  a: ({ href, children }) => {
    const path = href === undefined ? undefined : pathOfLink(href)
    return path === undefined ? (
      <a href={href} onClick={open(href)}>
        {children}
      </a>
    ) : (
      <Mention path={path} code={false}>
        {children}
      </Mention>
    )
  },
  img: ({ src, alt }) => {
    const href = typeof src === 'string' ? src : undefined
    return (
      <a href={href} onClick={open(href)}>
        {alt === undefined || alt === '' ? href : alt}
      </a>
    )
  },
  pre: ({ children }) => <Code>{children}</Code>,
  code: ({ className, children }) => {
    const path = typeof children === 'string' ? pathIn(children) : undefined
    return path === undefined ? (
      <code className={className}>{children}</code>
    ) : (
      <Mention path={path} code>
        {children}
      </Mention>
    )
  },
  span: ({ className, children }) =>
    className === MENTION && typeof children === 'string' ? (
      <Mention path={children} code={false}>
        {children}
      </Mention>
    ) : (
      <span className={className}>{children}</span>
    ),
  table: ({ children }) => (
    <div className="prose-table">
      <table>{children}</table>
    </div>
  ),
}

const PLUGINS = [remarkGfm, tagsAsText, pathsAsMentions]

/** Answers already made into elements, the newest kept, so a conversation opened again is not parsed again. */
const built = new Map<string, JSX.Element>()
const BUILT = 2000

export function Prose({ text }: { readonly text: string }): JSX.Element {
  let tree = built.get(text)
  built.delete(text)
  tree ??= Markdown({ children: text, remarkPlugins: PLUGINS, components: COMPONENTS })
  built.set(text, tree)
  if (built.size > BUILT) built.delete(built.keys().next().value ?? '')
  return <div className="prose">{tree}</div>
}
