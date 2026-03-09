# Apple Notes MCP Server

MCP server that gives Claude (or any MCP client) read access to Apple Notes on macOS.

## Why

Apple Notes has no API. This server bridges that gap using AppleScript, so you can point Claude at your notes and get things like organizational analysis, content summaries, and structure recommendations — without manually copy-pasting. AppleScript is macOS-only, so this server requires a Mac.

## Data Model

Apple Notes has three concepts that look similar but behave differently:

- **Folder** — an actual container. A note lives in exactly one folder.
- **Tag** — metadata via `#hashtag` in the note body. A note can have many tags.
- **Smart Folder** — a virtual view that filters by tag. Not a container — Apple Notes creates one automatically per tag.

AppleScript returns all three as `class:folder` with no way to tell them apart, and doesn't expose tags on notes. This server detects Smart Folders via container ID comparison and resolves tags by cross-referencing which notes appear in each Smart Folder.

See [docs/data-model.md](docs/data-model.md) for the full details: AppleScript quirks, detection algorithm, tag resolution pipeline, and delimiter protocol.

## Tools

| Tool | Description | Input |
|------|-------------|-------|
| `list_folders` | List real folders (actual containers) with note counts | None |
| `list_tags` | List all tags with note counts (derived from Smart Folders) | None |
| `read_notes` | Read all notes from a real folder (id, title, body, tags, timestamps) | `folder` (string, required), `id` (string, optional) |
| `create_note` | Create a new note in a folder | `folder` (string, required), `title` (string, required), `body` (string, optional), `id` (string, optional folder ID) |
| `delete_note` | Delete a note by ID | `noteId` (string, required) |
| `move_note` | Move a note to a different folder | `noteId` (string, required), `folder` (string, required), `id` (string, optional folder ID) |
| `update_note` | Update a note's body (HTML) | `noteId` (string, required), `body` (string, required) |

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

- macOS (this server uses AppleScript, which is macOS-only)
- Node.js 18+
- First run will prompt for Automation permission to access Notes
