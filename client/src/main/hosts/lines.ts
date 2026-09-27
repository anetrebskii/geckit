/**
 * Chunks of bytes, handed on as whole lines with how many bytes each took, the
 * newline counted. A line cut between two chunks waits for its end, so a count
 * of the bytes handed on is always a place in the file where a line begins.
 */
export function lineSplitter(take: (line: string, bytes: number) => void): (chunk: Buffer) => void {
  let carry = Buffer.alloc(0)
  return (chunk) => {
    let joined = carry.length === 0 ? chunk : Buffer.concat([carry, chunk])
    for (;;) {
      const end = joined.indexOf(10)
      if (end < 0) break
      const line = joined.subarray(0, end)
      joined = joined.subarray(end + 1)
      take(line.toString('utf8').replace(/\r$/, ''), end + 1)
    }
    carry = Buffer.from(joined)
  }
}
