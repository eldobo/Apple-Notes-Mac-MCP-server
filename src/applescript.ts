import { execFile } from 'node:child_process';

export interface Folder {
  name: string;
  id: string;
  noteCount: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  modifiedAt: string;
}

function log(message: string): void {
  process.stderr.write(`[apple-notes] ${message}\n`);
}

function runOsascript(script: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script, ...args], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// Record separator (ASCII 30), unit separator (ASCII 31)
const RS = '\x1E';
const US = '\x1F';

// Returns all folders with classification: name US id US noteCount US isSmartFolder (0/1)
// Smart folder detection: if first note's container ID ≠ folder ID → smart folder
//
// AppleScript quirk: `id of container of firstNote` throws error -1728, but
// `id of (get container of firstNote)` works. The `get` forces AppleScript to
// resolve the container reference to a folder object before accessing its id.
const CLASSIFY_FOLDERS_SCRIPT = `
set RS to ASCII character 30
set US to ASCII character 31
tell application "Notes"
  set folderEntries to {}
  repeat with f in folders
    set fName to name of f
    set fId to id of f
    set nCount to count of notes of f
    set isSmart to 0
    if nCount > 0 then
      set firstNote to item 1 of notes of f
      set containerId to id of (get container of firstNote)
      if containerId is not equal to fId then
        set isSmart to 1
      end if
    end if
    set end of folderEntries to fName & US & fId & US & (nCount as string) & US & (isSmart as string)
  end repeat
  set oldDelimiters to AppleScript's text item delimiters
  set AppleScript's text item delimiters to RS
  set output to folderEntries as string
  set AppleScript's text item delimiters to oldDelimiters
  return output
end tell
`;

const READ_NOTES_BY_NAME_SCRIPT = `
on run argv
  set folderName to item 1 of argv
  set RS to ASCII character 30
  set US to ASCII character 31
  tell application "Notes"
    set targetFolder to folder folderName
    set noteEntries to {}
    repeat with n in notes of targetFolder
      set nId to id of n
      set nTitle to name of n
      set nBody to plaintext of n
      set nCreated to creation date of n as string
      set nModified to modification date of n as string
      set end of noteEntries to nId & US & nTitle & US & nBody & US & nCreated & US & nModified
    end repeat
    set oldDelimiters to AppleScript's text item delimiters
    set AppleScript's text item delimiters to RS
    set output to noteEntries as string
    set AppleScript's text item delimiters to oldDelimiters
    return output
  end tell
end run
`;

const READ_NOTES_BY_ID_SCRIPT = `
on run argv
  set folderId to item 1 of argv
  set RS to ASCII character 30
  set US to ASCII character 31
  tell application "Notes"
    set targetFolder to folder id folderId
    set noteEntries to {}
    repeat with n in notes of targetFolder
      set nId to id of n
      set nTitle to name of n
      set nBody to plaintext of n
      set nCreated to creation date of n as string
      set nModified to modification date of n as string
      set end of noteEntries to nId & US & nTitle & US & nBody & US & nCreated & US & nModified
    end repeat
    set oldDelimiters to AppleScript's text item delimiters
    set AppleScript's text item delimiters to RS
    set output to noteEntries as string
    set AppleScript's text item delimiters to oldDelimiters
    return output
  end tell
end run
`;

export async function listFolders(): Promise<Folder[]> {
  const start = Date.now();
  const output = await runOsascript(CLASSIFY_FOLDERS_SCRIPT);
  log(`listFolders: ${Date.now() - start}ms`);
  if (!output) return [];
  return output.split(RS)
    .map((record) => {
      const [name = '', id = '', noteCountStr = '0', isSmartStr = '0'] = record.split(US);
      return { name, id, noteCount: parseInt(noteCountStr, 10), isSmartFolder: isSmartStr === '1' };
    })
    .filter((f) => !f.isSmartFolder)
    .map(({ name, id, noteCount }) => ({ name, id, noteCount }));
}

const READ_NOTE_BODY_SCRIPT = `
on run argv
  set noteId to item 1 of argv
  tell application "Notes"
    return body of note id noteId
  end tell
end run
`;

export async function readNoteBody(noteId: string): Promise<string> {
  const start = Date.now();
  const result = await runOsascript(READ_NOTE_BODY_SCRIPT, [noteId]);
  log(`readNoteBody: ${Date.now() - start}ms`);
  return result;
}

const CREATE_NOTE_BY_NAME_SCRIPT = `
on run argv
  set folderName to item 1 of argv
  set noteTitle to item 2 of argv
  set noteBody to item 3 of argv
  tell application "Notes"
    set newNote to make new note at folder folderName with properties {name:noteTitle, body:noteBody}
    return id of newNote
  end tell
end run
`;

const CREATE_NOTE_BY_ID_SCRIPT = `
on run argv
  set folderId to item 1 of argv
  set noteTitle to item 2 of argv
  set noteBody to item 3 of argv
  tell application "Notes"
    set newNote to make new note at folder id folderId with properties {name:noteTitle, body:noteBody}
    return id of newNote
  end tell
end run
`;

const DELETE_NOTE_SCRIPT = `
on run argv
  set noteId to item 1 of argv
  tell application "Notes"
    delete note id noteId
  end tell
end run
`;

const MOVE_NOTE_BY_NAME_SCRIPT = `
on run argv
  set noteId to item 1 of argv
  set folderName to item 2 of argv
  tell application "Notes"
    move note id noteId to folder folderName
  end tell
end run
`;

const MOVE_NOTE_BY_ID_SCRIPT = `
on run argv
  set noteId to item 1 of argv
  set folderId to item 2 of argv
  tell application "Notes"
    move note id noteId to folder id folderId
  end tell
end run
`;

export async function createNote(folder: string, title: string, body: string = '', id?: string): Promise<string> {
  const start = Date.now();
  const script = id ? CREATE_NOTE_BY_ID_SCRIPT : CREATE_NOTE_BY_NAME_SCRIPT;
  const result = await runOsascript(script, [id ?? folder, title, body]);
  log(`createNote: ${Date.now() - start}ms`);
  return result;
}

export async function deleteNote(noteId: string): Promise<void> {
  const start = Date.now();
  await runOsascript(DELETE_NOTE_SCRIPT, [noteId]);
  log(`deleteNote: ${Date.now() - start}ms`);
}

export async function moveNote(noteId: string, folder: string, id?: string): Promise<void> {
  const start = Date.now();
  const script = id ? MOVE_NOTE_BY_ID_SCRIPT : MOVE_NOTE_BY_NAME_SCRIPT;
  await runOsascript(script, [noteId, id ?? folder]);
  log(`moveNote: ${Date.now() - start}ms`);
}

export async function readNotes(folder: string, id?: string): Promise<Note[]> {
  const start = Date.now();
  const script = id ? READ_NOTES_BY_ID_SCRIPT : READ_NOTES_BY_NAME_SCRIPT;
  const output = await runOsascript(script, [id ?? folder]);
  log(`readNotes: ${Date.now() - start}ms`);

  if (!output) return [];

  return output.split(RS).map((record) => {
    const [noteId = '', title = '', body = '', createdAt = '', modifiedAt = ''] = record.split(US);
    return { id: noteId, title, body, createdAt, modifiedAt };
  });
}
