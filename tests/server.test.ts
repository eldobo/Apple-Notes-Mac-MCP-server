import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// Mock the applescript module before importing server setup
vi.mock('../src/applescript.js', () => ({
  listFolders: vi.fn(),
  listTags: vi.fn(),
  readNotes: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  moveNote: vi.fn(),
}));

// These will be imported after mock is set up
import { listFolders, listTags, readNotes, createNote, deleteNote, moveNote } from '../src/applescript.js';
import { createServer } from '../src/index.js';

const mockListFolders = vi.mocked(listFolders);
const mockListTags = vi.mocked(listTags);
const mockReadNotes = vi.mocked(readNotes);
const mockCreateNote = vi.mocked(createNote);
const mockDeleteNote = vi.mocked(deleteNote);
const mockMoveNote = vi.mocked(moveNote);

describe('MCP Server', () => {
  let client: Client;
  let server: McpServer;

  beforeAll(async () => {
    server = createServer();
    client = new Client({ name: 'test-client', version: '1.0.0' });

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  describe('list_folders tool', () => {
    it('returns folder list as text content', async () => {
      mockListFolders.mockResolvedValue([
        { name: 'Work', id: 'folder-1', noteCount: 5 },
        { name: 'Personal', id: 'folder-2', noteCount: 12 },
      ]);

      const result = await client.callTool({ name: 'list_folders' });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0]!.text);
      expect(parsed).toEqual([
        { name: 'Work', id: 'folder-1', noteCount: 5 },
        { name: 'Personal', id: 'folder-2', noteCount: 12 },
      ]);
    });

    it('returns error content on AppleScript failure', async () => {
      mockListFolders.mockRejectedValue(new Error('Notes is not running'));

      const result = await client.callTool({ name: 'list_folders' });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('Notes is not running');
    });
  });

  describe('list_tags tool', () => {
    it('returns tag list as text content', async () => {
      mockListTags.mockResolvedValue([
        { name: 'Quotes', noteCount: 3 },
        { name: 'Medical', noteCount: 7 },
      ]);

      const result = await client.callTool({ name: 'list_tags' });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0]!.text);
      expect(parsed).toEqual([
        { name: 'Quotes', noteCount: 3 },
        { name: 'Medical', noteCount: 7 },
      ]);
    });

    it('returns error content on AppleScript failure', async () => {
      mockListTags.mockRejectedValue(new Error('Notes is not running'));

      const result = await client.callTool({ name: 'list_tags' });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('Notes is not running');
    });
  });

  describe('read_notes tool', () => {
    it('returns notes with id and tags for a valid folder', async () => {
      const notes = [
        { id: 'note-1', title: 'Note 1', body: 'Content 1', tags: ['Quotes'], createdAt: '2026-03-01', modifiedAt: '2026-03-05' },
      ];
      mockReadNotes.mockResolvedValue(notes);

      const result = await client.callTool({
        name: 'read_notes',
        arguments: { folder: 'Work' },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0]!.text);
      expect(parsed).toEqual(notes);
      expect(mockReadNotes).toHaveBeenCalledWith('Work', undefined);
    });

    it('returns error when folder not found', async () => {
      mockReadNotes.mockRejectedValue(new Error('folder "Nonexistent" not found'));

      const result = await client.callTool({
        name: 'read_notes',
        arguments: { folder: 'Nonexistent' },
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('folder "Nonexistent" not found');
    });

    it('requires folder argument', async () => {
      const result = await client.callTool({
        name: 'read_notes',
        arguments: {},
      });

      expect(result.isError).toBe(true);
    });

    it('passes id to readNotes when provided', async () => {
      const notes = [
        { id: 'note-1', title: 'Note 1', body: 'Content 1', tags: [], createdAt: '2026-03-01', modifiedAt: '2026-03-05' },
      ];
      mockReadNotes.mockResolvedValue(notes);

      const result = await client.callTool({
        name: 'read_notes',
        arguments: { folder: 'Notes', id: 'x-coredata://ABC/ICFolder/p3' },
      });

      expect(result.isError).toBeFalsy();
      expect(mockReadNotes).toHaveBeenCalledWith('Notes', 'x-coredata://ABC/ICFolder/p3');
    });

    it('calls readNotes without id when id is not provided', async () => {
      mockReadNotes.mockResolvedValue([]);

      await client.callTool({
        name: 'read_notes',
        arguments: { folder: 'Work' },
      });

      expect(mockReadNotes).toHaveBeenCalledWith('Work', undefined);
    });
  });

  describe('create_note tool', () => {
    it('creates a note and returns the new note ID', async () => {
      mockCreateNote.mockResolvedValue('x-coredata://ABC/ICNote/p42');

      const result = await client.callTool({
        name: 'create_note',
        arguments: { folder: 'Work', title: 'New Note', body: '<h1>Hello</h1>' },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('x-coredata://ABC/ICNote/p42');
      expect(mockCreateNote).toHaveBeenCalledWith('Work', 'New Note', '<h1>Hello</h1>', undefined);
    });

    it('passes folder ID when provided', async () => {
      mockCreateNote.mockResolvedValue('x-coredata://ABC/ICNote/p42');

      await client.callTool({
        name: 'create_note',
        arguments: { folder: 'Work', title: 'New Note', id: 'folder-1' },
      });

      expect(mockCreateNote).toHaveBeenCalledWith('Work', 'New Note', undefined, 'folder-1');
    });

    it('returns error on failure', async () => {
      mockCreateNote.mockRejectedValue(new Error('folder not found'));

      const result = await client.callTool({
        name: 'create_note',
        arguments: { folder: 'Bad', title: 'Note' },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('delete_note tool', () => {
    it('deletes a note by ID', async () => {
      mockDeleteNote.mockResolvedValue();

      const result = await client.callTool({
        name: 'delete_note',
        arguments: { noteId: 'x-coredata://ABC/ICNote/p42' },
      });

      expect(result.isError).toBeFalsy();
      expect(mockDeleteNote).toHaveBeenCalledWith('x-coredata://ABC/ICNote/p42');
    });

    it('returns error on failure', async () => {
      mockDeleteNote.mockRejectedValue(new Error('note not found'));

      const result = await client.callTool({
        name: 'delete_note',
        arguments: { noteId: 'bad-id' },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('move_note tool', () => {
    it('moves a note to a folder by name', async () => {
      mockMoveNote.mockResolvedValue();

      const result = await client.callTool({
        name: 'move_note',
        arguments: { noteId: 'x-coredata://ABC/ICNote/p42', folder: 'Archive' },
      });

      expect(result.isError).toBeFalsy();
      expect(mockMoveNote).toHaveBeenCalledWith('x-coredata://ABC/ICNote/p42', 'Archive', undefined);
    });

    it('passes folder ID when provided', async () => {
      mockMoveNote.mockResolvedValue();

      await client.callTool({
        name: 'move_note',
        arguments: { noteId: 'note-1', folder: 'Archive', id: 'folder-2' },
      });

      expect(mockMoveNote).toHaveBeenCalledWith('note-1', 'Archive', 'folder-2');
    });

    it('returns error on failure', async () => {
      mockMoveNote.mockRejectedValue(new Error('folder not found'));

      const result = await client.callTool({
        name: 'move_note',
        arguments: { noteId: 'note-1', folder: 'Bad' },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('tool discovery', () => {
    it('exposes all 6 tools', async () => {
      const tools = await client.listTools();
      const toolNames = tools.tools.map(t => t.name);

      expect(toolNames).toContain('list_folders');
      expect(toolNames).toContain('list_tags');
      expect(toolNames).toContain('read_notes');
      expect(toolNames).toContain('create_note');
      expect(toolNames).toContain('delete_note');
      expect(toolNames).toContain('move_note');
      expect(toolNames).toHaveLength(6);
    });

    it('list_folders has no required input', async () => {
      const tools = await client.listTools();
      const listFoldersTool = tools.tools.find(t => t.name === 'list_folders')!;

      const schema = listFoldersTool.inputSchema;
      expect(schema.required ?? []).toEqual([]);
    });

    it('list_tags has no required input', async () => {
      const tools = await client.listTools();
      const listTagsTool = tools.tools.find(t => t.name === 'list_tags')!;

      const schema = listTagsTool.inputSchema;
      expect(schema.required ?? []).toEqual([]);
    });

    it('read_notes requires folder input', async () => {
      const tools = await client.listTools();
      const readNotesTool = tools.tools.find(t => t.name === 'read_notes')!;

      const schema = readNotesTool.inputSchema;
      expect(schema.required).toContain('folder');
    });

    it('write tools have readOnlyHint: false annotation', async () => {
      const tools = await client.listTools();
      const writeToolNames = ['create_note', 'delete_note', 'move_note'];
      for (const name of writeToolNames) {
        const tool = tools.tools.find(t => t.name === name)!;
        expect(tool.annotations?.readOnlyHint, `${name} should have readOnlyHint: false`).toBe(false);
      }
    });
  });
});
