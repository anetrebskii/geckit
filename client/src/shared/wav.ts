const bytes = (audio: string): Uint8Array => Uint8Array.from(atob(audio), (one) => one.charCodeAt(0))

// The samples of a WAV, past whatever chunks the recorder put before them.
function samples(audio: string): Uint8Array {
  const wav = bytes(audio)
  const view = new DataView(wav.buffer)
  for (let at = 12; at + 8 <= wav.length; at += 8 + view.getUint32(at + 4, true) + (view.getUint32(at + 4, true) % 2)) {
    if (String.fromCharCode(...wav.subarray(at, at + 4)) === 'data') return wav.subarray(at + 8, at + 8 + view.getUint32(at + 4, true))
  }
  return new Uint8Array()
}

/** Two recordings as one WAV, 16 kHz mono 16-bit as the phone records them. */
export function join(first: string, second: string): string {
  const [a, b] = [samples(first), samples(second)]
  const wav = new Uint8Array(44 + a.length + b.length)
  const view = new DataView(wav.buffer)
  const text = (at: number, word: string): void => wav.set([...word].map((one) => one.charCodeAt(0)), at)
  text(0, 'RIFF')
  view.setUint32(4, 36 + a.length + b.length, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true)
  view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, a.length + b.length, true)
  wav.set(a, 44)
  wav.set(b, 44 + a.length)
  let out = ''
  for (let at = 0; at < wav.length; at += 0x8000) out += String.fromCharCode(...wav.subarray(at, at + 0x8000))
  return btoa(out)
}
