# Apple Notes MCP Server

MCP server that gives Claude (or any MCP client) read access to Apple Notes on macOS.

## Why

Apple Notes has no API. This server bridges that gap using AppleScript, so you can point Claude at your notes and get things like organizational analysis, content summaries, and structure recommendations — without manually copy-pasting.

Starting read-only to keep things simple and low-risk. Write operations (create notes, move between folders) are planned for v2 once the read experience proves useful.

## Tools

| Tool | Description | Input |
|------|-------------|-------|
| `list_folders` | List all folders with note counts | None |
| `read_notes` | Read all notes from a folder (title + plain text body) | `folder` (string, required), `id` (string, optional) |

### Folder ID lookups

`list_folders` returns a unique `id` for each folder. You can pass this `id` to `read_notes` to target a specific folder. When `id` is provided it takes precedence over `folder` for the lookup, though `folder` is always required for human readability.

This matters when multiple folders share the same name. Apple Notes can store notes across multiple account backends — most commonly iCloud, but also Microsoft Exchange. Apple and Microsoft have a long-standing integration that allows Apple Notes to sync with Microsoft's Sticky Notes service via Exchange. If a user has both backends enabled, they'll have two folders named "Notes" (one per account) that are only distinguishable by ID.

## Setup

```bash
npm install
```

### Add to Claude Code

```bash
claude mcp add apple-notes -- npx tsx /path/to/Apple-Notes-Mac-MCP-server/src/index.ts
```

### Test with MCP Inspector

```bash
npm run inspector
```

Opens a browser UI at `http://localhost:6274` where you can test tools interactively.

## Development

```bash
npm test          # run tests
npm start         # start the server (stdio transport)
npm run inspector # test in browser
```

## Requirements

- macOS (Apple Notes is mac-only)
- Node.js 18+
- First run will prompt for Automation permission to access Notes
