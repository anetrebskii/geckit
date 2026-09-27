# Contract: a run on a host

Everything GeckIt expects of a host, and everything it leaves there.

## Requirements on the host

- A POSIX `sh`, `mkfifo`, `nohup`, `tail` (with `-c +N -f`), `head -c`, `base64`, `date -r <file>`, and either `setsid` or `perl`.
- `claude` on `PATH`, or in `$HOME/.local/bin`, `$HOME/.claude/local`, `/opt/homebrew/bin`, `/usr/local/bin`.

## Files, per conversation

`~/.geckit/runs/<conversation id>/`

| File | Written by | Meaning |
|---|---|---|
| `in` | FIFO; GeckIt writes JSON lines | the stream-json input of `claude` |
| `out` | `claude` stdout, then the wrapper | stream-json output, then one `{"type":"geckit_exit","code":N}` |
| `err` | `claude` stderr | kept for the "What it said" of a failed run |
| `pid` | start script | the wrapper's pid, for `kill -0` and stopping |
| `seen` | GeckIt (`touch`) on attach and send | last time anyone was connected |

## Operations (one ssh command each)

| Operation | Script (see `run-script.ts`) | Output |
|---|---|---|
| start | makes the folder, FIFO, starts wrapper + reaper detached, writes `pid` | `started <pid>` |
| attach-out | `touch seen; tail -c +<offset+1> -f out` | the bytes of `out` from the offset, forever |
| attach-in | `cat > in` | nothing; stdin carries lines |
| alive | `kill -0 $(cat pid)` | exit status |
| stop | `kill $(cat pid)` and the process group | — |
| clean | `rm -rf ~/.geckit/runs/<id>` | — |

The claude command line is the local one (`-p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --permission-mode <m> --permission-prompt-tool stdio`, `--resume`/`--session-id`, `--model`, fork flags) without `--chrome`, under `env -u` the off-plan variables, run with the project's folder as working directory.
