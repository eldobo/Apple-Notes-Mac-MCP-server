# Architecture — Apple Notes MCP Server

## Purpose
MCP server that gives Claude access to Apple Notes on macOS. The long-term goal is a full-lifecycle Notes companion — but we're building incrementally:

1. **v1 (now):** Read-only. List folders, read notes. Use this to analyze existing Notes and recommend an organizational structure.
2. **v2:** Write operations. Create notes and folders, move notes between folders — making it easy to act on the organizational recommendations from v1.
3. **Beyond:** Search, tagging, templates, and whatever else emerges from real usage.

Starting read-only keeps risk low while delivering immediate value: point Claude at your Notes, get actionable structure advice, then build the tools to execute on it.

## Scope (v1)
Two tools, both read-only:

### `list_folders`
- **Input:** None
- **Output:** Array of folder objects: `{ name: string, id: string, noteCount: number }`
- **Behavior:** Returns all top-level folders visible in Apple Notes. Nested folders are not in scope for v1.

### `read_notes`
- **Input:** `{ folder: string }` — folder name to read from
- **Output:** Array of note objects: `{ title: string, body: string, createdAt: string, modifiedAt: string }`
- **Behavior:** Returns all notes in the specified folder. `body` is plain text (HTML stripped). Returns an error if the folder doesn't exist.

## Technical Approach

### Apple Notes Access
- Apple Notes has no public API. Access is via **AppleScript** executed from Node.js using `osascript`.
- Each tool calls a focused AppleScript snippet via `child_process.execFile`.
- AppleScript returns JSON-formatted strings, parsed in TypeScript.

### Stack
- **Runtime:** Node.js + tsx (TypeScript executed directly, no compile step)
- **Framework:** `@modelcontextprotocol/sdk` (MCP server SDK)
- **Validation:** `zod` (tool input schemas)
- **Apple Notes bridge:** `osascript` subprocess calls

### Project Structure
```
src/
  index.ts          — MCP server setup, tool registration, entry point
  applescript.ts    — AppleScript execution helper + script definitions
```

### Error Handling
- AppleScript failures (e.g., Notes not running, permission denied) return MCP tool errors with descriptive messages.
- Invalid folder names return a tool error, not a crash.

## Security
- Read-only — no write operations on Notes data.
- No user input is interpolated into AppleScript. Folder names are passed as arguments to `osascript`, not string-concatenated into scripts.
- No network access. All data stays local.

## Not in Scope (v1)
- Write/create/delete notes
- Nested folder hierarchy
- Note attachments or images
- Search across all folders
- Authentication (runs locally, inherits macOS user permissions)
