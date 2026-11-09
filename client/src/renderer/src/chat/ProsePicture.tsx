import { useContext, useEffect, useRef, useState } from 'react'
import { pictureData, picturePath } from '../../../shared/pictures'
import { Files } from './Prose'
import { Preview } from './Preview'

/** Load local screenshots only when near the viewport, using the same bridge on desktop and phone. */
export function ProsePicture({ src, alt }: { readonly src: string; readonly alt: string }): React.JSX.Element {
  const files = useContext(Files)
  const root = files?.root
  const path = picturePath(src)
  const box = useRef<HTMLSpanElement>(null)
  const [loaded, setLoaded] = useState<{ root: string; path: string; src: string }>()
  const [preview, setPreview] = useState(false)
  const data = pictureData(src) ? src : loaded?.root === root && loaded?.path === path ? loaded?.src : undefined
  useEffect(() => {
    if (root === undefined || path === undefined || box.current === null) return
    let live = true
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      void window.geckit.chat.file(root, path).then((shown) => {
        if (live && shown.kind === 'picture') setLoaded({ root, path, src: `data:${shown.image.media};base64,${shown.image.data}` })
      }).catch(() => undefined)
    }, { rootMargin: '300px' })
    observer.observe(box.current)
    return () => { live = false; observer.disconnect() }
  }, [root, path])
  const label = alt || path || src || 'Image'
  return <span ref={box} className="prose-picture">
    {data === undefined
      ? <a href={src} onClick={(event) => { event.preventDefault(); if (path !== undefined && files !== undefined) files.onFile(path, 'open'); else if (src !== '') window.geckit.chat.openLink(src) }}>{label}</a>
      : <button type="button" className="prose-picture-open" aria-label={`Open image: ${label}`} onClick={() => setPreview(true)}><img src={data} alt={alt} loading="lazy" decoding="async" /></button>}
    {preview && data !== undefined ? <Preview src={data} onClose={() => setPreview(false)} /> : null}
  </span>
}
