# Apple Notes Data Model

How Apple Notes organizes data internally, what AppleScript exposes, and how this server bridges the gaps.

## Concepts

### Folders

A folder is a container. A note lives in exactly one folder. Most users have a default "Notes" folder per account backend.

Folders are the primary organizational unit. Notes cannot exist outside a folder.

### Tags

A tag is metadata attached to a note. A note can have zero or many tags. Tags can be created by typing `#hashtag` in the note body or by using the tag picker in the Apple Notes UI. These two methods store the tag differently — typed tags appear as text in the HTML body, while UI-applied tags are stored as internal metadata only (see [Tag Management — Known Limitations](#tag-management--known-limitations)).

### Smart Folders

A Smart Folder is a virtual view — a saved query that filters notes by tag. Apple Notes creates exactly one Smart Folder per tag, automatically. Smart Folders are not containers; the notes they display still live in their real folders.

In the Apple Notes UI, Smart Folders appear in the sidebar alongside real folders with a gear icon. There is no way for a user to manually create or delete a Smart Folder — they are a side effect of tag usage.

### Accounts

Apple Notes supports multiple account backends. The most common are:

- **iCloud** — the default. Notes sync across Apple devices.
- **Microsoft Exchange** — Apple and Microsoft have a long-standing integration that syncs Apple Notes with Microsoft's Sticky Notes service via Exchange. If a user has Exchange configured in System Settings, they'll get a second set of folders.

Each account has its own folder hierarchy. This means a user can have two folders named "Notes" (one iCloud, one Exchange) that are only distinguishable by their internal ID.

## What AppleScript Exposes

Apple Notes has an AppleScript dictionary (`Notes.sdef`) that exposes:

| Object | Properties | Notes |
|--------|-----------|-------|
| `account` | `name`, `id` | The backend (iCloud, Exchange, etc.) |
| `folder` | `name`, `id`, `container`, `shared` | Both real folders AND Smart Folders are returned as `class:folder` |
| `note` | `name`, `id`, `body`, `plaintext`, `creation date`, `modification date`, `container` | `container` always points to the note's real folder |

### What AppleScript Does NOT Expose

- **Tags on a note** — there is no `tags` property. Tags exist as `#hashtag` text in the note body (if typed) or as internal metadata (if applied via UI). Both types surface through Smart Folders.
- **Tag write support** — `set body` with `#hashtag` text does not create tags. Tags are only recognized when typed interactively in the Apple Notes editor. Cross-account `move` also fails (error -10000).
- **Smart Folder flag** — there is no property to distinguish a Smart Folder from a real folder. Both are `class:folder`.
- **Account on a folder** — while accounts exist as objects, there's no direct way to get a folder's account without traversing the hierarchy.

## How This Server Bridges the Gaps

### Smart Folder Detection

Since AppleScript doesn't flag Smart Folders, we detect them by checking containment:

1. For each folder, look at its first note
2. Get the note's `container` (the real folder it lives in)
3. Compare the container's ID to the folder's ID
4. If they match → real folder. If they differ → Smart Folder (the note lives elsewhere)
5. Empty folders (no notes) are treated as real folders

This works because a Smart Folder's notes always live in their real folders — the Smart Folder just displays them as a filtered view.

**AppleScript quirk**: `id of container of note` throws error -1728. You must use `id of (get container of note)` instead. The `get` forces AppleScript to resolve the container reference to a concrete folder object before accessing its `id` property.

### Tag Resolution

Since tags aren't exposed as note properties, we derive them by cross-referencing Smart Folders:

1. **Classify** all folders as real or Smart Folder (one AppleScript call)
2. **Build a tag map** — for each Smart Folder, get all note IDs it contains. Invert this to a `Map<noteId, tagName[]>` (one AppleScript call)
3. **Read notes** from the target folder (one AppleScript call)
4. **Annotate** each note with its tags from the map

This requires 3 AppleScript calls per `read_notes` invocation. Timing telemetry is logged to stderr so the latency cost can be monitored:

```
[apple-notes] classifyFolders: 342ms
[apple-notes] buildTagMap (8 smart folders): 1623ms
[apple-notes] readNotes: 6412ms
[apple-notes] readNotes total: 8377ms
```

### Delimiter Protocol

AppleScript's string handling is fragile — JSON construction with string concatenation breaks on special characters in note content. Instead, we use ASCII control characters as delimiters:

| Character | Code | Name | Used For |
|-----------|------|------|----------|
| `\x1D` | 29 | GS (Group Separator) | Between Smart Folders in tag map output |
| `\x1E` | 30 | RS (Record Separator) | Between records (folders, notes) |
| `\x1F` | 31 | US (Unit Separator) | Between fields within a record |

These characters don't appear in normal note content, making the parsing reliable without escaping.

## Write Operations

### Writable vs Read-Only Properties

| Property | Writable | Notes |
|----------|----------|-------|
| `name` (title) | Yes | Set via `make new note with properties {name:...}` or implicitly from first line of body |
| `body` | Yes | HTML content. First line becomes the title. Apple reprocesses HTML on write (not lossless round-trip). |
| `id` | No | Assigned by Apple Notes on creation |
| `container` | No | Changed via `move` command, not direct property assignment |
| `plaintext` | No | Derived from body by Apple Notes |
| `creation date` | No | Set automatically on creation |
| `modification date` | No | Updated automatically on any change |

### Creating Notes

```applescript
tell application "Notes"
  make new note at folder "FolderName" with properties {name:"Title", body:"<html>..."}
end tell
```

Returns the new note object. The `body` property accepts HTML. The first line of content becomes the note's `name` (title).

### Updating Notes

```applescript
tell application "Notes"
  set body of note id "noteId" to "<html>..."
end tell
```

Apple Notes reprocesses HTML on write — the HTML you read back may differ structurally from what you wrote, though the rendered content should be equivalent.

### Moving Notes

```applescript
tell application "Notes"
  move note id "noteId" to folder "TargetFolder"
end tell
```

Moves a note from its current folder to the target folder. The note's `container` property updates to reflect the new folder.

### Deleting Notes

```applescript
tell application "Notes"
  delete note id "noteId"
end tell
```

Permanently deletes the note. Moves to the "Recently Deleted" folder in Apple Notes (recoverable for 30 days via the UI).

**Safety**: Never delete the default "Notes" folder — Apple Notes requires at least one folder per account.

### Tag Management — Known Limitations

Tags in Apple Notes have a critical distinction based on how they were created:

1. **Typed in the editor**: When a user types `#tagname` in the Apple Notes app, the tag text is stored in the HTML body and Apple Notes recognizes it as a tag. These tags can be found and modified via `set body`.

2. **Applied via the UI tag picker**: When a user applies a tag through the Apple Notes tag picker (without typing `#` in the body), the tag is stored as internal metadata — it does **not** appear in the HTML body at all.

**What works via AppleScript:**
- Reading which notes have which tags (via Smart Folder cross-referencing)
- Modifying tags that exist as `#text` in the note body (find/replace via `set body`)

**What does NOT work via AppleScript:**
- **Adding tags**: Setting `body` to HTML containing `#tagname` does not create a tag. Apple Notes only recognizes tags when typed interactively in the editor. The text will appear in the note but won't be indexed as a tag.
- **Removing UI-applied tags**: Tags applied via the tag picker have no body text to remove.
- **Renaming tags**: No API exists. Tags applied via UI can't be modified programmatically.

**Implication**: Tag management (adding, removing, renaming) must be done manually in the Apple Notes app. This server can read tags but cannot modify them.

### Cross-Account Move Limitation

AppleScript's `move` command only works within the same account backend. Attempting to move a note from Exchange to iCloud (or vice versa) fails with error -10000 ("Unsupported operation").

**Workaround**: Read the note's HTML body, create a new note in the target account, then delete the original. This preserves content but loses creation date and any UI-applied tags.
