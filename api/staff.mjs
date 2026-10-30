import { db, handle, HttpError, json, newId, readBody } from './_lib.mjs';
import { hashPin, requireUser, ROLES, validPin } from './_auth.mjs';

// The PIN hash never leaves the server; the page only learns whether a PIN is set.
const list = async () => (await db('GET', 'staff?select=id,name,role,pin_hash&order=name.asc'))
  .map(({ pin_hash, ...s }) => ({ ...s, hasPin: !!pin_hash }));

function fields(b, { create }) {
  const out = {};
  if (create || b.name !== undefined) {
    out.name = String(b.name || '').trim();
    if (!out.name) throw new HttpError(400, 'Name is required.');
  }
  if (create || b.role !== undefined) {
    out.role = b.role || 'operator';
    if (!ROLES.includes(out.role)) throw new HttpError(400, 'Unknown role.');
  }
  if (create || b.pin !== undefined) {
    if (!validPin(b.pin)) throw new HttpError(400, 'PIN must be 4 to 8 digits.');
    Object.assign(out, { pin_hash: hashPin(b.pin), failed_attempts: 0, locked_until: null });
  }
  return out;
}

const idOf = req => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'Missing id.');
  return id;
};

export const GET = handle(async req => { await requireUser(req); return json(200, await list()); });

export const POST = handle(async req => {
  await requireUser(req, 'admin');
  const f = fields(await readBody(req), { create: true });
  try { await db('POST', 'staff', { id: newId(), ...f }); }
  catch (e) { if (e.status === 409) throw new HttpError(409, `${f.name} is already listed.`); throw e; }
  return json(201, await list());
});

// PATCH /api/staff/<id> with any of { name, role, pin }. Rewritten to ?id= in vercel.json.
export const PATCH = handle(async req => {
  const me = await requireUser(req, 'admin'), id = idOf(req);
  const f = fields(await readBody(req), { create: false });
  if (id === me.id && f.role && f.role !== 'admin') throw new HttpError(400, 'You cannot remove your own admin role.');
  const rows = await db('PATCH', `staff?id=eq.${encodeURIComponent(id)}`, f);
  if (!rows.length) throw new HttpError(404, 'Person not found.');
  return json(200, await list());
});

export const DELETE = handle(async req => {
  const me = await requireUser(req, 'admin'), id = idOf(req);
  if (id === me.id) throw new HttpError(400, 'You cannot remove yourself.');
  await db('DELETE', `staff?id=eq.${encodeURIComponent(id)}`);
  return json(200, await list());
});
