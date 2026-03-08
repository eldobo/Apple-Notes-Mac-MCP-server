import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// Mock the applescript module before importing server setup
vi.mock('../src/applescript.js', () => ({
  listFolders: vi.fn(),
  readNotes: vi.fn(),
}));

// These will be imported after mock is set up
import { listFolders, readNotes } from '../src/applescript.js';
import { createServer } from '../src/index.js';

const mockListFolders = vi.mocked(listFolders);
const mockReadNotes = vi.mocked(readNotes);

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

  describe('read_notes tool', () => {
    it('returns notes for a valid folder', async () => {
      const notes = [
        { title: 'Note 1', body: 'Content 1', createdAt: '2026-03-01', modifiedAt: '2026-03-05' },
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
      // Calling without required argument should error
      const result = await client.callTool({
        name: 'read_notes',
        arguments: {},
      });

      expect(result.isError).toBe(true);
    });

    it('passes id to readNotes when provided', async () => {
      const notes = [
        { title: 'Note 1', body: 'Content 1', createdAt: '2026-03-01', modifiedAt: '2026-03-05' },
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

  describe('tool discovery', () => {
    it('exposes list_folders and read_notes tools', async () => {
      const tools = await client.listTools();
      const toolNames = tools.tools.map(t => t.name);

      expect(toolNames).toContain('list_folders');
      expect(toolNames).toContain('read_notes');
      expect(toolNames).toHaveLength(2);
    });

    it('list_folders has no required input', async () => {
      const tools = await client.listTools();
      const listFoldersTool = tools.tools.find(t => t.name === 'list_folders')!;

      // Should have no required properties or empty schema
      const schema = listFoldersTool.inputSchema;
      expect(schema.required ?? []).toEqual([]);
    });

    it('read_notes requires folder input', async () => {
      const tools = await client.listTools();
      const readNotesTool = tools.tools.find(t => t.name === 'read_notes')!;

      const schema = readNotesTool.inputSchema;
      expect(schema.required).toContain('folder');
    });
  });
});
