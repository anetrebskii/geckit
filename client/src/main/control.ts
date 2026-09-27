import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'

import { screen, systemPreferences } from 'electron'
import log from 'electron-log'

import type { ScreenControl, ScreenControlled, ScreenModifier } from '../shared/api'

/**
 * The phone's hand on the Mac: one osascript kept running, which reads a line
 * of JSON at a time and posts it as the mouse or the keyboard would, so there
 * is no native module to build and each touch costs no process start.
 */

const SCRIPT = String.raw`
ObjC.import('CoreGraphics')
ObjC.import('Foundation')
const post = (event) => $.CGEventPost($.kCGHIDEventTap, event)
const mouse = (type, at, button, count) => {
  const event = $.CGEventCreateMouseEvent($(), type, at, button)
  if (count > 0) $.CGEventSetIntegerValueField(event, $.kCGMouseEventClickState, count)
  post(event)
}
const press = (code, flags, unit) => {
  for (const down of [true, false]) {
    const event = $.CGEventCreateKeyboardEvent($(), code, down)
    $.CGEventSetFlags(event, flags)
    if (unit !== undefined) {
      const text = Ref('S')
      text[0] = unit
      $.CGEventKeyboardSetUnicodeString(event, 1, text)
    }
    post(event)
  }
}
function run(order) {
  if (order.kind === 'key') return press(order.code, order.flags, order.unit)
  if (order.kind === 'type') {
    for (let at = 0; at < order.text.length; at++) press(0, 0, order.text.charCodeAt(at))
    return
  }
  const at = { x: order.x, y: order.y }
  const left = $.kCGMouseButtonLeft
  if (order.kind === 'move') return mouse(order.drag ? $.kCGEventLeftMouseDragged : $.kCGEventMouseMoved, at, left, 0)
  if (order.kind === 'press') return mouse(order.down ? $.kCGEventLeftMouseDown : $.kCGEventLeftMouseUp, at, left, 1)
  if (order.kind === 'click') {
    const right = order.button === 'right'
    const button = right ? $.kCGMouseButtonRight : left
    mouse(right ? $.kCGEventRightMouseDown : $.kCGEventLeftMouseDown, at, button, order.count)
    mouse(right ? $.kCGEventRightMouseUp : $.kCGEventLeftMouseUp, at, button, order.count)
    return
  }
  const event = $.CGEventCreate($())
  $.CGEventSetType(event, 22)
  $.CGEventSetLocation(event, at)
  $.CGEventSetIntegerValueField(event, 88, 1)
  $.CGEventSetIntegerValueField(event, 11, Math.round(order.dy / 10))
  $.CGEventSetIntegerValueField(event, 12, Math.round(order.dx / 10))
  $.CGEventSetIntegerValueField(event, 96, Math.round(order.dy))
  $.CGEventSetIntegerValueField(event, 97, Math.round(order.dx))
  post(event)
}
const input = $.NSFileHandle.fileHandleWithStandardInput
let rest = ''
for (;;) {
  const data = input.availableData
  if (Number(data.length) === 0) break
  rest += $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js
  const lines = rest.split('\n')
  rest = lines.pop()
  for (const line of lines) {
    try {
      run(JSON.parse(line))
    } catch (error) {}
  }
}
`

// The Mac's own key codes, which are places on the keyboard: a shortcut such as Command-C is found by them whatever the layout.
const NAMED: Record<string, number> = {
  return: 36,
  tab: 48,
  space: 49,
  delete: 51,
  escape: 53,
  forwardDelete: 117,
  home: 115,
  end: 119,
  pageUp: 116,
  pageDown: 121,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
}
const PLACED = 'asdfhgzxcv\u0000bqweryt123465=97-80]ou[ip\u0000lj\'k;\\,/nm.\u0000\u0000`'
const FLAGS: Record<ScreenModifier, number> = { command: 0x100000, option: 0x80000, control: 0x40000, shift: 0x20000 }

let hand: ChildProcess | undefined
let asked = false
let pointer: { x: number; y: number } | undefined
let movedAt = 0
let holding = false

function handed(): ChildProcess {
  if (hand?.exitCode === null && hand.stdin?.writable === true) return hand
  const next = spawn('osascript', ['-l', 'JavaScript', '-e', SCRIPT], { stdio: ['pipe', 'ignore', 'pipe'] })
  next.stderr?.on('data', (chunk: Buffer) => log.warn(`control: ${chunk.toString().trim()}`))
  next.on('exit', () => {
    if (hand === next) hand = undefined
  })
  hand = next
  return next
}

const post = (order: object): void => void handed().stdin?.write(`${JSON.stringify(order)}\n`)

/** Does it on the screen the phone is shown, and says where the pointer is now, or why the Mac will not let it. */
export function control(order: ScreenControl, displayId: string | undefined): ScreenControlled {
  if (process.platform !== 'darwin') return { error: 'Only a Mac can be worked from the phone' }
  if (!systemPreferences.isTrustedAccessibilityClient(false)) {
    // Asked once, which is what puts GeckIt in the Mac's list to allow.
    if (!asked) systemPreferences.isTrustedAccessibilityClient(true)
    asked = true
    return {
      error: 'The Mac has not allowed GeckIt to use its mouse and keyboard. On the Mac: System Settings, Privacy & Security, Accessibility, turn on GeckIt.',
    }
  }
  const { x, y, width, height } = (screen.getAllDisplays().find((one) => String(one.id) === displayId) ?? screen.getPrimaryDisplay()).bounds
  // Moves come faster than the Mac reports where they left the pointer, so a run of them is added up here; after a pause the Mac's own word is taken, since its mouse may have moved it.
  const seen = Date.now() - movedAt < 1000 && pointer !== undefined ? pointer : screen.getCursorScreenPoint()
  const here = { x: Math.min(x + width - 1, Math.max(x, seen.x)), y: Math.min(y + height - 1, Math.max(y, seen.y)) }
  if (order.kind === 'move') {
    here.x = Math.min(x + width - 1, Math.max(x, here.x + order.dx * width))
    here.y = Math.min(y + height - 1, Math.max(y, here.y + order.dy * height))
    post({ kind: 'move', ...here, drag: holding })
  } else if (order.kind === 'press') {
    holding = order.down
    post({ kind: 'press', ...here, down: order.down })
  } else if (order.kind === 'click') {
    post({ kind: 'click', ...here, button: order.button, count: order.count })
  } else if (order.kind === 'scroll') {
    post({ kind: 'scroll', ...here, dx: order.dx * width, dy: order.dy * height })
  } else if (order.kind === 'type') {
    post(order)
  } else if (order.kind === 'key') {
    const flags = order.modifiers.reduce((all, one) => all | FLAGS[one], 0)
    const named = NAMED[order.key]
    const placed = order.key.length === 1 ? PLACED.indexOf(order.key.toLowerCase()) : -1
    if (named !== undefined) post({ kind: 'key', code: named, flags })
    else if (placed >= 0) post({ kind: 'key', code: placed, flags })
    else if (order.key.length === 1) post({ kind: 'key', code: 0, flags, unit: order.key.charCodeAt(0) })
  }
  if (order.kind !== 'where') {
    pointer = here
    movedAt = Date.now()
  }
  return { x: (here.x - x) / width, y: (here.y - y) / height }
}
