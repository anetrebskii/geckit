import { OFF_PLAN } from '../sessions/account'

/**
 * What GeckIt runs on a host, as `sh` scripts, written here and nowhere else.
 *
 * Every one is a plain string handed to `sh -s` on the host over ssh, built
 * from values that are quoted where they go in, so nothing the person typed
 * and nothing a folder is called is ever read by the host's shell as code.
 * They need only what every Linux and macOS has: `sh`, `mkfifo`, `nohup`,
 * `tail`, `head`, `base64`, `find`, `date`, and `setsid` or `perl`.
 */

/** A word for the host's shell, in single quotes, with any single quote in it closed, escaped and opened again. */
export const quote = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`

/** A conversation id, which names the folder its run is kept in: only what Claude Code's own ids are made of. */
export function safeId(id: string): string {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) throw new Error(`Not a conversation id: ${id}`)
  return id
}

/**
 * Where an installer puts `claude`, on the path of a command run over ssh, which
 * is not a login and may not have read the profile that adds them.
 */
const PATHS = '$HOME/.local/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin'

export const PREAMBLE = `PATH="${PATHS}:$PATH"; export PATH`

/** The folder a conversation's run is kept in on the host. */
const runDir = (id: string): string => `"$HOME/.geckit/runs/${safeId(id)}"`

/** The first line a reader prints, which is not part of the run's output. */
export const ATTACHED = '@@attached'

/** Twelve hours in minutes: a run nobody has looked at and that has said nothing for this long is stopped. */
export const IDLE_MINUTES = 12 * 60

/** How often the reaper looks, in seconds. */
const REAP_EVERY = 600

/**
 * Starts `claude` on the host apart from the connection, in its own session, so
 * the connection going, the laptop shutting or GeckIt quitting leave it running.
 *
 * Its input is a FIFO held open by the wrapper itself, so writers can come and
 * go without it ever reading an end; its output is appended to a file that is
 * read from any byte. When it exits, one line saying so is written after its
 * last, so whoever reads the file learns it in order.
 */
export function startScript(id: string, cwd: string, argv: readonly string[]): string {
  const dir = runDir(id)
  const unset = OFF_PLAN.map((name) => `-u ${name}`).join(' ')
  const command = argv.map(quote).join(' ')
  const wrapper = [
    'd="$1"',
    'echo $$ > "$d/pid"',
    'exec 3<>"$d/in"',
    // The reaper: nothing written by the run and nobody here for twelve hours, and it is stopped.
    `( while sleep ${String(REAP_EVERY)}; do if [ -z "$(find "$d" -maxdepth 1 \\( -name out -o -name seen \\) -mmin -${String(IDLE_MINUTES)} 2>/dev/null)" ]; then kill -TERM -- -$$ 2>/dev/null; kill -TERM $$ 2>/dev/null; exit 0; fi; done ) &`,
    'reaper=$!',
    `env ${unset} ${command} <"$d/in" >>"$d/out" 2>>"$d/err"`,
    'code=$?',
    'kill $reaper 2>/dev/null',
    `printf '{"type":"geckit_exit","code":%d}\\n' "$code" >>"$d/out"`,
  ].join('\n')
  return [
    PREAMBLE,
    'set -e',
    `d=${dir}`,
    'mkdir -p "$d"',
    'rm -f "$d/in" "$d/out" "$d/err" "$d/pid"',
    'mkfifo "$d/in"',
    ': > "$d/out"',
    'touch "$d/seen"',
    `cat > "$d/run.sh" <<'GECKIT_RUN'\n${wrapper}\nGECKIT_RUN`,
    `cd ${quote(cwd)}`,
    'if command -v setsid >/dev/null 2>&1; then',
    '  nohup setsid sh "$d/run.sh" "$d" </dev/null >/dev/null 2>&1 &',
    'else',
    `  nohup perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV' sh "$d/run.sh" "$d" </dev/null >/dev/null 2>&1 &`,
    'fi',
    // The pid is written by the wrapper itself, a moment after it starts.
    'n=0; while [ ! -s "$d/pid" ] && [ $n -lt 50 ]; do sleep 0.1; n=$((n+1)); done',
    'echo "started $(cat "$d/pid")"',
  ].join('\n')
}

/**
 * Reads what the run has written from a byte on, as it is written, until the
 * run ends or the connection does. A run that has gone without its last line
 * (killed, or the host restarted) is given one here, so the reader is never
 * left waiting on a file nobody writes.
 */
export function attachOutScript(id: string, offset: number): string {
  const from = String(Math.max(0, Math.floor(offset)) + 1)
  return [
    `d=${runDir(id)}`,
    `[ -f "$d/out" ] || { printf '{"type":"geckit_exit","code":-1}\\n'; exit 0; }`,
    'touch "$d/seen" 2>/dev/null',
    // Said before anything of the file, and not counted in it: the connection is up.
    `printf '${ATTACHED}\\n'`,
    'p=$(cat "$d/pid" 2>/dev/null)',
    'pp=$PPID',
    `tail -c +${from} -f "$d/out" & t=$!`,
    // While the run lives, the reader lives, and while the connection does; the first to go takes the other with it.
    'while kill -0 "$p" 2>/dev/null && kill -0 "$t" 2>/dev/null && kill -0 "$pp" 2>/dev/null; do sleep 1; touch "$d/seen" 2>/dev/null; done',
    'sleep 1',
    'kill "$t" 2>/dev/null',
    `grep -q '"type":"geckit_exit"' "$d/out" 2>/dev/null || printf '{"type":"geckit_exit","code":-1}\\n'`,
  ].join('\n')
}

/** Carries what is written to it into the run's input, for as long as it is written to. */
export function attachInScript(id: string): string {
  return [`d=${runDir(id)}`, '[ -p "$d/in" ] || exit 3', 'touch "$d/seen" 2>/dev/null', 'exec cat > "$d/in"'].join('\n')
}

/** Says `alive` or `gone`. */
export function aliveScript(id: string): string {
  return [`d=${runDir(id)}`, 'if kill -0 "$(cat "$d/pid" 2>/dev/null)" 2>/dev/null; then echo alive; else echo gone; fi'].join('\n')
}

/** Stops the run and everything it started, then throws its folder away. */
export function stopScript(id: string): string {
  return [
    `d=${runDir(id)}`,
    'p=$(cat "$d/pid" 2>/dev/null)',
    'if [ -n "$p" ]; then kill -TERM -- -"$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null; fi',
    'sleep 1',
    'rm -rf "$d"',
  ].join('\n')
}

/** Throws away the folder of a run that has ended. */
export function cleanScript(id: string): string {
  return `rm -rf ${runDir(id)}`
}

/** Claude Code's folder for conversations on the host, as the tool itself finds it. */
const PROJECTS = 'b="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"'

/** A folder name under the tool's projects, made of what its slugs are made of. */
const safeSlug = (slug: string): string => {
  if (!/^[A-Za-z0-9-]{1,400}$/.test(slug)) throw new Error(`Not a folder name: ${slug}`)
  return slug
}

/**
 * Every conversation file for a project, and for folders below and beside it,
 * one line each: the file from the projects folder, its size, and when it was
 * last written in seconds.
 */
export function listScript(slug: string): string {
  const own = safeSlug(slug)
  return [
    PROJECTS,
    'cd "$b" 2>/dev/null || exit 0',
    `for dir in ${own} ${own}-*; do`,
    '  [ -d "$dir" ] || continue',
    '  for f in "$dir"/*.jsonl; do',
    '    [ -f "$f" ] || continue',
    `    printf '%s\\t%s\\t%s\\n' "$f" $(wc -c <"$f") $(date -r "$f" +%s)`,
    '  done',
    'done',
  ].join('\n')
}

/** A file from the projects folder, as `listScript` names it: a slug, a slash, an id. */
export const safeFile = (file: string): string => {
  if (!/^[A-Za-z0-9-]{1,400}\/[A-Za-z0-9-]{1,80}\.jsonl$/.test(file)) throw new Error(`Not a conversation file: ${file}`)
  return file
}

/** How much of each end of a file a row is read from, as `disk.ts` reads a local one. */
export const EDGE = 64 * 1024

/**
 * The two ends of each file, for its row: `@@<file>`, the base64 of its first
 * part, `@@`, the base64 of its last part, `@@.`. A file no longer than both
 * ends is sent whole as the first part, with nothing as the last.
 */
export function edgesScript(files: readonly { readonly file: string; readonly size: number }[]): string {
  const lines = [PROJECTS, 'cd "$b" 2>/dev/null || exit 0']
  for (const one of files) {
    const file = safeFile(one.file)
    lines.push(`printf '@@%s\\n' ${quote(file)}`)
    if (one.size <= EDGE * 2) {
      lines.push(`base64 < ${quote(file)}`, `printf '@@\\n@@.\\n'`)
    } else {
      // Every slug starts with a dash, which head and tail would read as an option: the file is named from here.
      lines.push(`head -c ${String(EDGE)} ${quote(`./${file}`)} | base64`, `printf '@@\\n'`, `tail -c ${String(EDGE)} ${quote(`./${file}`)} | base64`, `printf '@@.\\n'`)
    }
  }
  return lines.join('\n')
}

/**
 * What a file has grown by since a byte, raw, after one line of its own,
 * `@@size <n>`, the file's size right now: smaller than the byte asked from
 * says the file was cut short or begun again on the host, rather than only
 * grown, so the mirror kept here is not simply carried on from stale bytes.
 */
export function growScript(file: string, from: number): string {
  const safe = safeFile(file)
  return [
    PROJECTS,
    `f="$b"/${quote(safe)}`,
    `[ -f "$f" ] || { printf '@@size 0\\n'; exit 0; }`,
    `printf '@@size %s\\n' "$(wc -c <"$f")"`,
    `tail -c +${String(Math.max(0, Math.floor(from)) + 1)} "$f"`,
  ].join('\n')
}

/** What `growScript` printed: the file's size on the host right now, and whatever grew past the byte asked from. */
export function readGrow(out: Buffer): { readonly size: number; readonly grown: Buffer } {
  const nl = out.indexOf(10)
  const head = (nl < 0 ? out : out.subarray(0, nl)).toString('utf8')
  const size = Number(/^@@size (\d+)$/.exec(head)?.[1] ?? 0)
  return { size, grown: nl < 0 ? Buffer.alloc(0) : out.subarray(nl + 1) }
}

/** Whether a file is there: prints `yes` or `no`. */
export function hasScript(file: string): string {
  return [PROJECTS, `if [ -f "$b"/${quote(safeFile(file))} ]; then echo yes; else echo no; fi`].join('\n')
}

/** Throws a conversation away, with the folder of its helpers beside it. */
export function deleteScript(file: string): string {
  const safe = safeFile(file)
  return [PROJECTS, `rm -f "$b"/${quote(safe)}`, `rm -rf "$b"/${quote(safe.slice(0, -'.jsonl'.length))}`].join('\n')
}

/**
 * One level of the host's folders: first the folder itself resolved, then one
 * line per folder in it, `1` or `0` for whether it holds a checkout, a tab, and
 * its name. A folder that is not there lists the home folder instead.
 */
export function foldersScript(path: string | undefined): string {
  return [
    path === undefined || path === '' ? 'cd "$HOME"' : `cd ${quote(path)} 2>/dev/null || cd "$HOME"`,
    'pwd -P',
    'echo "@os $(uname -s 2>/dev/null)"',
    'echo "@home $HOME"',
    'if [ -e .git ]; then echo "@git"; fi',
    'for e in * .[!.]*; do',
    '  [ -d "$e" ] || continue',
    '  if [ -e "$e/.git" ]; then g=1; else g=0; fi',
    `  printf '%s\\t%s\\n' "$g" "$e"`,
    'done',
  ].join('\n')
}

/** Where a folder is once its links are followed, or nothing where it is not a folder. */
export function resolveScript(path: string): string {
  return `cd ${quote(path)} 2>/dev/null && pwd -P`
}

/**
 * What GeckIt needs to know of a host before a conversation runs there: where
 * `claude` is, which version, and who is signed in, each after a marker line.
 */
export function checkScript(): string {
  return [
    PREAMBLE,
    `c=$(command -v claude) || { echo '@@missing'; exit 0; }`,
    'echo "@@path $c"',
    'echo "@@version"',
    '"$c" --version 2>/dev/null | head -1',
    'echo "@@auth"',
    '"$c" auth status 2>/dev/null',
    'echo "@@end"',
  ].join('\n')
}

/** What the check printed, read into its parts. */
export function readCheck(out: string): { readonly missing: boolean; readonly path?: string; readonly version?: string; readonly auth?: string } {
  if (out.includes('@@missing')) return { missing: true }
  const path = /^@@path (.+)$/m.exec(out)?.[1]?.trim()
  const version = /@@version\n([^\n]*)/.exec(out)?.[1]?.trim()
  const auth = /@@auth\n([\s\S]*?)\n?@@end/.exec(out)?.[1]?.trim()
  return {
    missing: false,
    ...(path === undefined ? {} : { path }),
    ...(version === undefined || version === '' ? {} : { version }),
    ...(auth === undefined || auth === '' ? {} : { auth }),
  }
}

/** Runs a command in a folder on the host, with a login shell's setup, as a `!` command runs here. */
export function shellScript(cwd: string, command: string): string {
  return [PREAMBLE, `cd ${quote(cwd)} || exit 1`, `exec "\${SHELL:-/bin/sh}" -lc ${quote(command)}`].join('\n')
}

/** The official installer of Claude Code, run on the host once the person has said so. */
export function installScript(): string {
  return [PREAMBLE, 'curl -fsSL https://claude.ai/install.sh | bash 2>&1'].join('\n')
}

/** Every file of a project, as paths from it, for @: git's list where it is a checkout, a bounded search otherwise. */
export function filesScript(cwd: string): string {
  return [
    `cd ${quote(cwd)} || exit 0`,
    'if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then git ls-files --cached --others --exclude-standard 2>/dev/null | head -20000',
    `else find . -maxdepth 6 \\( -name node_modules -o -name .git \\) -prune -o -type f -print 2>/dev/null | sed 's|^\\./||' | head -20000; fi`,
  ].join('\n')
}

/** A file's contents, at most a few megabytes of it, or `@@none` where it cannot be read. */
export function readFileScript(cwd: string, path: string): string {
  return [`cd ${quote(cwd)} 2>/dev/null || cd "$HOME"`, `f=${quote(path)}`, 'case "$f" in "~/"*) f="$HOME/${f#\\~/}";; esac', `if [ -f "$f" ]; then head -c 8388608 "$f"; else echo '@@none'; fi`].join('\n')
}

/** Prints `yes` or `no` for whether a path said in a conversation is there. */
export function existsScript(cwd: string, path: string): string {
  return [`cd ${quote(cwd)} 2>/dev/null || cd "$HOME"`, `f=${quote(path)}`, 'case "$f" in "~/"*) f="$HOME/${f#\\~/}";; esac', 'if [ -e "$f" ]; then echo yes; else echo no; fi'].join('\n')
}

/** Runs `claude` in a folder on the host for a short question, without the variables that take it off the plan. */
export function claudeHereScript(cwd: string, argv: readonly string[]): string {
  const unset = OFF_PLAN.map((name) => `-u ${name}`).join(' ')
  return [PREAMBLE, `cd ${quote(cwd)} || exit 1`, `exec env ${unset} ${argv.map(quote).join(' ')}`].join('\n')
}

/**
 * The end of what a task in the background printed, from where the tool on the
 * host writes it: the file it named, or its own folder in the host's temp
 * directory, as `tasks.ts` works it out here.
 */
export function taskOutputScript(cwd: string, session: string, task: string, file: string | undefined, most: number): string {
  if (file !== undefined) return `tail -c ${String(most)} ${quote(file)} 2>/dev/null`
  return [
    `b=$(cd "\${CLAUDE_CODE_TMPDIR:-/tmp}" && pwd -P)`,
    `r=$(cd ${quote(cwd)} 2>/dev/null && pwd -P)`,
    `s=$(printf '%s' "$r" | sed 's/[^A-Za-z0-9]/-/g')`,
    `tail -c ${String(most)} "$b/claude-$(id -u)/$s/${safeId(session)}/tasks/${safeId(task)}.output" 2>/dev/null`,
  ].join('\n')
}
