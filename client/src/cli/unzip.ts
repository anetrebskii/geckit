import { createReadStream, createWriteStream, mkdirSync, symlinkSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { compose, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createInflateRaw } from 'node:zlib'

/** Unpacks a zip with Node alone, keeping each file's mode and symlinks, since a computer reached over SSH may have no unzip. */
export async function unzip(zip: string, into: string): Promise<void> {
  const root = resolve(into)
  const file = await open(zip, 'r')
  try {
    const { size } = await file.stat()
    const tailLength = Math.min(size, 65_557)
    const tail = Buffer.alloc(tailLength)
    await file.read(tail, 0, tailLength, size - tailLength)
    let end = -1
    for (let at = tailLength - 22; at >= 0; at--) if (tail.readUInt32LE(at) === 0x06054b50) { end = at; break }
    if (end < 0) throw new Error('the download is not a zip')
    const count = tail.readUInt16LE(end + 10)
    const listLength = tail.readUInt32LE(end + 12)
    const listAt = tail.readUInt32LE(end + 16)
    if (count === 0xffff || listAt === 0xffffffff) throw new Error('the zip is too large to unpack here')
    const list = Buffer.alloc(listLength)
    await file.read(list, 0, listLength, listAt)
    mkdirSync(root, { recursive: true })
    let at = 0
    for (let n = 0; n < count; n++) {
      if (list.readUInt32LE(at) !== 0x02014b50) throw new Error('the zip is damaged')
      const method = list.readUInt16LE(at + 10)
      const packed = list.readUInt32LE(at + 20)
      const nameLength = list.readUInt16LE(at + 28)
      const skip = nameLength + list.readUInt16LE(at + 30) + list.readUInt16LE(at + 32)
      const mode = list.readUInt32LE(at + 38) >>> 16
      const local = list.readUInt32LE(at + 42)
      const name = list.toString('utf8', at + 46, at + 46 + nameLength)
      at += 46 + skip
      const target = resolve(root, name)
      if (target !== root && !target.startsWith(root + sep)) throw new Error(`the zip names a file outside it: ${name}`)
      if (name.endsWith('/')) { mkdirSync(target, { recursive: true }); continue }
      mkdirSync(dirname(target), { recursive: true })
      const header = Buffer.alloc(30)
      await file.read(header, 0, 30, local)
      const start = local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
      if (method !== 0 && method !== 8) throw new Error(`the zip packs ${name} in a way not read here`)
      const content = (): Readable => {
        if (packed === 0) return Readable.from([])
        const raw = createReadStream(zip, { start, end: start + packed - 1 })
        return method === 8 ? compose(raw, createInflateRaw()) : raw
      }
      if ((mode & 0o170000) === 0o120000) {
        const chunks: Buffer[] = []
        for await (const chunk of content()) chunks.push(chunk as Buffer)
        symlinkSync(Buffer.concat(chunks).toString('utf8'), target)
        continue
      }
      await pipeline(content(), createWriteStream(target, { mode: (mode & 0o777) || 0o644 }))
    }
  } finally {
    await file.close()
  }
}
