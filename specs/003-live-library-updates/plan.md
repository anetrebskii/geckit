# Implementation Plan

## Runtime

Add a single-library apply operation with staged identity validation, cache-busted module loading, backup rollback, and active-provider replacement. Pin providers per live session and defer active-session handoff until the next message.

## Desktop bridge and UI

Expose a narrow IPC method, update persisted provider metadata and ready IDs after successful activation, and add per-row progress, failure, and success-focus behavior. Keep the phone surface explicit that updates are computer-only.

## UX and verification

Update the provider libraries UX and feature audit. Typecheck and lint changed code. Run GeckIt and review the actual Settings preview in light/dark themes, including keyboard focus, scrolling, and narrow desktop viewport.
