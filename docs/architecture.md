# Architecture — Apple Notes MCP Server

## Purpose
MCP server that gives Claude access to Apple Notes on macOS via AppleScript.

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
- No user input is interpolated into AppleScript. Folder names and note IDs are passed as arguments to `osascript`, not string-concatenated into scripts.
- No network access. All data stays local.
- Note content updates (`set body`) are deliberately not exposed — see [data-model.md](data-model.md) for why.
