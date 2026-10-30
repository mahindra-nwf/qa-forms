import { db, handle, HttpError, json, newId, readBody } from './_lib.mjs';
import { currentUser, hashPin, login, loginById, makeToken, pinRequired, validPin } from './_auth.mjs';

const hasAdmin = async () =>
  (await db('GET', `staff?select=id&role=eq.admin${pinRequired() ? '&pin_hash=not.is.null' : ''}&limit=1`)).length > 0;

// Who is signed in on this device. With PINs off the sign-in screen lists everyone to tap;
// with PINs on, names are never listed.
export const GET = handle(async req => json(200, {
  user: await currentUser(req),
  needsSetup: !(await hasAdmin()),
  pinRequired: pinRequired(),
  people: pinRequired() ? [] : await db('GET', 'staff?select=id,name,role&order=name.asc'),
}));

// { action: 'login', staffId } (PINs off) or { action: 'login', name, pin } (PINs on).
// { action: 'setup', name, pin? } only before any admin exists.
export const POST = handle(async req => {
  const b = await readBody(req);
  if (b.action === 'login') return json(200, pinRequired() ? await login(b.name, b.pin) : await loginById(b.staffId));
  if (b.action === 'setup') {
    if (await hasAdmin()) throw new HttpError(403, 'An admin already exists.');
    const name = String(b.name || '').trim();
    if (!name) throw new HttpError(400, 'Name is required.');
    if (pinRequired() && !validPin(b.pin)) throw new HttpError(400, 'PIN must be 6 to 8 digits.');
    const [existing] = await db('GET', `staff?select=id&name=ilike.${encodeURIComponent(name.replace(/[%_]/g, '\\$&'))}`);
    const fields = { name, role: 'admin', ...(b.pin && validPin(b.pin) && { pin_hash: hashPin(b.pin) }) };
    const [staff] = existing
      ? await db('PATCH', `staff?id=eq.${encodeURIComponent(existing.id)}&select=id,name,role`, fields)
      : await db('POST', 'staff?select=id,name,role', { id: newId(), ...fields });
    return json(201, { token: makeToken(staff), user: staff });
  }
  throw new HttpError(400, 'Unknown action.');
});
