// Shared helpers for the Vercel API functions (online version).
// Env vars (set in Vercel > Project > Settings > Environment Variables):
//   SUPABASE_URL         https://<project>.supabase.co
//   SUPABASE_SECRET_KEY  secret key (sb_secret_...) or legacy service_role key
// There is no shared site password: every data call needs a signed-in person (see _auth.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FORMS = path.join(process.cwd(), 'forms');

export const json = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const newId = () => new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + crypto.randomBytes(3).toString('hex');

export function listForms() {
  return fs.readdirSync(FORMS).filter(f => f.endsWith('.json')).map(f => {
    try { return { id: path.basename(f, '.json'), ...JSON.parse(fs.readFileSync(path.join(FORMS, f), 'utf8')) }; }
    catch { console.warn(`Skipping ${f}: not valid JSON`); return null; }
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

export async function readBody(req) {
  const raw = await req.text();
  if (raw.length > 2e6) throw new HttpError(413, 'Entry is too large.');
  try { return JSON.parse(raw || '{}'); } catch { throw new HttpError(400, 'Invalid request.'); }
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Minimal Supabase REST (PostgREST) client: path like 'staff?select=*'.
export async function db(method, pathAndQuery, body) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new HttpError(500, 'Server is missing Supabase settings.');
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; // legacy JWT keys
  const r = await fetch(`${url}/rest/v1/${pathAndQuery}`, { method, headers, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    console.error('Supabase error', r.status, data);
    if (data?.code === '23505') throw new HttpError(409, 'Already exists.');
    if (data?.code === 'P0001') throw new HttpError(403, 'Records are locked and cannot be changed or deleted.');
    throw new HttpError(502, 'Could not save to the database. Try again.');
  }
  return data;
}

// Wraps a handler with error handling.
export const handle = fn => async req => {
  try { return await fn(req); }
  catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, ...(e.code && { code: e.code }) });
    console.error(e);
    return json(500, { error: 'Server error.' });
  }
};
