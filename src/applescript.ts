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

const READ_NOTES_SCRIPT = `
on run argv
  set folderName to item 1 of argv
  tell application "Notes"
    set targetFolder to folder folderName
    set noteList to {}
    repeat with n in notes of targetFolder
      set nTitle to name of n
      set nBody to plaintext of n
      -- Escape double quotes and newlines in body
      set nBody to my replaceText(nBody, "\\\\", "\\\\\\\\")
      set nBody to my replaceText(nBody, "\\"", "\\\\\\"")
      set nBody to my replaceText(nBody, return, "\\\\n")
      set nBody to my replaceText(nBody, linefeed, "\\\\n")
      set nCreated to creation date of n as string
      set nModified to modification date of n as string
      set end of noteList to "{\\"title\\":\\"" & nTitle & "\\",\\"body\\":\\"" & nBody & "\\",\\"createdAt\\":\\"" & nCreated & "\\",\\"modifiedAt\\":\\"" & nModified & "\\"}"
    end repeat
    return "[" & my joinList(noteList, ",") & "]"
  end tell
end run

on joinList(theList, delimiter)
  set oldDelimiters to AppleScript's text item delimiters
  set AppleScript's text item delimiters to delimiter
  set theString to theList as string
  set AppleScript's text item delimiters to oldDelimiters
  return theString
end joinList

on replaceText(theText, searchStr, replaceStr)
  set oldDelimiters to AppleScript's text item delimiters
  set AppleScript's text item delimiters to searchStr
  set theItems to text items of theText
  set AppleScript's text item delimiters to replaceStr
  set theText to theItems as string
  set AppleScript's text item delimiters to oldDelimiters
  return theText
end replaceText
`;

export async function listFolders(): Promise<Folder[]> {
  const output = await runOsascript(LIST_FOLDERS_SCRIPT);
  return JSON.parse(output) as Folder[];
}

export async function readNotes(folder: string): Promise<Note[]> {
  const output = await runOsascript(READ_NOTES_SCRIPT, [folder]);
  return JSON.parse(output) as Note[];
}
