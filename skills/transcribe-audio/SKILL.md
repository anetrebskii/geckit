---
name: transcribe-audio
description: Transcribe speech in audio or video files locally using GeckIt's bundled Whisper. Use when asked for a transcript, timestamped text or subtitles from a recording.
---

# Transcribe audio with GeckIt

## Purpose

Turn a recording into text on the computer running the conversation. Use GeckIt's Whisper executable and cached model. Keep the media local.

## Inputs

Use the attached or named file. Confirm it is readable on this computer before running Whisper. Use the requested spoken language or ask Whisper to detect it. Default to a transcript in the spoken language.

## Work

1. This GeckIt installation uses `{{whisperExecutable}}` and expects its model at `{{speechModelFile}}`. Check both paths. If the executable is shown as a bare command, confirm it resolves to the Whisper executable provisioned for this GeckIt host.
2. Pass WAV, FLAC, MP3 or Ogg audio directly. For a video or an input Whisper cannot decode, use an available local converter. With FFmpeg, create a temporary 16 kHz mono PCM WAV using `ffmpeg -n -i "$input" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$wav"`. Use a fresh temporary directory and preserve the original.
3. Run the following with the executable, model and audio paths in the variables. In PowerShell, put `&` before `"$whisper"` when invoking it. Set `$language` to `auto` or the spoken language code. Use `-tr` only for a requested translation to English.

   ```sh
   "$whisper" -m "$model" -f "$audio" -l "$language" -np -nt
   ```

4. Omit `-nt` for timestamped text. For a file, use `-otxt`, `-osrt` or `-ovtt` with `-of "$outputBase"`. The base is the destination without its extension. Check that the destination is free before writing unless the person asked to replace it. On a headless host, add `-ng` to run on CPU. On desktop, retry with `-ng` if GPU initialization fails or stalls.

## Unknowns

Ask for the file or a local copy if the recording is missing or inaccessible. If the executable or model is missing, name the missing path and the computer. On desktop, the first transcription in Transcribe downloads the model. On a headless service, the operator must provision the bundled executable and cached model for the service account. Report a missing converter and the affected input. Use local conversion and transcription only.

## Output

Return the transcript or the requested file link. Preserve the spoken wording and mark unclear passages when identifiable. Omit Whisper's `[BLANK_AUDIO]` markers from plain text. Remove temporary conversions after verification.

## Verification

Check that Whisper completed and produced speech text or identify that no speech was recognized. For saved output, open the requested file and check its contents. For subtitles, check that cues have ordered timestamps within the recording. Report any failed or incomplete inputs.
