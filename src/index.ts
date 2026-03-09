import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listFolders, listTags, readNotes } from './applescript.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'apple-notes',
    version: '1.0.0',
  });

  server.registerTool('list_folders', {
    description: 'List real folders (actual containers) in Apple Notes with their note counts. Excludes Smart Folders (tag-based views).',
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

  server.registerTool('list_tags', {
    description: 'List all tags in Apple Notes with their note counts. Tags are derived from Smart Folders, which Apple Notes creates one-to-one for each tag.',
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      const tags = await listTags();
      return {
        content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to list tags: ${(error as Error).message}` }],
      };
    }
  });

  server.registerTool('read_notes', {
    description: 'Read all notes from a specific Apple Notes folder. Returns note id, title, plain text body, tags, and timestamps.',
    inputSchema: {
      folder: z.string().describe('Name of the folder to read notes from'),
      id: z.string().optional().describe('Folder ID from list_folders. When provided, takes precedence over folder name for lookup (useful when multiple folders share the same name)'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ folder, id }) => {
    try {
      const notes = await readNotes(folder, id);
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
