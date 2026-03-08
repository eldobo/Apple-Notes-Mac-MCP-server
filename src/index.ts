import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listFolders, readNotes } from './applescript.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'apple-notes',
    version: '1.0.0',
  });

  server.registerTool('list_folders', {
    description: 'List all folders in Apple Notes with their note counts',
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      const folders = await listFolders();
      return {
        content: [{ type: 'text', text: JSON.stringify(folders, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to list folders: ${(error as Error).message}` }],
      };
    }
  });

  server.registerTool('read_notes', {
    description: 'Read all notes from a specific Apple Notes folder',
    inputSchema: {
      folder: z.string().describe('Name of the folder to read notes from'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ folder }) => {
    try {
      const notes = await readNotes(folder);
      return {
        content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to read notes: ${(error as Error).message}` }],
      };
    }
  });

  return server;
}

// Start server when run directly (not imported for tests)
const isMainModule = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isMainModule) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport);
}
