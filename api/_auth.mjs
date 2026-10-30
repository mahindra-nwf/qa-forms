// Staff sign-in: PIN hashing and signed session tokens.
// The signing key is derived from SUPABASE_SECRET_KEY, so no extra setting is needed.
import crypto from 'node:crypto';
import { db, HttpError } from './_lib.mjs';

export const ROLES = ['operator', 'qa', 'admin'];
export const SESSION_HOURS = 12;
const MAX_TRIES = 5, LOCK_MINUTES = 30;

// PINs are off unless REQUIRE_PIN=true is set in Vercel. Off: staff tap their name to sign in (testing).
// On: staff type their name and PIN; new PINs need 6+ digits, older 4-5 digit PINs still sign in.
export const pinRequired = () => process.env.REQUIRE_PIN === 'true';
export const validPin = pin => /^\d{6,8}$/.test(String(pin || ''));
const pinShaped = pin => /^\d{4,8}$/.test(String(pin || ''));

export function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(String(pin), salt, 32).toString('base64')}`;
}

function pinMatches(pin, stored) {
  const [, salt, hash] = String(stored || '').split('$');
  if (!salt || !hash) return false;
  const got = crypto.scryptSync(String(pin), Buffer.from(salt, 'base64'), 32);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'base64'));
}

const key = () => crypto.createHash('sha256').update('qa-session:' + process.env.SUPABASE_SECRET_KEY).digest();
const b64 = buf => Buffer.from(buf).toString('base64url');
const sign = data => b64(crypto.createHmac('sha256', key()).update(data).digest());

export function makeToken(staff) {
  const data = b64(JSON.stringify({ sid: staff.id, exp: Date.now() + SESSION_HOURS * 3600e3 }));
  return `${data}.${sign(data)}`;
}

function readToken(token) {
  const [data, mac] = String(token || '').split('.');
  if (!data || !mac || mac.length !== sign(data).length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sign(data)))) return null;
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

const STAFF_COLS = 'id,name,role';

// Returns the signed-in staff member, re-read from the database so removals and role changes apply at once.
export async function currentUser(req) {
  const p = readToken(req.headers.get('x-session'));
  if (!p) return null;
  const [staff] = await db('GET', `staff?select=${STAFF_COLS}&id=eq.${encodeURIComponent(p.sid)}`);
  return staff || null;
}

export async function requireUser(req, ...roles) {
  const user = await currentUser(req);
  if (!user) throw Object.assign(new HttpError(401, 'Please sign in.'), { code: 'signin' });
  if (roles.length && !roles.includes(user.role)) throw new HttpError(403, 'You do not have permission to do that.');
  return user;
}

const sameName = (a, b) => String(a).trim().replace(/\s+/g, ' ').toLowerCase() === String(b).trim().replace(/\s+/g, ' ').toLowerCase();
const WRONG = 'Wrong name or PIN.';

// PINs off: sign in by tapping a name.
export async function loginById(staffId) {
  const [s] = await db('GET', `staff?select=${STAFF_COLS}&id=eq.${encodeURIComponent(staffId || '')}`);
  if (!s) throw new HttpError(401, 'That person is no longer listed.');
  return { token: makeToken(s), user: s };
}

// PINs on: staff type their name (the sign-in screen does not list anyone). A wrong name and a wrong PIN
// give the same answer, so the site never confirms who works here.
export async function login(name, pin) {
  if (!pinShaped(pin)) throw new HttpError(401, WRONG);
  const all = await db('GET', `staff?select=${STAFF_COLS},pin_hash,failed_attempts,locked_until&pin_hash=not.is.null`);
  const s = all.find(x => sameName(x.name, name));
  if (!s) throw new HttpError(401, WRONG);
  if (s.locked_until && new Date(s.locked_until) > new Date()) throw new HttpError(429, `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.`);
  const filter = `staff?id=eq.${encodeURIComponent(s.id)}`;
  if (!pinMatches(pin, s.pin_hash)) {
    const tries = s.failed_attempts + 1;
    await db('PATCH', filter, tries >= MAX_TRIES
      ? { failed_attempts: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60e3).toISOString() }
      : { failed_attempts: tries });
    throw new HttpError(401, tries >= MAX_TRIES ? `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.` : WRONG);
  }
  if (s.failed_attempts || s.locked_until) await db('PATCH', filter, { failed_attempts: 0, locked_until: null });
  return { token: makeToken(s), user: { id: s.id, name: s.name, role: s.role } };
}
