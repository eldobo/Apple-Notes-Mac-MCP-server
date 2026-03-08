import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listFolders, readNotes } from '../applescript.js';
import * as child_process from 'node:child_process';

vi.mock('node:child_process');

const mockExecFile = vi.mocked(child_process.execFile);

// Helper: make execFile resolve with given stdout
function mockOsascriptOutput(stdout: string) {
  mockExecFile.mockImplementation((_cmd: any, _args: any, callback: any) => {
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

describe('listFolders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed folder objects from AppleScript output', async () => {
    mockOsascriptOutput(JSON.stringify([
      { name: 'Work', id: 'folder-1', noteCount: 5 },
      { name: 'Personal', id: 'folder-2', noteCount: 12 },
    ]));

    const result = await listFolders();

    expect(result).toEqual([
      { name: 'Work', id: 'folder-1', noteCount: 5 },
      { name: 'Personal', id: 'folder-2', noteCount: 12 },
    ]);
  });

  it('returns empty array when no folders exist', async () => {
    mockOsascriptOutput(JSON.stringify([]));

    const result = await listFolders();
    expect(result).toEqual([]);
  });

  it('throws on AppleScript failure', async () => {
    mockOsascriptError('execution error: Notes is not running');

    await expect(listFolders()).rejects.toThrow();
  });

  it('calls osascript with correct command', async () => {
    mockOsascriptOutput('[]');
    await listFolders();

    expect(mockExecFile).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining(['-e']),
      expect.any(Function),
    );
  });
});

describe('readNotes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed note objects for a valid folder', async () => {
    const notes = [
      { title: 'Meeting notes', body: 'Discussed Q2 plans', createdAt: '2026-03-01', modifiedAt: '2026-03-05' },
      { title: 'Ideas', body: 'New feature ideas', createdAt: '2026-02-15', modifiedAt: '2026-03-08' },
    ];
    mockOsascriptOutput(JSON.stringify(notes));

    const result = await readNotes('Work');

    expect(result).toEqual(notes);
  });

  it('returns empty array for folder with no notes', async () => {
    mockOsascriptOutput(JSON.stringify([]));

    const result = await readNotes('Empty Folder');
    expect(result).toEqual([]);
  });

  it('throws on AppleScript failure (e.g., folder not found)', async () => {
    mockOsascriptError('execution error: folder "Nonexistent" not found');

    await expect(readNotes('Nonexistent')).rejects.toThrow();
  });

  it('passes folder name to osascript without interpolation into script', async () => {
    mockOsascriptOutput('[]');
    await readNotes('My Folder');

    // Folder name should be a separate argument, not embedded in the script string
    const callArgs = mockExecFile.mock.calls[0]!;
    const args = callArgs[1] as string[];
    const scriptArg = args.find((a: string) => a.includes('My Folder'));
    // The folder name should appear as a standalone argument, not inside -e script
    const eIndex = args.indexOf('-e');
    const scriptBody = args[eIndex + 1]!;
    expect(scriptBody).not.toContain('My Folder');
  });
});
