# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GeckIt is an Electron desktop application that provides a chat interface for AI language models (OpenAI and Anthropic). It's designed as a quick-access tool for text correction, translation, and general AI assistance.

## Repository Structure

- **`client/`**: Main Electron application (React + TypeScript + Material UI)
- **`site/`**: Marketing website (Next.js + Tailwind CSS) - separate project
- **Root `package.json`**: Contains only Firebase dependency for site deployment

## Build Commands

All commands are run from the `client/` directory:

```bash
cd client

# Development
npm run start          # Start development server (renderer at port 54113)

# Building
npm run build          # Build both main and renderer for production
npm run package        # Create distributable packages (dmg, exe, AppImage)

# Linting and Testing
npm run lint           # ESLint check
npm run test           # Run Jest tests
```

For the marketing site (`site/` directory):
```bash
cd site
npm run dev            # Next.js development server
npm run build          # Production build
```

## Architecture

### Electron Process Model

The app uses Electron's multi-process architecture:

1. **Main Process** (`client/src/main/main.ts`):
   - Creates browser window
   - Handles AI API calls to bypass CORS restrictions (Anthropic API doesn't support browser CORS)
   - Registers global shortcut `Cmd/Ctrl+C+D` to paste selected text into the app
   - Auto-updater integration

2. **Preload Script** (`client/src/main/preload.ts`):
   - Exposes `electron.ipcRenderer` for IPC communication
   - Exposes `electron.ai.chat()` to invoke AI from renderer

3. **Renderer Process** (`client/src/renderer/`):
   - React application with Material UI
   - Main entry: `App.tsx` → `main.tsx` → `workspace.tsx`

### AI Service Pattern

AI calls are routed through IPC to avoid CORS issues:
- Renderer: `client/src/renderer/services/ai_service.ts` - calls `window.electron.ai.chat()`
- Main: `client/src/main/ai_service.ts` - makes actual HTTP requests to OpenAI/Anthropic APIs

The context window is limited to 20 messages (sliding window) defined in the renderer ai_service.

### State Management

- User settings (API keys, language preferences) stored in `localStorage` via `user_context.ts`
- Chat history stored in `localStorage` with key `geckit-chats`

## Key Files

- `client/src/renderer/workspace.tsx`: Main chat UI with sidebar, message list, and input
- `client/src/renderer/services/ai_service.ts`: Model definitions, provider configuration
- `client/src/main/ai_service.ts`: OpenAI/Anthropic SDK calls

## CI/CD

GitHub Actions workflow (`.github/workflows/publish.yml`) builds and publishes releases for macOS, Windows, and Linux on push to `main` when files in `client/` change.

## Notes

- Requires Node.js 18+ and npm 8.7.0+ (for package.json overrides)
- Uses electron-react-boilerplate as foundation (see `client/.erb/` directory)
- macOS users may need to run `xattr -d com.apple.quarantine /Applications/GeckIt.app` after installation
