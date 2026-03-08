import { execFile } from 'node:child_process';

export interface Folder {
  name: string;
  id: string;
  noteCount: number;
}

export interface Note {
  title: string;
  body: string;
  createdAt: string;
  modifiedAt: string;
}

function runOsascript(script: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script, ...args], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

const LIST_FOLDERS_SCRIPT = `
tell application "Notes"
  set folderList to {}
  repeat with f in folders
    set fName to name of f
    set fId to id of f
    set nCount to count of notes of f
    set end of folderList to "{\\"name\\":\\"" & fName & "\\",\\"id\\":\\"" & fId & "\\",\\"noteCount\\":" & nCount & "}"
  end repeat
  return "[" & my joinList(folderList, ",") & "]"
end tell

on joinList(theList, delimiter)
  set oldDelimiters to AppleScript's text item delimiters
  set AppleScript's text item delimiters to delimiter
  set theString to theList as string
  set AppleScript's text item delimiters to oldDelimiters
  return theString
end joinList
`;

// Record separator (ASCII 30) and unit separator (ASCII 31) to delimit fields/records
const RS = '\x1E';
const US = '\x1F';

const READ_NOTES_SCRIPT = `
on run argv
  set folderName to item 1 of argv
  set RS to ASCII character 30
  set US to ASCII character 31
  tell application "Notes"
    set targetFolder to folder folderName
    set noteEntries to {}
    repeat with n in notes of targetFolder
      set nTitle to name of n
      set nBody to plaintext of n
      set nCreated to creation date of n as string
      set nModified to modification date of n as string
      set end of noteEntries to nTitle & US & nBody & US & nCreated & US & nModified
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
  const output = await runOsascript(LIST_FOLDERS_SCRIPT);
  return JSON.parse(output) as Folder[];
}

export async function readNotes(folder: string): Promise<Note[]> {
  const output = await runOsascript(READ_NOTES_SCRIPT, [folder]);
  if (!output) return [];
  return output.split(RS).map((record) => {
    const [title = '', body = '', createdAt = '', modifiedAt = ''] = record.split(US);
    return { title, body, createdAt, modifiedAt };
  });
}
