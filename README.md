# Apple Notes MCP Server

MCP server that gives Claude (or any MCP client) read access to Apple Notes on macOS.

## Why

Apple Notes has no API. This server bridges that gap using AppleScript, so you can point Claude at your notes and get things like organizational analysis, content summaries, and structure recommendations — without manually copy-pasting.

Starting read-only to keep things simple and low-risk. Write operations (create notes, move between folders) are planned for v2 once the read experience proves useful.

## Data Model

Apple Notes has three concepts that look similar but behave differently:

- **Folder** — an actual container. A note lives in exactly one folder. Most users have a "Notes" folder per account (iCloud, Exchange, etc).
- **Tag** — metadata attached to a note via `#hashtag` in the note body. A note can have many tags.
- **Smart Folder** — a virtual view that filters notes by tag. Apple Notes creates one Smart Folder per tag. These show up in the folder list but are not containers — they are tag-based queries.

AppleScript's Notes API returns Smart Folders and real folders identically (both are `class:folder`). This server distinguishes them by checking whether a folder's first note actually lives in that folder (via the note's `container` property). If the note's container ID matches the folder ID, it's a real folder. If not, it's a Smart Folder (the note lives elsewhere but matches the tag filter).

Tags are not directly exposed on notes via AppleScript. The only way to determine a note's tags is to cross-reference Smart Folders: each Smart Folder corresponds to exactly one tag, so we check which Smart Folders contain each note.

## Tools

| Tool | Description | Input |
|------|-------------|-------|
| `list_folders` | List real folders (actual containers) with note counts | None |
| `list_tags` | List all tags with note counts (derived from Smart Folders) | None |
| `read_notes` | Read all notes from a real folder (title + plain text body + tags) | `folder` (string, required), `id` (string, optional) |

### Folder ID lookups

`list_folders` returns a unique `id` for each folder. You can pass this `id` to `read_notes` to target a specific folder. When `id` is provided it takes precedence over `folder` for the lookup, though `folder` is always required for human readability.

This matters when multiple folders share the same name. Apple Notes can store notes across multiple account backends — most commonly iCloud, but also Microsoft Exchange. Apple and Microsoft have a long-standing integration that allows Apple Notes to sync with Microsoft's Sticky Notes service via Exchange. If a user has both backends enabled, they'll have two folders named "Notes" (one per account) that are only distinguishable by ID.

### Tag resolution

When `read_notes` is called, the server automatically resolves tags for every note by:
1. Classifying all folders as real or Smart Folder
2. Building a tag map by checking which notes appear in each Smart Folder
3. Annotating each note with its tags from the map

This adds latency (one AppleScript call per phase). Timing telemetry is logged to stderr so the cost can be monitored.

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
