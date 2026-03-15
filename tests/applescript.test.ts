import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listFolders, readNotes, createNote, deleteNote, moveNote } from '../src/applescript.js';
import * as child_process from 'node:child_process';

vi.mock('node:child_process');

const mockExecFile = vi.mocked(child_process.execFile);

const RS = '\x1E';
const US = '\x1F';

// Helper: make execFile resolve with given stdout
function mockOsascriptOutput(stdout: string) {
  mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
    callback(null, stdout, '');
    return {} as any;
  });
}

function mockOsascriptError(message: string) {
  mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
    callback(new Error(message), '', message);
    return {} as any;
  });
}

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

  it('returns empty array for no folders', async () => {
    mockOsascriptOutput('');

    const result = await listFolders();
    expect(result).toEqual([]);
  });

  it('throws on AppleScript failure', async () => {
    mockOsascriptError('execution error: Notes is not running');

    await expect(listFolders()).rejects.toThrow();
  });
});

describe('readNotes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns notes with id and timestamps', async () => {
    const notesOutput = `note-1${US}Meeting notes${US}Discussed Q2 plans${US}2026-03-01${US}2026-03-05${RS}note-2${US}Ideas${US}New feature ideas${US}2026-02-15${US}2026-03-08`;
    mockOsascriptOutput(notesOutput);

    const result = await readNotes('Work');

    expect(result).toEqual([
      { id: 'note-1', title: 'Meeting notes', body: 'Discussed Q2 plans', createdAt: '2026-03-01', modifiedAt: '2026-03-05' },
      { id: 'note-2', title: 'Ideas', body: 'New feature ideas', createdAt: '2026-02-15', modifiedAt: '2026-03-08' },
    ]);
  });

  it('returns empty array for folder with no notes', async () => {
    mockOsascriptOutput('');

    const result = await readNotes('Work');
    expect(result).toEqual([]);
  });

  it('throws on AppleScript failure', async () => {
    mockOsascriptError('execution error: folder "Nonexistent" not found');

    await expect(readNotes('Nonexistent')).rejects.toThrow();
  });

  it('passes folder name to osascript without interpolation into script', async () => {
    mockOsascriptOutput('');

    await readNotes('My Folder');

    const firstCallArgs = mockExecFile.mock.calls[0]!;
    const args = firstCallArgs[1] as string[];
    const eIndex = args.indexOf('-e');
    const scriptBody = args[eIndex + 1]!;
    expect(scriptBody).not.toContain('My Folder');
  });

  it('uses folder ID when provided', async () => {
    const notesOutput = `note-1${US}Note 1${US}Body 1${US}2026-03-01${US}2026-03-05`;
    mockOsascriptOutput(notesOutput);

    const result = await readNotes('Notes', 'folder-1');

    expect(result).toEqual([
      { id: 'note-1', title: 'Note 1', body: 'Body 1', createdAt: '2026-03-01', modifiedAt: '2026-03-05' },
    ]);

    const args = mockExecFile.mock.calls[0]![1] as string[];
    expect(args).toContain('folder-1');
    const eIndex = args.indexOf('-e');
    const scriptBody = args[eIndex + 1]!;
    expect(scriptBody).toContain('folder id');
  });
});

describe('createNote', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls osascript with folder name, title, and body', async () => {
    mockOsascriptOutput('x-coredata://ABC/ICNote/p42');

    const result = await createNote('Work', 'My Title', '<h1>Hello</h1>');

    expect(result).toBe('x-coredata://ABC/ICNote/p42');
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const args = mockExecFile.mock.calls[0]![1] as string[];
    expect(args).toContain('Work');
    expect(args).toContain('My Title');
    expect(args).toContain('<h1>Hello</h1>');
  });

  it('uses folder ID when provided', async () => {
    mockOsascriptOutput('x-coredata://ABC/ICNote/p42');

    await createNote('Work', 'My Title', '<h1>Hello</h1>', 'folder-1');

    const args = mockExecFile.mock.calls[0]![1] as string[];
    expect(args).toContain('folder-1');
    const script = args[args.indexOf('-e') + 1]!;
    expect(script).toContain('folder id');
  });

  it('defaults body to empty string', async () => {
    mockOsascriptOutput('x-coredata://ABC/ICNote/p42');

    await createNote('Work', 'My Title');

    const args = mockExecFile.mock.calls[0]![1] as string[];
    expect(args).toContain('');
  });

  it('throws on AppleScript failure', async () => {
    mockOsascriptError('execution error');

    await expect(createNote('Work', 'Title')).rejects.toThrow();
  });
});

describe('deleteNote', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls osascript with note ID', async () => {
    mockOsascriptOutput('');

    await deleteNote('x-coredata://ABC/ICNote/p42');

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const args = mockExecFile.mock.calls[0]![1] as string[];
    expect(args).toContain('x-coredata://ABC/ICNote/p42');
  });

  it('throws on AppleScript failure', async () => {
    mockOsascriptError('note not found');

    await expect(deleteNote('bad-id')).rejects.toThrow();
  });
});

describe('moveNote', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls osascript with note ID and folder name', async () => {
    mockOsascriptOutput('');

    await moveNote('x-coredata://ABC/ICNote/p42', 'Archive');

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const args = mockExecFile.mock.calls[0]![1] as string[];
    expect(args).toContain('x-coredata://ABC/ICNote/p42');
    expect(args).toContain('Archive');
  });

  it('uses folder ID when provided', async () => {
    mockOsascriptOutput('');

    await moveNote('x-coredata://ABC/ICNote/p42', 'Archive', 'folder-2');

    const args = mockExecFile.mock.calls[0]![1] as string[];
    expect(args).toContain('folder-2');
    const script = args[args.indexOf('-e') + 1]!;
    expect(script).toContain('folder id');
  });

  it('throws on AppleScript failure', async () => {
    mockOsascriptError('folder not found');

    await expect(moveNote('bad-id', 'Archive')).rejects.toThrow();
  });
});

