import { db, handle, HttpError, json, newId, readBody } from './_lib.mjs';

const list = () => db('GET', 'staff?select=id,name&order=name.asc');

export const GET = handle(async () => json(200, await list()));

export const POST = handle(async req => {
  const name = String((await readBody(req)).name || '').trim();
  if (!name) throw new HttpError(400, 'Name is required.');
  try { await db('POST', 'staff', { id: newId(), name }); }
  catch (e) { if (e.status === 409) throw new HttpError(409, `${name} is already listed.`); throw e; }
  return json(201, await list());
});

// DELETE /api/staff/<id> is rewritten to /api/staff?id=<id> in vercel.json.
export const DELETE = handle(async req => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'Missing id.');
  await db('DELETE', `staff?id=eq.${encodeURIComponent(id)}`);
  return json(200, { ok: true });
});
