import { db, handle, HttpError, json, newId, readBody } from './_lib.mjs';
import { currentUser, hashPin, login, makeToken, validPin } from './_auth.mjs';

const hasAdmin = async () => (await db('GET', 'staff?select=id&role=eq.admin&pin_hash=not.is.null&limit=1')).length > 0;

// Who is signed in, plus the names shown on the sign-in screen.
export const GET = handle(async req => {
  const people = await db('GET', 'staff?select=id,name&pin_hash=not.is.null&order=name.asc');
  return json(200, { user: await currentUser(req), people, needsSetup: !(await hasAdmin()) });
});

// { action: 'login', staffId, pin } or, only before any admin exists, { action: 'setup', name, pin }.
export const POST = handle(async req => {
  const b = await readBody(req);
  if (b.action === 'login') {
    if (!validPin(b.pin)) throw new HttpError(401, 'Wrong PIN.');
    return json(200, await login(b.staffId, b.pin));
  }
  if (b.action === 'setup') {
    if (await hasAdmin()) throw new HttpError(403, 'An admin already exists.');
    const name = String(b.name || '').trim();
    if (!name) throw new HttpError(400, 'Name is required.');
    if (!validPin(b.pin)) throw new HttpError(400, 'PIN must be 4 to 8 digits.');
    const [existing] = await db('GET', `staff?select=id&name=ilike.${encodeURIComponent(name.replace(/[%_]/g, '\\$&'))}`);
    const fields = { name, role: 'admin', pin_hash: hashPin(b.pin) };
    const [staff] = existing
      ? await db('PATCH', `staff?id=eq.${encodeURIComponent(existing.id)}&select=id,name,role`, fields)
      : await db('POST', 'staff?select=id,name,role', { id: newId(), ...fields });
    return json(201, { token: makeToken(staff), user: staff });
  }
  throw new HttpError(400, 'Unknown action.');
});
