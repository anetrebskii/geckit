/** Local images are read through the file bridge; remote URLs are never fetched from an answer. */
export function picturePath(src: string): string | undefined {
  let path = src.replace(/^file:\/\//i, '')
  try { path = decodeURI(path) } catch { /* Keep literal percent signs in filenames. */ }
  path = path.replace(/^\/([a-z]:[/\\])/i, '$1')
  if (/^[a-z]:[/\\]/i.test(path)) return path
  if (path === '' || path.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('#')) return undefined
  return path
}

export function pictureData(src: string): boolean {
  return src.length <= 8 * 1024 * 1024 && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(src)
}
