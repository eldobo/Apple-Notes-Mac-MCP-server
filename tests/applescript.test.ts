import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listFolders, listTags, readNotes, classifyFolders, buildTagMap } from '../src/applescript.js';
import * as child_process from 'node:child_process';

vi.mock('node:child_process');

const mockExecFile = vi.mocked(child_process.execFile);

const RS = '\x1E';
const US = '\x1F';
const GS = '\x1D';

// Helper: make execFile resolve with given stdout
function mockOsascriptOutput(stdout: string) {
  mockExecFile.mockImplementation((_cmd: any, _args: any, callback: any) => {
    callback(null, stdout, '');
    return {} as any;
  });
}

// Helper: queue multiple sequential osascript outputs
function mockOsascriptOutputSequence(outputs: string[]) {
  let callIndex = 0;
  mockExecFile.mockImplementation((_cmd: any, _args: any, callback: any) => {
    const stdout = outputs[callIndex] ?? '';
    callIndex++;
    callback(null, stdout, '');
    return {} as any;
  });
}

function mockOsascriptError(message: string) {
  mockExecFile.mockImplementation((_cmd: any, _args: any, callback: any) => {
    callback(new Error(message), '', message);
    return {} as any;
  });
}

describe('classifyFolders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses RS/US output and detects real vs smart folders', async () => {
    // Format: name US id US noteCount US isSmartFolder (0 or 1)
    const output = [
      `Notes${US}folder-1${US}5${US}0`,
      `Quotes${US}folder-2${US}3${US}1`,
    ].join(RS);
    mockOsascriptOutput(output);

    const result = await classifyFolders();

    expect(result).toEqual([
      { name: 'Notes', id: 'folder-1', noteCount: 5, isSmartFolder: false },
      { name: 'Quotes', id: 'folder-2', noteCount: 3, isSmartFolder: true },
    ]);
  });

  it('treats empty folders as real folders', async () => {
    const output = `Empty${US}folder-3${US}0${US}0`;
    mockOsascriptOutput(output);

    const result = await classifyFolders();

    expect(result).toEqual([
      { name: 'Empty', id: 'folder-3', noteCount: 0, isSmartFolder: false },
    ]);
  });

  it('returns empty array for no folders', async () => {
    mockOsascriptOutput('');

    const result = await classifyFolders();
    expect(result).toEqual([]);
  });

  it('throws on AppleScript failure', async () => {
    mockOsascriptError('execution error: Notes is not running');

    await expect(classifyFolders()).rejects.toThrow();
  });
});

describe('listFolders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only real folders, excluding smart folders', async () => {
    const output = [
      `Notes${US}folder-1${US}5${US}0`,
      `Quotes${US}folder-2${US}3${US}1`,
      `Work${US}folder-3${US}8${US}0`,
    ].join(RS);
    mockOsascriptOutput(output);

    const result = await listFolders();

    expect(result).toEqual([
      { name: 'Notes', id: 'folder-1', noteCount: 5 },
      { name: 'Work', id: 'folder-3', noteCount: 8 },
    ]);
  });

  it('returns empty array when all folders are smart folders', async () => {
    const output = `Quotes${US}folder-1${US}3${US}1`;
    mockOsascriptOutput(output);

    const result = await listFolders();
    expect(result).toEqual([]);
  });
});

describe('listTags', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only smart folders formatted as tags', async () => {
    const output = [
      `Notes${US}folder-1${US}5${US}0`,
      `Quotes${US}folder-2${US}3${US}1`,
      `Medical${US}folder-3${US}7${US}1`,
    ].join(RS);
    mockOsascriptOutput(output);

    const result = await listTags();

    expect(result).toEqual([
      { name: 'Quotes', noteCount: 3 },
      { name: 'Medical', noteCount: 7 },
    ]);
  });

  it('returns empty array when no smart folders exist', async () => {
    const output = `Notes${US}folder-1${US}5${US}0`;
    mockOsascriptOutput(output);

    const result = await listTags();
    expect(result).toEqual([]);
  });
});

describe('buildTagMap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses GS/RS/US output and builds noteId→tags map', async () => {
    // Format: GS separates smart folders, RS separates tag name from note IDs, US separates note IDs
    const output = [
      `Quotes${RS}note-1${US}note-2`,
      `Medical${RS}note-2${US}note-3`,
    ].join(GS);
    mockOsascriptOutput(output);

    const result = await buildTagMap(['sf-1', 'sf-2']);

    expect(result.get('note-1')).toEqual(['Quotes']);
    expect(result.get('note-2')).toEqual(['Quotes', 'Medical']);
    expect(result.get('note-3')).toEqual(['Medical']);
  });

  it('returns empty map when no smart folders provided', async () => {
    const result = await buildTagMap([]);
    expect(result.size).toBe(0);
    // Should not call osascript at all
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('handles smart folder with no notes', async () => {
    const output = `Quotes${RS}`;
    mockOsascriptOutput(output);

    const result = await buildTagMap(['sf-1']);
    expect(result.size).toBe(0);
  });
});

describe('readNotes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns notes with id and tags from tag map', async () => {
    // Call 1: classifyFolders
    const classifyOutput = [
      `Work${US}folder-1${US}2${US}0`,
      `Quotes${US}sf-1${US}1${US}1`,
    ].join(RS);
    // Call 2: buildTagMap
    const tagMapOutput = `Quotes${RS}note-1`;
    // Call 3: readNotes (actual note reading)
    const notesOutput = `note-1${US}Meeting notes${US}Discussed Q2 plans${US}2026-03-01${US}2026-03-05${RS}note-2${US}Ideas${US}New feature ideas${US}2026-02-15${US}2026-03-08`;

    mockOsascriptOutputSequence([classifyOutput, tagMapOutput, notesOutput]);

    const result = await readNotes('Work');

    expect(result).toEqual([
      { id: 'note-1', title: 'Meeting notes', body: 'Discussed Q2 plans', tags: ['Quotes'], createdAt: '2026-03-01', modifiedAt: '2026-03-05' },
      { id: 'note-2', title: 'Ideas', body: 'New feature ideas', tags: [], createdAt: '2026-02-15', modifiedAt: '2026-03-08' },
    ]);
  });

  it('returns empty array for folder with no notes', async () => {
    const classifyOutput = `Work${US}folder-1${US}0${US}0`;
    mockOsascriptOutputSequence([classifyOutput, '', '']);

    const result = await readNotes('Work');
    expect(result).toEqual([]);
  });

  it('throws on AppleScript failure', async () => {
    mockOsascriptError('execution error: folder "Nonexistent" not found');

    await expect(readNotes('Nonexistent')).rejects.toThrow();
  });

  it('passes folder name to osascript without interpolation into script', async () => {
    const classifyOutput = `My Folder${US}folder-1${US}0${US}0`;
    mockOsascriptOutputSequence([classifyOutput, '', '']);

    await readNotes('My Folder');

    // The read notes call (3rd) should pass folder name as argument
    // At minimum, classifyFolders is called (1st call)
    const firstCallArgs = mockExecFile.mock.calls[0]!;
    const args = firstCallArgs[1] as string[];
    const eIndex = args.indexOf('-e');
    const scriptBody = args[eIndex + 1]!;
    expect(scriptBody).not.toContain('My Folder');
  });

  it('uses folder ID when provided', async () => {
    const classifyOutput = `Notes${US}folder-1${US}1${US}0`;
    const tagMapOutput = '';
    const notesOutput = `note-1${US}Note 1${US}Body 1${US}2026-03-01${US}2026-03-05`;

    mockOsascriptOutputSequence([classifyOutput, notesOutput]);

    const result = await readNotes('Notes', 'folder-1');

    expect(result).toEqual([
      { id: 'note-1', title: 'Note 1', body: 'Body 1', tags: [], createdAt: '2026-03-01', modifiedAt: '2026-03-05' },
    ]);

    // The read notes call should use the ID-based script
    // Find the call that passes the folder ID as an argument
    const readNotesCall = mockExecFile.mock.calls.find(call => {
      const args = call[1] as string[];
      return args.includes('folder-1');
    });
    expect(readNotesCall).toBeTruthy();
    const args = readNotesCall![1] as string[];
    const eIndex = args.indexOf('-e');
    const scriptBody = args[eIndex + 1]!;
    expect(scriptBody).toContain('folder id');
  });

  it('annotates notes with multiple tags', async () => {
    const classifyOutput = [
      `Notes${US}folder-1${US}1${US}0`,
      `Quotes${US}sf-1${US}1${US}1`,
      `Medical${US}sf-2${US}1${US}1`,
    ].join(RS);
    const tagMapOutput = [
      `Quotes${RS}note-1`,
      `Medical${RS}note-1`,
    ].join(GS);
    const notesOutput = `note-1${US}My Note${US}Body${US}2026-03-01${US}2026-03-05`;

    mockOsascriptOutputSequence([classifyOutput, tagMapOutput, notesOutput]);

    const result = await readNotes('Notes');

    expect(result[0]!.tags).toEqual(['Quotes', 'Medical']);
  });
});
