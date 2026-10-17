import type { ScreenModifier } from '../shared/api'

/**
 * The phone's hand on a Windows computer: one PowerShell kept running, which
 * compiles a small class over SendInput once and reads a line of numbers at a
 * time, so there is no native module to build and each touch costs no process
 * start. Points are the screen's own pixels; the process is made aware of each
 * monitor's scale, so they are the pixels SendInput means.
 *
 * A line is a letter and numbers: `m x y` moves, `d x y` and `u x y` press and
 * let go of the left button, `c x y b` clicks (b 0 left, 1 right), `w x y v h`
 * turns the wheel, `k vk held` presses a key with the held keys, `k 0 held
 * unit` types one character with them, and `t unit...` types text.
 */
export const WINDOWS_SCRIPT = String.raw`
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class GeckitHand {
  [StructLayout(LayoutKind.Sequential)]
  struct MouseInput { public int dx; public int dy; public uint data; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)]
  struct KeyInput { public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)]
  struct Either { [FieldOffset(0)] public MouseInput mouse; [FieldOffset(0)] public KeyInput key; }
  [StructLayout(LayoutKind.Sequential)]
  struct Input { public uint type; public Either u; }

  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, Input[] inputs, int size);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint type);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  const uint MOVE = 0x1, LEFTDOWN = 0x2, LEFTUP = 0x4, RIGHTDOWN = 0x8, RIGHTUP = 0x10;
  const uint WHEEL = 0x800, HWHEEL = 0x1000, VIRTUALDESK = 0x4000, ABSOLUTE = 0x8000;
  const uint EXTENDED = 0x1, KEYUP = 0x2, UNICODE = 0x4;
  static readonly ushort[] HELD = { 0x11, 0x12, 0x10, 0x5B };

  static void Send(params Input[] inputs) { SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input))); }

  static Input Mouse(int x, int y, uint flags, int data) {
    int left = GetSystemMetrics(76), top = GetSystemMetrics(77);
    int wide = Math.Max(2, GetSystemMetrics(78)), high = Math.Max(2, GetSystemMetrics(79));
    Input one = new Input { type = 0 };
    one.u.mouse.dx = (int)Math.Round((x - left) * 65535.0 / (wide - 1));
    one.u.mouse.dy = (int)Math.Round((y - top) * 65535.0 / (high - 1));
    one.u.mouse.data = unchecked((uint)data);
    one.u.mouse.flags = flags | MOVE | ABSOLUTE | VIRTUALDESK;
    return one;
  }

  static bool Extended(int vk) { return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0x5B; }

  static Input Key(int vk, bool down) {
    Input one = new Input { type = 1 };
    one.u.key.vk = (ushort)vk;
    one.u.key.scan = (ushort)MapVirtualKey((uint)vk, 0);
    one.u.key.flags = (Extended(vk) ? EXTENDED : 0) | (down ? 0 : KEYUP);
    return one;
  }

  static Input Unit(int unit, bool down) {
    Input one = new Input { type = 1 };
    one.u.key.scan = (ushort)unit;
    one.u.key.flags = UNICODE | (down ? 0 : KEYUP);
    return one;
  }

  static void Held(int held, bool down) {
    for (int at = 0; at < HELD.Length; at++) if ((held & (1 << at)) != 0) Send(Key(HELD[at], down));
  }

  static void Run(string line) {
    string[] part = line.Trim().Split(' ');
    int[] n = new int[part.Length];
    for (int at = 1; at < part.Length; at++) n[at] = int.Parse(part[at]);
    switch (part[0]) {
      case "m": Send(Mouse(n[1], n[2], 0, 0)); break;
      case "d": Send(Mouse(n[1], n[2], LEFTDOWN, 0)); break;
      case "u": Send(Mouse(n[1], n[2], LEFTUP, 0)); break;
      case "c":
        Send(Mouse(n[1], n[2], n[3] == 1 ? RIGHTDOWN : LEFTDOWN, 0), Mouse(n[1], n[2], n[3] == 1 ? RIGHTUP : LEFTUP, 0));
        break;
      case "w":
        if (n[3] != 0) Send(Mouse(n[1], n[2], WHEEL, n[3]));
        if (n[4] != 0) Send(Mouse(n[1], n[2], HWHEEL, n[4]));
        break;
      case "k":
        Held(n[2], true);
        if (n[1] != 0) Send(Key(n[1], true), Key(n[1], false));
        else Send(Unit(n[3], true), Unit(n[3], false));
        Held(n[2], false);
        break;
      case "t":
        for (int at = 1; at < part.Length; at++) Send(Unit(n[at], true), Unit(n[at], false));
        break;
    }
  }

  public static void Listen() {
    try { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); } catch (EntryPointNotFoundException) { SetProcessDPIAware(); }
    string line;
    while ((line = Console.In.ReadLine()) != null) {
      try { Run(line); } catch (Exception) { }
    }
  }
}
'@
[GeckitHand]::Listen()
`

/** The arguments that start the script: encoded, so nothing in it is read by a shell on the way. */
export const windowsHandArgs = (): string[] => [
  '-NoLogo',
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-EncodedCommand',
  Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64'),
]

// Windows' virtual key codes. Letters, digits and the marks are found by their place on a US keyboard, so a shortcut such as Ctrl+C is the same in any layout, as the Mac's key codes are.
const NAMED: Readonly<Record<string, number>> = {
  return: 0x0d,
  tab: 0x09,
  space: 0x20,
  delete: 0x08,
  escape: 0x1b,
  forwardDelete: 0x2e,
  home: 0x24,
  end: 0x23,
  pageUp: 0x21,
  pageDown: 0x22,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
}
const MARKS: Readonly<Record<string, number>> = {
  ';': 0xba,
  '=': 0xbb,
  ',': 0xbc,
  '-': 0xbd,
  '.': 0xbe,
  '/': 0xbf,
  '`': 0xc0,
  '[': 0xdb,
  '\\': 0xdc,
  ']': 0xdd,
  "'": 0xde,
}

// On Windows the phone's keys read Ctrl, Alt, Shift and Win, and the one in Command's place is the Windows key, as a Mac keyboard on Windows has it.
const HELD: Readonly<Record<ScreenModifier, number>> = { control: 1, option: 2, shift: 4, command: 8 }

/** The line that presses a key with the keys held, or none for a key with no meaning here. */
export function keyLine(key: string, modifiers: readonly ScreenModifier[]): string | undefined {
  const held = modifiers.reduce((all, one) => all | HELD[one], 0)
  const named = NAMED[key]
  if (named !== undefined) return `k ${String(named)} ${String(held)}`
  if (key.length !== 1) return undefined
  const lower = key.toLowerCase()
  const code = lower >= 'a' && lower <= 'z' ? lower.toUpperCase().charCodeAt(0) : lower >= '0' && lower <= '9' ? lower.charCodeAt(0) : MARKS[lower]
  return code === undefined ? `k 0 ${String(held)} ${String(key.charCodeAt(0))}` : `k ${String(code)} ${String(held)}`
}

/** The line that types text as it is, whatever the layout: one UTF-16 unit at a time. */
export function typeLine(text: string): string | undefined {
  if (text === '') return undefined
  return `t ${Array.from({ length: text.length }, (_, at) => String(text.charCodeAt(at))).join(' ')}`
}

// A notch of the wheel is 120 and scrolls three lines; the Mac's scroll takes a line as ten points, so a point is four.
const PER_POINT = 4

/** How far the wheel turns for a scroll of so many points: up and left as the Mac's scroll takes them. */
export function wheelOf(dx: number, dy: number): { readonly vertical: number; readonly horizontal: number } {
  return { vertical: Math.round(dy * PER_POINT), horizontal: 0 - Math.round(dx * PER_POINT) }
}
