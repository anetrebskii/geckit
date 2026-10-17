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
 * unit` presses the key that types one character, and `t unit...` types text.
 *
 * It says `ready` once it can work, and what goes wrong on its error output,
 * which the main process logs and the phone is told when it stops it working.
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
  [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "VkKeyScanExW")] static extern short VkKeyScanEx(char unit, IntPtr layout);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, IntPtr process);
  [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint thread);
  [DllImport("user32.dll", SetLastError = true)] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  const uint MOVE = 0x1, LEFTDOWN = 0x2, LEFTUP = 0x4, RIGHTDOWN = 0x8, RIGHTUP = 0x10;
  const uint WHEEL = 0x800, HWHEEL = 0x1000, VIRTUALDESK = 0x4000, ABSOLUTE = 0x8000;
  const uint EXTENDED = 0x1, KEYUP = 0x2, UNICODE = 0x4;
  static readonly ushort[] HELD = { 0x11, 0x12, 0x10, 0x5B };
  static bool blocked = false;

  static void Send(params Input[] inputs) {
    uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
    // Nothing goes in while a window run as administrator, or the UAC prompt, has the input; said once until it goes in again.
    if (sent == 0 && !blocked) Console.Error.WriteLine("SendInput was refused: " + Marshal.GetLastWin32Error());
    blocked = sent == 0;
  }

  // Windows takes an absolute point as 0..65535 over the whole desktop and turns it back with n * size / 65536, so it is rounded up to land on the pixel meant.
  static int Scaled(int at, int size) { return Math.Min(65535, (int)Math.Ceiling(at * 65536.0 / size)); }

  static Input Mouse(int x, int y, uint flags, int data) {
    int left = GetSystemMetrics(76), top = GetSystemMetrics(77);
    int wide = Math.Max(1, GetSystemMetrics(78)), high = Math.Max(1, GetSystemMetrics(79));
    Input one = new Input { type = 0 };
    one.u.mouse.dx = Scaled(x - left, wide);
    one.u.mouse.dy = Scaled(y - top, high);
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

  static void Need(string[] part, int count) {
    if (part.Length < count) throw new ArgumentException("a short line: " + string.Join(" ", part));
  }

  static void Run(string line) {
    string[] part = line.Trim().Split(' ');
    int[] n = new int[part.Length];
    for (int at = 1; at < part.Length; at++) n[at] = int.Parse(part[at]);
    switch (part[0]) {
      case "m": Need(part, 3); Send(Mouse(n[1], n[2], 0, 0)); break;
      case "d": Need(part, 3); Send(Mouse(n[1], n[2], LEFTDOWN, 0)); break;
      case "u": Need(part, 3); Send(Mouse(n[1], n[2], LEFTUP, 0)); break;
      case "c":
        Need(part, 4);
        Send(Mouse(n[1], n[2], n[3] == 1 ? RIGHTDOWN : LEFTDOWN, 0), Mouse(n[1], n[2], n[3] == 1 ? RIGHTUP : LEFTUP, 0));
        break;
      case "w":
        Need(part, 5);
        if (n[3] != 0) Send(Mouse(n[1], n[2], WHEEL, n[3]));
        if (n[4] != 0) Send(Mouse(n[1], n[2], HWHEEL, n[4]));
        break;
      case "k": {
        Need(part, n.Length > 1 && n[1] == 0 ? 4 : 3);
        int vk = n[1], held = n[2];
        if (vk == 0) {
          // A character a key types in the layout of the window in front goes as that key, so Ctrl with it is a shortcut; one no key types goes as itself.
          IntPtr layout = GetKeyboardLayout(GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero));
          short found = VkKeyScanEx((char)n[3], layout);
          if (found != -1 && (found & 0x600) == 0) {
            vk = found & 0xFF;
            if ((found & 0x100) != 0) held |= 4;
          }
        }
        Held(held, true);
        try {
          if (vk != 0) Send(Key(vk, true), Key(vk, false));
          else Send(Unit(n[3], true), Unit(n[3], false));
        } finally {
          Held(held, false);
        }
        break;
      }
      case "t":
        for (int at = 1; at < part.Length; at++) Send(Unit(n[at], true), Unit(n[at], false));
        break;
      default:
        throw new ArgumentException("an unknown line: " + line);
    }
  }

  public static void Listen() {
    bool aware;
    try { aware = SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) { aware = SetProcessDPIAware(); }
    // Not aware, the desktop is measured at the main screen's scale, and the pointer misses on a screen scaled otherwise.
    if (!aware) Console.Error.WriteLine("The scale of each screen could not be had: " + Marshal.GetLastWin32Error());
    Console.Out.WriteLine("ready");
    string line;
    while ((line = Console.In.ReadLine()) != null) {
      try { Run(line); } catch (Exception error) { Console.Error.WriteLine(error.Message); }
    }
  }
}
'@
[GeckitHand]::Listen()
`

/** Windows' own PowerShell, by its whole path, so a PATH that has lost it, or holds another, changes nothing. */
export const powershellPath = (systemRoot: string | undefined): string =>
  `${systemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`

/** The arguments that run the script from its file: a script run as a file is what antivirus and policy expect of a program, where an encoded command looks like an attack. */
export const windowsHandArgs = (file: string): string[] => ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file]

// Windows' virtual key codes. Letters, digits and the marks are found by the keys of a US keyboard, so a shortcut such as Ctrl+C is the same in any layout, as the Mac's key codes are.
const NAMED: ReadonlyMap<string, number> = new Map([
  ['return', 0x0d],
  ['tab', 0x09],
  ['space', 0x20],
  ['delete', 0x08],
  ['escape', 0x1b],
  ['forwardDelete', 0x2e],
  ['home', 0x24],
  ['end', 0x23],
  ['pageUp', 0x21],
  ['pageDown', 0x22],
  ['left', 0x25],
  ['up', 0x26],
  ['right', 0x27],
  ['down', 0x28],
])
const MARKS: ReadonlyMap<string, number> = new Map([
  [';', 0xba],
  ['=', 0xbb],
  [',', 0xbc],
  ['-', 0xbd],
  ['.', 0xbe],
  ['/', 0xbf],
  ['`', 0xc0],
  ['[', 0xdb],
  ['\\', 0xdc],
  [']', 0xdd],
  ["'", 0xde],
])

// On Windows the phone's keys read Ctrl, Alt, Shift and Win, and the one in Command's place is the Windows key, as a Mac keyboard on Windows has it.
const HELD: Readonly<Record<ScreenModifier, number>> = { control: 1, option: 2, shift: 4, command: 8 }

/** The line that presses a key with the keys held, or none for a key with no meaning here. */
export function keyLine(key: string, modifiers: readonly ScreenModifier[]): string | undefined {
  const held = modifiers.reduce((all, one) => all | (Object.hasOwn(HELD, one) ? HELD[one] : 0), 0)
  const named = NAMED.get(key)
  if (named !== undefined) return `k ${String(named)} ${String(held)}`
  if (key.length !== 1) return undefined
  const lower = key.toLowerCase()
  const code = lower >= 'a' && lower <= 'z' ? lower.toUpperCase().charCodeAt(0) : lower >= '0' && lower <= '9' ? lower.charCodeAt(0) : MARKS.get(lower)
  return code === undefined ? `k 0 ${String(held)} ${String(key.charCodeAt(0))}` : `k ${String(code)} ${String(held)}`
}

/** The line that types text as it is, whatever the layout: one UTF-16 unit at a time. */
export function typeLine(text: string): string | undefined {
  if (text === '') return undefined
  return `t ${Array.from({ length: text.length }, (_, at) => String(text.charCodeAt(at))).join(' ')}`
}

// A notch of the wheel is 120 and scrolls three lines; the Mac's scroll takes a line as ten points, so a point is four.
const PER_POINT = 4
const NOTCH = 120

/**
 * How far the wheel turns for a scroll of so many points, up and left as the
 * Mac's scroll takes them, in whole notches: older programs take any turn as a
 * notch, so what is left over waits for the next scroll.
 */
export function wheel(): (dx: number, dy: number) => { readonly vertical: number; readonly horizontal: number } {
  let left = { vertical: 0, horizontal: 0 }
  return (dx, dy) => {
    const vertical = left.vertical + dy * PER_POINT
    const horizontal = left.horizontal - dx * PER_POINT
    const whole = (value: number): number => Math.trunc(value / NOTCH) * NOTCH
    left = { vertical: vertical - whole(vertical), horizontal: horizontal - whole(horizontal) }
    return { vertical: whole(vertical) + 0, horizontal: whole(horizontal) + 0 }
  }
}
