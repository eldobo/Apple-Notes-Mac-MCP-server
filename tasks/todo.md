# Correct data model: separate folders from tags/smart folders

## Investigation Summary
AppleScript's Notes API returns Smart Folders (tag-based views) and real folders
identically — both return `class:folder`. There is no tag property on notes.
Tags only exist in the HTML body as inline hashtags. A note's `container` always
points to its real folder, not any Smart Folder it appears in.

## Data Model
- **Folder**: actual container. A note lives in exactly one folder.
- **Tag**: `#hashtag` in note body. A note can have multiple tags.
- **Smart Folder**: Apple Notes UI concept — a virtual view filtering by tag.
  AppleScript exposes these as `folder` objects but they are not containers.

## Approach
`read_notes` only operates on real folders. Tags are parsed from note HTML and
returned per note. Callers filter by tag client-side. No need to read through
Smart Folders — every note lives in a real folder.

Smart folder detection: for each folder, check if the first note's `container`
ID matches the folder ID. If yes → real folder. If no → smart folder (tag view).

## Tool Design
| Tool | Description | Returns |
|------|-------------|---------|
| `list_folders` | List real folders (actual containers) | `{name, id, account, noteCount}[]` |
| `list_tags` | List all tags with note counts | `{name, noteCount}[]` |
| `read_notes` | Read all notes from a real folder | `{title, body, tags[], createdAt, modifiedAt}[]` |

`read_notes` keeps `folder` (required) and `id` (optional) params — now always
referring to actual folders.

## Plan

- [x] **1. Update README** — Document data model, 3 tools, tag cross-referencing
- [x] **2. Update tests/applescript.test.ts** — classifyFolders, listTags, buildTagMap, updated readNotes
- [x] **3. Update tests/server.test.ts** — list_tags tool, 3-tool discovery, updated response shapes
- [x] **4. Implement src/applescript.ts** — CLASSIFY_FOLDERS_SCRIPT, BUILD_TAG_MAP_SCRIPT, tag pipeline
- [x] **5. Implement src/index.ts** — Register list_tags, update descriptions
- [x] **6. Run tests** — 30/30 passing
- [x] **7. Manual validation via MCP tools**

## Review/Results

All passing:
- `list_folders` → Notes (iCloud), Notes (Exchange), Recently Deleted — smart folders filtered out
- `list_tags` → 8 tags with correct counts (Covered calls, Medical, Owen, Podcasts, Quotes, Reflections, REI, Retirement)
- `read_notes` → notes include `id` and `tags[]`, multi-tag annotation works ("Acquired: Visa episode" → ["Podcasts", "Quotes"])
- Verified "Owen - Mar 8, 2026" has `tags: ["Owen"]`
- 30/30 unit tests pass

### Lesson learned
AppleScript quirk: `id of container of note` throws error -1728, but `id of (get container of note)` works. The `get` forces resolution of the container reference before accessing its id.
