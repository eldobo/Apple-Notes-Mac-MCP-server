/**
 * Integration test: exercises write tools against real Apple Notes.
 * Run manually: npx tsx tests/integration.ts
 *
 * Creates test notes in "test actual folder", exercises CRUD, then cleans up.
 */
import { createNote, deleteNote, moveNote, readNotes, listFolders, listTags } from '../src/applescript.js';

const TEST_FOLDER = 'test actual folder';
const TEST_FOLDER_ID = 'x-coredata://C83F395A-DE84-4A65-90F6-CCDC071037A6/ICFolder/p408';
const ICLOUD_NOTES_ID = 'x-coredata://C83F395A-DE84-4A65-90F6-CCDC071037A6/ICFolder/p3';

async function assert(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${label}`);
  } catch (e) {
    console.error(`✗ ${label}: ${(e as Error).message}`);
    process.exit(1);
  }
}

async function main() {
  console.log('=== Integration Test: Write Tools ===\n');

  // Track created note IDs for cleanup
  const createdIds: string[] = [];

  // 1. Create test notes
  await assert('create_note: plain note', async () => {
    const id = await createNote(TEST_FOLDER, 'Integration Test: Plain', '<h1>Integration Test: Plain</h1><br>Simple text, no tags', TEST_FOLDER_ID);
    if (!id || !id.startsWith('x-coredata://')) throw new Error(`Unexpected ID: ${id}`);
    createdIds.push(id);
  });

  await assert('create_note: tagged note', async () => {
    const id = await createNote(TEST_FOLDER, 'Integration Test: Tagged', '<h1>Integration Test: Tagged</h1><br>Has a tag #testTag', TEST_FOLDER_ID);
    if (!id) throw new Error('No ID returned');
    createdIds.push(id);
  });

  await assert('create_note: move target', async () => {
    const id = await createNote(TEST_FOLDER, 'Integration Test: Move Target', '<h1>Integration Test: Move Target</h1><br>Will be moved', TEST_FOLDER_ID);
    if (!id) throw new Error('No ID returned');
    createdIds.push(id);
  });

  await assert('create_note: delete target', async () => {
    const id = await createNote(TEST_FOLDER, 'Integration Test: Delete Me', '<h1>Integration Test: Delete Me</h1><br>Will be deleted', TEST_FOLDER_ID);
    if (!id) throw new Error('No ID returned');
    createdIds.push(id);
  });

  // 2. Verify notes appear via read_notes
  await assert('read_notes: sees created notes', async () => {
    const notes = await readNotes(TEST_FOLDER, TEST_FOLDER_ID);
    const testNotes = notes.filter(n => n.title.startsWith('Integration Test:'));
    if (testNotes.length < 4) throw new Error(`Expected 4+ test notes, got ${testNotes.length}`);
  });

  // 3. Delete "Delete Me"
  await assert('delete_note: deletes target', async () => {
    const deleteId = createdIds[3]!;
    await deleteNote(deleteId);
    const notes = await readNotes(TEST_FOLDER, TEST_FOLDER_ID);
    const found = notes.find(n => n.id === deleteId);
    if (found) throw new Error('Deleted note still appears');
  });

  // 4. Move "Move Target" to iCloud Notes
  await assert('move_note: moves to iCloud Notes', async () => {
    const moveId = createdIds[2]!;
    await moveNote(moveId, 'Notes', ICLOUD_NOTES_ID);
    const testNotes = await readNotes(TEST_FOLDER, TEST_FOLDER_ID);
    const stillThere = testNotes.find(n => n.id === moveId);
    if (stillThere) throw new Error('Moved note still in source folder');
    // Verify it arrived
    const icloudNotes = await readNotes('Notes', ICLOUD_NOTES_ID);
    const arrived = icloudNotes.find(n => n.id === moveId);
    if (!arrived) throw new Error('Moved note not found in target folder');
  });

  // 5. Cleanup: delete remaining test notes
  console.log('\n--- Cleanup ---');

  // Delete from test folder (plain, tagged)
  for (const id of [createdIds[0]!, createdIds[1]!]) {
    await deleteNote(id);
    console.log(`  Deleted ${id}`);
  }

  // Delete moved note from iCloud Notes
  await deleteNote(createdIds[2]!);
  console.log(`  Deleted moved note ${createdIds[2]}`);

  // Verify clean state
  await assert('cleanup: test folder back to original state', async () => {
    const notes = await readNotes(TEST_FOLDER, TEST_FOLDER_ID);
    const testNotes = notes.filter(n => n.title.startsWith('Integration Test:'));
    if (testNotes.length > 0) throw new Error(`${testNotes.length} test notes remain`);
  });

  console.log('\n=== All integration tests passed! ===');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
