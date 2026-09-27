import { describe, expect, it } from 'vitest'

import { quote, uploadScript } from '../src/main/hosts/run-script'

/**
 * The script a file dropped on a conversation on a host is copied over: what
 * it does before it ever reaches `sh -s` over ssh.
 */

describe('a file dropped on a conversation on a host', () => {
  const id = '11111111-1111-1111-1111-111111111111'

  it('quotes a name with a quote and a space in it, so the host reads none of it as its own shell', () => {
    const name = `it's "there".png`
    const script = uploadScript(id, name)
    const quoted = quote(name)
    expect(quoted).toBe(`'it'\\''s "there".png'`)
    expect(script).toContain(`cat > "$HOME/.geckit/uploads/${id}"/${quoted} || exit 1`)
    expect(script).toContain(`printf '%s/%s' "$HOME/.geckit/uploads/${id}" ${quoted}`)
  })

  it('makes the folder its own upload is kept under before writing to it', () => {
    const script = uploadScript(id, 'shot.png')
    const lines = script.split('\n')
    expect(lines[1]).toBe(`mkdir -p "$HOME/.geckit/uploads/${id}" || exit 1`)
  })

  it('lets go of an upload folder older than a week, before anything of today is made', () => {
    const script = uploadScript(id, 'shot.png')
    const lines = script.split('\n')
    expect(lines[0]).toBe('find "$HOME/.geckit/uploads" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null')
  })
})
