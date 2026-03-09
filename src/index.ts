import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listFolders, listTags, readNotes, createNote, deleteNote, moveNote, updateNote } from './applescript.js';

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

  server.registerTool('create_note', {
    description: 'Create a new note in a folder. Body is HTML. The first line of body becomes the note title.',
    inputSchema: {
      folder: z.string().describe('Name of the folder to create the note in'),
      title: z.string().describe('Title for the new note'),
      body: z.string().optional().describe('HTML body content for the note'),
      id: z.string().optional().describe('Folder ID from list_folders. When provided, takes precedence over folder name'),
    },
    annotations: { readOnlyHint: false },
  }, async ({ folder, title, body, id }) => {
    try {
      const noteId = await createNote(folder, title, body, id);
      return {
        content: [{ type: 'text', text: JSON.stringify({ noteId }) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to create note: ${(error as Error).message}` }],
      };
    }
  });

  server.registerTool('delete_note', {
    description: 'Delete a note by its ID. The note is moved to Recently Deleted (recoverable for 30 days).',
    inputSchema: {
      noteId: z.string().describe('The note ID to delete (from read_notes)'),
    },
    annotations: { readOnlyHint: false },
  }, async ({ noteId }) => {
    try {
      await deleteNote(noteId);
      return {
        content: [{ type: 'text', text: JSON.stringify({ deleted: noteId }) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to delete note: ${(error as Error).message}` }],
      };
    }
  });

  server.registerTool('move_note', {
    description: 'Move a note to a different folder.',
    inputSchema: {
      noteId: z.string().describe('The note ID to move (from read_notes)'),
      folder: z.string().describe('Name of the target folder'),
      id: z.string().optional().describe('Target folder ID from list_folders. When provided, takes precedence over folder name'),
    },
    annotations: { readOnlyHint: false },
  }, async ({ noteId, folder, id }) => {
    try {
      await moveNote(noteId, folder, id);
      return {
        content: [{ type: 'text', text: JSON.stringify({ moved: noteId, to: id ?? folder }) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to move note: ${(error as Error).message}` }],
      };
    }
  });

  server.registerTool('update_note', {
    description: 'Update a note\'s body content. Body is HTML. Apple Notes reprocesses HTML on write (not a lossless round-trip).',
    inputSchema: {
      noteId: z.string().describe('The note ID to update (from read_notes)'),
      body: z.string().describe('New HTML body content for the note'),
    },
    annotations: { readOnlyHint: false },
  }, async ({ noteId, body }) => {
    try {
      await updateNote(noteId, body);
      return {
        content: [{ type: 'text', text: JSON.stringify({ updated: noteId }) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to update note: ${(error as Error).message}` }],
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
