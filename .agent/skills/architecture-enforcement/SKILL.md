---
name: architecture-enforcement
description: Enforces strict naming conventions and process boundary constraints for the Sxentrie Local-First Electron Application
---

# Sxentrie Architectural Naming Conventions & Process Guardrails

When working within this local-first Electron application, you MUST explicitly adhere to these structural constraints and architectural boundaries to prevent sandbox violations and build failures.

## 1. Strict Naming Conventions

- **Directories:** Must use `kebab-case` (e.g., `local-data`, `feature-modules`).
- **React Components:** Must use `PascalCase.tsx` (e.g., `ChatThread.tsx`, `TaskGraph.tsx`). This signals that the file exports a React functional component and is strictly bound to the Renderer process.
- **TypeScript / Node Logic:** Must use `camelCase.ts` (e.g., `vectorSearch.ts`, `shellExecutor.ts`).
- **Zod Schemas:** Must be suffixed with `Schema` (e.g., `chatPayloadSchema.ts`) to easily distinguish runtime boundary validation structures from pure TypeScript type definitions.

## 2. The Tri-Surface Process Separation

Electron demands absolute isolation between domains. You must never mix backend file-system logic with visual rendering code.

- THE MAIN PROCESS (`src/main/`): Powered by Node.js. Holds authority over the OS, Native Modules (LanceDB), file system, and raw tool execution. Visual rendering or DOM references MUST NEVER touch this process.
- THE SECURITY BRIDGE (`src/preload/`): Executes prior to React. Has strict context isolation. Preload scripts serve exclusively to map Context Bridge APIs (like IPC handlers) between the unsafe Renderer and the secure Main system.
- THE RENDERER PROCESS (`src/renderer/`): The sandboxed Visual Sandbox (React/Chromium). `nodeIntegration` is entirely disabled. Renderer code is FORBIDDEN from attempting to `import fs`, `path`, or local LanceDB queries directly. All state queries must rely strictly on serialized payloads passed over the Preload exposed `window` bridges.
