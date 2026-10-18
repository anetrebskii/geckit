# Working the Mac from the phone

Opened from the screen button on the board or in a conversation's header. The reason to open it is usually that Claude asked for something only a person at the Mac can do: allow a permission, press a button in a browser, type a code.

## What was wrong with tapping where the thing is

The Mac's screen drawn 390 points wide is about a quarter of its size. A button is a few points across and under a fingertip, so a tap lands beside it, and zooming in to hit it means losing the rest of the screen. In landscape the bar sat over the top of the picture, where the menu bar and the browser's tabs are.

## The model: a trackpad, as Jump Desktop and Screens do it

- One finger moves the Mac's own pointer, from wherever it is. Slow is exact, quick goes far.
- A tap clicks where the pointer is; two taps double click, three select a line.
- Hold for a moment (the phone taps back), then drag: selects text, moves a window, drags a file. Lifting lets go.
- Two fingers scroll the Mac. A two-finger tap is the right click.
- A pinch zooms the picture. Zoomed in, the picture follows the pointer so it never goes off the edge.

The pointer on screen is the Mac's own, in the picture, so what is seen is what the Mac will click.

## Look and Control

A switch in the top bar. Look is the old way to read the screen without touching it: drag moves over it, double tap zooms. The choice is remembered.

## The bars

Above and below the picture, not over it. The top bar has Look / Control, a button that hides both bars (a small button in the corner brings them back), and Done.

In Control the bottom bar has the keyboard button and the keys a phone's keyboard lacks: ⌘ ⌥ ⌃ ⇧, esc, tab and the arrows. A modifier pressed stays down for the next key, so ⌘ then C is Command-C, and it lights while it waits. With the keyboard up the row sits on top of it.

## The first time

A line under the picture says how the trackpad is worked and goes at the first touch. If the Mac has not allowed GeckIt under Accessibility, the line over the picture says where to allow it.

## Windows helper failures

If Windows blocks or cannot start the input helper three times within five seconds of each start, Control reports "Windows would not let GeckIt use the mouse and keyboard", followed by the helper's last error when available. Spawn errors count once, just as early process exits do. Touches during the next minute report that error without starting another helper; the first action after the minute tries again. Three failures allow a transient failure to recover, while the one-minute pause prevents every touch from restarting a blocked helper. A ready helper clears the earlier failure count. Screen viewing remains available.
