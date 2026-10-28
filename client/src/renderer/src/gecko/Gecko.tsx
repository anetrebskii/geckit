import { useCallback, useEffect, useRef, useState } from 'react'

import type { SessionImage } from '../../../shared/api'
import { canDoze, DOZE, geckoShown } from '../../../shared/gecko'
import type { GeckoShown, GeckoView } from '../../../shared/gecko'
import { asImage, canShow } from '../pictures'
import { toHear, useRecorder } from '../recorder'
import { useSettings } from '../settings'
import { EYES, GeckoArt } from './Art'
import type { Aim } from './Art'

const reducedNow = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Whether the system asks for reduced motion, kept up to date. */
function useReduced(): boolean {
  const [reduced, setReduced] = useState(reducedNow)
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const change = (): void => setReduced(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return reduced
}

/** Whether the window is seen: hidden, nothing animates and no timer runs. */
function useSeen(): boolean {
  const [seen, setSeen] = useState(() => !document.hidden)
  useEffect(() => {
    const look = (): void => setSeen(!document.hidden)
    document.addEventListener('visibilitychange', look)
    return () => document.removeEventListener('visibilitychange', look)
  }, [])
  return seen
}

const pause = (ms: number, run: { stopped: boolean }): Promise<boolean> => new Promise((done) => setTimeout(() => done(!run.stopped), ms))
const between = (from: number, spread: number): number => from + Math.random() * spread

/**
 * The two frames of a pose taking turns, with the demo's rhythm: the hands typing a few keys then resting, the foot tapping three
 * times now and then, the pen writing a few strokes. Only while it is in that pose and moving; otherwise the first frame holds.
 */
function useAlternate(shown: GeckoShown, moving: boolean): boolean {
  const [alt, setAlt] = useState(false)
  const active = moving && (shown === 'working' || shown === 'waiting' || shown === 'listen')
  useEffect(() => {
    if (!active) return
    const run = { stopped: false }
    const loop = async (): Promise<void> => {
      while (!run.stopped) {
        if (shown === 'waiting') {
          for (let tap = 0; tap < 3; tap += 1) {
            setAlt(true)
            if (!(await pause(170, run))) return
            setAlt(false)
            if (!(await pause(200, run))) return
          }
          if (!(await pause(between(1600, 1200), run))) return
          continue
        }
        const strokes = shown === 'working' ? 5 + Math.floor(Math.random() * 8) : 3 + Math.floor(Math.random() * 4)
        for (let one = 0; one < strokes; one += 1) {
          setAlt(one % 2 === 0)
          if (!(await pause(shown === 'working' ? between(130, 90) : between(170, 120), run))) return
        }
        setAlt(false)
        if (!(await pause(between(500, 900), run))) return
      }
    }
    void loop()
    return () => {
      run.stopped = true
    }
  }, [shown, active])
  return active && alt
}

/** A blink now and then, for 130 ms, while the sitting head's eyes are open. */
function useBlink(on: boolean): boolean {
  const [blinking, setBlinking] = useState(false)
  useEffect(() => {
    if (!on) return
    let timer: ReturnType<typeof setTimeout>
    const next = (): void => {
      timer = setTimeout(() => {
        setBlinking(true)
        timer = setTimeout(() => {
          setBlinking(false)
          next()
        }, 130)
      }, between(2200, 3000))
    }
    next()
    return () => {
      clearTimeout(timer)
      setBlinking(false)
    }
  }, [on])
  return blinking
}

/** The pet's bend over 1.3 s, as the demo keys it: up to 7 and back, a little rebound in the middle. */
const KEYS = [
  [0, 0],
  [0.3, 7],
  [0.5, 4],
  [0.7, 7],
  [1, 0],
] as const
const ease = (t: number): number => t * t * (3 - 2 * t)
export function bend(t: number): number {
  for (let at = 1; at < KEYS.length; at += 1) {
    const [t1, a1] = KEYS[at] ?? [1, 0]
    if (t > t1) continue
    const [t0, a0] = KEYS[at - 1] ?? [0, 0]
    return Math.round(a0 + (a1 - a0) * ease((t - t0) / (t1 - t0)))
  }
  return 0
}

/** Where each pupil looks to see a point on the screen, in the drawing's units: towards it, less when it is near. */
function aimAt(art: SVGSVGElement | null, at: { readonly x: number; readonly y: number }): readonly [Aim, Aim] {
  const box = art?.getBoundingClientRect()
  if (box === undefined || box.width === 0) return [{ x: 0, y: 0 }, { x: 0, y: 0 }]
  const scale = box.width / 1024
  const one = (eye: (typeof EYES)[number]): Aim => {
    const dx = at.x - (window.screenX + box.left + eye.x * scale)
    const dy = at.y - (window.screenY + box.top + eye.y * scale)
    const far = Math.hypot(dx, dy) || 1
    const reach = Math.min(16, far / 8)
    return { x: (dx / far) * reach, y: (dy / far) * reach }
  }
  return [one(EYES[0]), one(EYES[1])]
}

/** How long the catch shows before the bubble asks about the files. */
const CATCH = 1100
/** The camera is raised this long, then it flashes, and the crosshair comes once the flash is over. */
const RAISE = 1000
const FLASH = 500

/** Files dropped on the gecko as main takes them: pictures read as the chat reads a dropped one, the paths of the rest, and of a picture too big to send. */
async function handed(files: readonly File[]): Promise<{ images: SessionImage[]; paths: string[] }> {
  const images: SessionImage[] = []
  const paths: string[] = []
  for (const file of files) {
    const image = canShow(file) && images.length < 8 ? await asImage(file).catch(() => undefined) : undefined
    if (image !== undefined) images.push(image)
    else if (window.geckit.pathFor(file) !== '') paths.push(window.geckit.pathFor(file))
  }
  return { images, paths }
}

/** The floating gecko: told its state and the cursor by main; pressed for its menu, given files, listening for a voice task, dragged anywhere and resized from its grip. */
export function Gecko(): React.JSX.Element | null {
  const [settings] = useSettings()
  const [view, setView] = useState<GeckoView | undefined>()
  const [done, setDone] = useState(false)
  const [dozing, setDozing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [drag, setDrag] = useState(false)
  const [got, setGot] = useState(false)
  const [camera, setCamera] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [listen, setListen] = useState(false)
  const [hopping, setHopping] = useState(false)
  const [pressing, setPressing] = useState(false)
  // A pet belongs to the pose it began in, and ends with any change of pose.
  const [pet, setPet] = useState<{ readonly shown: GeckoShown; readonly tilt: number } | undefined>()
  const [look, setLook] = useState<readonly [Aim, Aim]>([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ])
  const art = useRef<SVGSVGElement | null>(null)
  const seen = useSeen()
  const reduced = useReduced()
  const moving = seen && !reduced
  const pose = view?.pose ?? 'asleep'
  const now = { pose, done, menu, drag, got, camera, listen }
  const shown = geckoShown({ ...now, dozing })
  const alt = useAlternate(shown, moving)
  const petting = pet !== undefined && pet.shown === shown
  const tilt = petting ? pet.tilt : 0
  const blinking = useBlink(moving && !petting && (shown === 'waiting' || shown === 'done' || shown === 'look'))

  // Falling asleep: waiting or done, left alone for the time it takes; a hover, a click or anything new wakes it.
  const dozes = canDoze(now)
  const [stirred, setStirred] = useState(0)
  const stir = useCallback(() => {
    setDozing(false)
    setStirred((was) => was + 1)
  }, [])
  useEffect(() => {
    if (!dozes || !seen) return
    const timer = setTimeout(() => {
      setDozing(true)
      setDone(false)
    }, DOZE)
    return () => clearTimeout(timer)
  }, [dozes, seen, stirred])

  const petFrame = useRef(0)
  useEffect(
    () => () => {
      cancelAnimationFrame(petFrame.current)
      petFrame.current = 0
    },
    [shown],
  )
  const startPet = (): void => {
    if (!moving || petFrame.current !== 0 || menu || listen || drag || got || camera || hopping) return
    const from = performance.now()
    const during = shown
    setPet({ shown: during, tilt: 0 })
    const step = (time: number): void => {
      const t = (time - from) / 1300
      if (t >= 1) {
        petFrame.current = 0
        setPet(undefined)
        return
      }
      setPet({ shown: during, tilt: bend(t) })
      petFrame.current = requestAnimationFrame(step)
    }
    petFrame.current = requestAnimationFrame(step)
  }

  const squash = (): void => {
    if (reduced) return
    setPressing(false)
    requestAnimationFrame(() => setPressing(true))
  }

  // The voice task: the microphone records while it writes; a press stops it, and what was said goes for a new task.
  const writing = useRef(false)
  const recorder = useRecorder(settings.microphoneDeviceId, (audio) => {
    writing.current = true
    void toHear(audio)
      .then((request) => window.geckit.gecko.heard(request))
      .catch((error: unknown) => window.geckit.gecko.heard({ error: error instanceof Error ? error.message : String(error) }))
      .finally(() => {
        writing.current = false
        setListen(false)
      })
  })
  const { start, stop, cancel, recording, error } = recorder
  const began = useRef(false)
  useEffect(() => {
    if (recording) began.current = true
  }, [recording])
  // Stopped with nothing recorded, or the microphone could not be opened: it says so, and stops listening.
  useEffect(() => {
    if (!listen || recording || writing.current || (error === '' && !began.current)) return
    const soon = setTimeout(
      () => {
        if (writing.current) return
        setListen(false)
        void window.geckit.gecko.heard({ error: error === '' ? 'Nothing was heard' : `Nothing could be recorded: ${error}` })
      },
      error === '' ? 400 : 0,
    )
    return () => clearTimeout(soon)
  }, [listen, recording, error])

  const held = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | undefined>(undefined)
  const sizing = useRef<{ x: number; y: number; side: number } | undefined>(undefined)
  const depth = useRef(0)

  useEffect(() => {
    void window.geckit.gecko.state().then(setView)
    const offs = [
      window.geckit.gecko.onState((next) => {
        setView(next)
        stir()
        // Waiting drops a hop under way: the person has something more urgent to see.
        if (next.pose === 'waiting') setHopping(false)
      }),
      // The eyes follow even with reduced motion: a look is a pose, not a movement.
      window.geckit.gecko.onCursor((cursor) => setLook(aimAt(art.current, cursor))),
      window.geckit.gecko.onRing((open) => {
        setMenu(open)
        stir()
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [stir])

  // A hop once a card reaches In review, then the happy look; not while something else is going on, and not saved for later.
  useEffect(
    () =>
      window.geckit.gecko.onHop(() => {
        stir()
        setDone(true)
        if (moving && !menu && !listen && !camera && !drag && !got && pose !== 'waiting') setHopping(true)
      }),
    [stir, moving, menu, listen, camera, drag, got, pose],
  )
  useEffect(() => {
    if (!hopping) return
    const soon = setTimeout(() => setHopping(false), 1100)
    return () => clearTimeout(soon)
  }, [hopping])

  // The screenshot: the camera raised, a flash at the lens and round the gecko, then the Mac's crosshair.
  useEffect(
    () =>
      window.geckit.gecko.onCamera(() => {
        if (!moving) {
          window.geckit.gecko.shoot()
          return
        }
        setCamera(true)
        setTimeout(() => {
          setSnapping(true)
          setPressing(false)
          requestAnimationFrame(() => setPressing(true))
          setTimeout(() => {
            setSnapping(false)
            setCamera(false)
            window.geckit.gecko.shoot()
          }, FLASH)
        }, RAISE)
      }),
    [moving],
  )

  useEffect(
    () =>
      window.geckit.gecko.onListen((what) => {
        if (what === 'start') {
          began.current = false
          writing.current = false
          setListen(true)
          start()
          return
        }
        cancel()
        setListen(false)
      }),
    [start, cancel],
  )

  if (view === undefined) return null
  return (
    <div
      className="gecko-window"
      onPointerEnter={() => {
        stir()
        startPet()
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        held.current = { x: event.screenX, y: event.screenY, left: window.screenX, top: window.screenY, moved: false }
      }}
      onPointerMove={(event) => {
        const from = held.current
        if (from === undefined) return
        // A release that never arrived, as outside the window: the drag is over.
        if (event.buttons === 0) {
          held.current = undefined
          if (from.moved) window.geckit.gecko.moved()
          return
        }
        const dx = event.screenX - from.x
        const dy = event.screenY - from.y
        if (!from.moved && Math.hypot(dx, dy) < 4) return
        from.moved = true
        window.geckit.gecko.move(from.left + dx, from.top + dy)
      }}
      onPointerUp={() => {
        const from = held.current
        held.current = undefined
        if (from === undefined) return
        if (from.moved) {
          window.geckit.gecko.moved()
          return
        }
        stir()
        squash()
        // Listening, a press stops it and what was said is written down; otherwise its menu opens round it.
        if (listen) stop()
        else window.geckit.gecko.press()
      }}
      onPointerCancel={() => {
        held.current = undefined
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        window.geckit.gecko.menu()
      }}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        depth.current += 1
        if (depth.current > 1) return
        stir()
        setDrag(true)
        squash()
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        // The eyes on the file.
        setLook(aimAt(art.current, { x: window.screenX + event.clientX, y: window.screenY + event.clientY }))
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDrag(false)
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        depth.current = 0
        setDrag(false)
        stir()
        const files = [...event.dataTransfer.files]
        setGot(moving)
        void Promise.all([handed(files), new Promise((done) => setTimeout(done, moving ? CATCH : 0))]).then(([given]) => {
          setGot(false)
          window.geckit.gecko.drop(given)
        })
      }}
    >
      <div
        className="gecko-hold"
        ref={(element) => {
          art.current = element?.querySelector('svg') ?? null
        }}
        onAnimationEnd={(event) => {
          if (event.animationName === 'gk-squash') setPressing(false)
        }}
      >
        <GeckoArt
          pose={pose}
          count={view.count}
          shown={shown}
          alt={alt}
          blinking={blinking}
          petting={petting}
          hopping={hopping}
          tilt={tilt}
          look={look}
          pressing={pressing}
          snapping={snapping}
          still={!moving}
        />
      </div>
      <span
        className="gk-grip"
        aria-hidden="true"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
          sizing.current = { x: event.screenX, y: event.screenY, side: window.innerWidth }
        }}
        onPointerMove={(event) => {
          const from = sizing.current
          if (from === undefined) return
          event.stopPropagation()
          if (event.buttons === 0) {
            sizing.current = undefined
            return
          }
          // Square: the larger of the two moves.
          const by = Math.max(event.screenX - from.x, event.screenY - from.y)
          window.geckit.gecko.resize(from.side + by)
        }}
        onPointerUp={(event) => {
          event.stopPropagation()
          sizing.current = undefined
        }}
      />
    </div>
  )
}
