import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listFolders, readNotes } from '../src/applescript.js';
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
    // AppleScript returns RS-delimited records, US-delimited fields
    const RS = '\x1E';
    const US = '\x1F';
    const output = `Meeting notes${US}Discussed Q2 plans${US}2026-03-01${US}2026-03-05${RS}Ideas${US}New feature ideas${US}2026-02-15${US}2026-03-08`;
    mockOsascriptOutput(output);

    const result = await readNotes('Work');

    expect(result).toEqual([
      { title: 'Meeting notes', body: 'Discussed Q2 plans', createdAt: '2026-03-01', modifiedAt: '2026-03-05' },
      { title: 'Ideas', body: 'New feature ideas', createdAt: '2026-02-15', modifiedAt: '2026-03-08' },
    ]);
  });

  it('returns empty array for folder with no notes', async () => {
    mockOsascriptOutput('');

    const result = await readNotes('Empty Folder');
    expect(result).toEqual([]);
  });

  it('throws on AppleScript failure (e.g., folder not found)', async () => {
    mockOsascriptError('execution error: folder "Nonexistent" not found');

    await expect(readNotes('Nonexistent')).rejects.toThrow();
  });

  it('passes folder name to osascript without interpolation into script', async () => {
    mockOsascriptOutput('');
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

  it('uses folder ID when provided', async () => {
    const RS = '\x1E';
    const US = '\x1F';
    const output = `Note 1${US}Body 1${US}2026-03-01${US}2026-03-05`;
    mockOsascriptOutput(output);

    const result = await readNotes('Notes', 'x-coredata://ABC/ICFolder/p3');

    expect(result).toEqual([
      { title: 'Note 1', body: 'Body 1', createdAt: '2026-03-01', modifiedAt: '2026-03-05' },
    ]);

    // Should use the ID-based script and pass ID as arg
    const callArgs = mockExecFile.mock.calls[0]!;
    const args = callArgs[1] as string[];
    expect(args).toContain('x-coredata://ABC/ICFolder/p3');
    // ID should not be interpolated into the script body
    const eIndex = args.indexOf('-e');
    const scriptBody = args[eIndex + 1]!;
    expect(scriptBody).not.toContain('x-coredata://ABC/ICFolder/p3');
    // Script should reference folder id lookup
    expect(scriptBody).toContain('folder id');
  });

  it('uses name-based lookup when id is not provided', async () => {
    mockOsascriptOutput('');
    await readNotes('Work');

    const callArgs = mockExecFile.mock.calls[0]!;
    const args = callArgs[1] as string[];
    const eIndex = args.indexOf('-e');
    const scriptBody = args[eIndex + 1]!;
    // Should use name-based lookup, not ID-based
    expect(scriptBody).not.toContain('folder id');
  });
});
