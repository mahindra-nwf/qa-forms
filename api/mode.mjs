import { db, handle, json } from './_lib.mjs';

// Tells the page whether test mode (editing and deleting records) is on.
export const GET = handle(async () => {
  const [row] = await db('GET', 'app_settings?select=allow_record_changes&id=eq.1');
  return json(200, { allowChanges: !!row?.allow_record_changes });
});
