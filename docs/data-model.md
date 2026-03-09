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
- **Paragraph styles** — Apple Notes supports Title, Heading, Subheading, and Body styles. These are stored as **internal metadata**, not in the HTML body. When reading, Apple renders Title as `<b><span style="font-size: 24px">`, Heading as `<b><span style="font-size: 18px">`, and Subheading as `<b>`. However, writing these same HTML patterns back via `set body` produces the correct visual appearance but does **not** set the internal style — the style picker will show "Body". Using `<h1>`, `<h2>`, `<h3>` tags has the same result: Apple converts them to visual equivalents but does not assign the paragraph style. **Any `set body` call destroys and does not restore existing paragraph style metadata.** Styles can only be assigned through the Apple Notes UI.
- **Embedded attachments** — images, PDFs, scans, and other attachments in a note appear as `￼` (U+FFFC, object replacement character) in `plaintext`. The `body` (HTML) property includes them as base64-encoded `<img>` tags or attachment references. **Warning: a note with an empty title and a plaintext body of just `￼` is NOT empty — it contains images or attachments. Never treat blank title or short plaintext as a signal that a note can be safely deleted.** Always check for U+FFFC before classifying a note as empty. **Critical: calling `set body` on a note with attachments destroys the attachment links permanently** — see [Known Limitations of `set body`](#known-limitations-of-set-body).
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

### Updating Notes — NOT SUPPORTED

```applescript
-- DO NOT USE: this server does not expose this operation
tell application "Notes"
  set body of note id "noteId" to "<html>..."
end tell
```

While AppleScript allows `set body`, this server deliberately does not expose it. `set body` permanently destroys embedded attachments (images, PDFs, scans) and paragraph style metadata. See [Why This Server Does Not Expose `set body`](#why-this-server-does-not-expose-set-body) for the full list of reasons.

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

### Why This Server Does Not Expose `set body`

`set body` is the only way to modify note content via AppleScript, but it is destructive by design. **This server deliberately does not expose a note-update tool** because `set body` cannot safely modify a note without risking irreversible data loss. The specific problems:

1. **Destroys paragraph styles** — Title, Heading, and Subheading styles are internal metadata. After any `set body` call, all lines revert to "Body" in the style picker despite rendering with correct visual appearance (bold, font-size). Styles must be reassigned manually in the Apple Notes UI.

2. **Cannot create tags** — Writing `#tagname` as text in the body does not create a tag. Tags are only indexed when typed interactively in the editor.

3. **Cannot remove UI-applied tags** — Tags applied via the tag picker exist as metadata outside the body. There is no body text to remove.

4. **HTML is not a lossless round-trip** — Apple Notes reprocesses HTML on every write. The structure of what you read back may differ from what you wrote (e.g., `<h1>` becomes `<b><span style="font-size: 24px">`, `<h3>` becomes `<b>`). Running read→modify→write multiple times can compound structural drift.

5. **Large bodies may exceed OS limits** — Notes with embedded images (base64 in HTML) can be several MB. Passing these as command-line arguments to `osascript` fails with `E2BIG`. Workaround: write the HTML to a temp file and read it from AppleScript via `read (POSIX file tmpPath)`.

6. **Destroys embedded attachments** — Images, PDFs, scans, and other attachments in a note are stored as internal objects referenced by the HTML body. When `set body` is called, Apple Notes does not re-link written HTML (including base64 `<img>` tags or `<object>` references) back to the original attachment objects. The result is orphaned empty file placeholders visible in the UI — the images are gone. **This is destructive and not reversible via AppleScript.** Affected notes can only be restored from iCloud backup or Apple Notes version history (if available). The `plaintext` property shows `￼` (U+FFFC) for notes with attachments — check for this character before calling `set body` to avoid data loss.

The common thread: Apple Notes stores rich metadata (styles, tags, attachments) in internal databases. The `body` property is a rendering of the content, not the source of truth. Writing to `body` modifies the content layer but cannot set metadata, and **permanently destroys attachment data that cannot be recovered programmatically**. This is why this server does not expose `set body` as a tool.

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
- **Renaming tags**: No API exists. Tags applied via UI can't be modified programmatically. The Apple Notes UI also won't rename a tag's casing (e.g. `#Owen` → `#owen`) — you'd have to remove the tag from every note and re-add it, which isn't practical.

**Implication**: Tag management (adding, removing, renaming) must be done manually in the Apple Notes app. This server can read tags but cannot modify them.

### Cross-Account Move Limitation

AppleScript's `move` command only works within the same account backend. Attempting to move a note from Exchange to iCloud (or vice versa) fails with error -10000 ("Unsupported operation").

**Workaround**: Read the note's HTML body, create a new note in the target account, then delete the original. This preserves content but loses creation date and any UI-applied tags.
