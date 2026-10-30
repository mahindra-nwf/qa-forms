// Tests the Vercel API functions with an in-memory fake Supabase. Run: node --test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';

const forms = await import('../api/forms.mjs');
const staff = await import('../api/staff.mjs');
const subs = await import('../api/submissions.mjs');
const session = await import('../api/session.mjs');
const { hashPin, makeToken } = await import('../api/_auth.mjs');

// Fake PostgREST: understands select=, eq./is. filters, POST/PATCH/DELETE on these tables.
let T, calls, fail;
const pick = (row, select) => {
  if (!select || select === '*') return { ...row };
  return Object.fromEntries(select.split(',').map(c => { const [alias, col = alias] = c.split(':'); return [alias, row[col]]; }));
};
beforeEach(() => {
  T = { staff: [], submissions: [], app_settings: [{ id: 1, allow_record_changes: true }] };
  calls = []; fail = null; delete process.env.REQUIRE_PIN;
  globalThis.fetch = async (url, init) => {
    const u = new URL(url), table = u.pathname.split('/').pop(), body = init.body && JSON.parse(init.body);
    calls.push({ table, method: init.method, url, headers: init.headers, body });
    if (fail) return new Response(JSON.stringify(fail.body), { status: fail.status });
    const filters = [...u.searchParams].filter(([k]) => !['select', 'order', 'limit'].includes(k));
    const match = r => filters.every(([k, v]) => v.startsWith('eq.') ? String(r[k]) === v.slice(3) : v === 'not.is.null' ? r[k] != null : true);
    const sel = r => pick(r, u.searchParams.get('select'));
    let rows = T[table].filter(match);
    if (init.method === 'POST') {
      if (table === 'staff' && T.staff.some(s => s.name.toLowerCase() === body.name.toLowerCase())) return Response.json({ code: '23505' }, { status: 409 });
      const row = { failed_attempts: 0, submitted_at: new Date().toISOString(), ...body }; T[table].push(row); rows = [row];
    } else if (init.method === 'PATCH') rows.forEach(r => Object.assign(r, body));
    else if (init.method === 'DELETE') T[table] = T[table].filter(r => !rows.includes(r));
    return Response.json(rows.map(sel));
  };
});

const person = (id, role, pin = '135790') => { T.staff.push({ id, name: id.toUpperCase(), role, pin_hash: hashPin(pin), failed_attempts: 0 }); return makeToken({ id }); };
const req = (method, path, body, { token } = {}) => new Request('https://qa.test' + path, {
  method, headers: { 'content-type': 'application/json', ...(token && { 'x-session': token }) },
  body: body && JSON.stringify(body),
});

test('no site password: records still need someone signed in', async () => {
  const r = await subs.GET(req('GET', '/api/submissions'));
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'signin');
});

test('lists the forms from forms/', async () => {
  const list = await (await forms.GET(req('GET', '/api/forms'))).json();
  assert.ok(list.some(f => f.id === 'receiving-log-001-cards'));
});

test('PINs off: first setup needs only a name, then is closed', async () => {
  let me = await (await session.GET(req('GET', '/api/session'))).json();
  assert.equal(me.needsSetup, true);
  assert.equal(me.pinRequired, false);
  const r = await session.POST(req('POST', '/api/session', { action: 'setup', name: 'Ana' }));
  assert.equal(r.status, 201);
  const { token, user } = await r.json();
  assert.equal(user.role, 'admin');
  assert.equal(T.staff[0].pin_hash, undefined);
  me = await (await session.GET(req('GET', '/api/session', null, { token }))).json();
  assert.equal(me.user.name, 'Ana');
  assert.equal(me.needsSetup, false);
  assert.equal((await session.POST(req('POST', '/api/session', { action: 'setup', name: 'Eve' }))).status, 403);
});

test('PINs off: the sign-in screen lists everyone and a tap signs in', async () => {
  T.staff.push({ id: 'bo', name: 'Bo', role: 'operator' });
  const me = await (await session.GET(req('GET', '/api/session'))).json();
  assert.deepEqual(me.people.map(p => p.name), ['Bo']);
  const ok = await session.POST(req('POST', '/api/session', { action: 'login', staffId: 'bo' }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).user.name, 'Bo');
  assert.equal((await session.POST(req('POST', '/api/session', { action: 'login', staffId: 'gone' }))).status, 401);
});

test('PINs off: admins add people without a PIN', async () => {
  const admin = person('ad', 'admin');
  const r = await staff.POST(req('POST', '/api/staff', { name: 'Cy', role: 'operator' }, { token: admin }));
  assert.equal(r.status, 201);
});

test('PINs on: names are hidden, sign in by name and PIN, 5 wrong tries lock it', async () => {
  process.env.REQUIRE_PIN = 'true';
  person('bo', 'operator', '135790');
  const me = await (await session.GET(req('GET', '/api/session'))).json();
  assert.equal(me.pinRequired, true);
  assert.deepEqual(me.people, [], 'nobody is listed');
  const ok = await session.POST(req('POST', '/api/session', { action: 'login', name: '  bo ', pin: '135790' }));
  assert.equal(ok.status, 200, 'name match ignores case and spaces');
  const unknown = await (await session.POST(req('POST', '/api/session', { action: 'login', name: 'Nobody', pin: '135790' }))).json();
  const wrong = await session.POST(req('POST', '/api/session', { action: 'login', name: 'BO', pin: '000000' }));
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error, unknown.error, 'a wrong name and a wrong PIN look the same');
  assert.equal((await session.POST(req('POST', '/api/session', { action: 'login', staffId: 'bo' }))).status, 401, 'tap-to-sign-in is off');
  for (let i = 0; i < 4; i++) await session.POST(req('POST', '/api/session', { action: 'login', name: 'BO', pin: '000000' }));
  const locked = await session.POST(req('POST', '/api/session', { action: 'login', name: 'BO', pin: '135790' }));
  assert.equal(locked.status, 429, 'even the right PIN waits out the lock');
  assert.match((await locked.json()).error, /30 minutes/);
});

test('switching PINs on never reopens first-admin setup', async () => {
  T.staff.push({ id: 'ad', name: 'Ana', role: 'admin' }); // admin made while PINs were off, no PIN yet
  process.env.REQUIRE_PIN = 'true';
  assert.equal((await (await session.GET(req('GET', '/api/session'))).json()).needsSetup, false);
  assert.equal((await session.POST(req('POST', '/api/session', { action: 'setup', name: 'Eve', pin: '246802' }))).status, 403);
});

test('PINs on: new PINs need 6 digits, setup needs one', async () => {
  process.env.REQUIRE_PIN = 'true';
  assert.equal((await session.POST(req('POST', '/api/session', { action: 'setup', name: 'Ana' }))).status, 400);
  assert.equal((await session.POST(req('POST', '/api/session', { action: 'setup', name: 'Ana', pin: '2468' }))).status, 400);
  const r = await session.POST(req('POST', '/api/session', { action: 'setup', name: 'Ana', pin: '246802' }));
  assert.equal(r.status, 201);
  assert.notEqual(T.staff[0].pin_hash, '246802', 'PIN is stored hashed');
  const admin = (await r.json()).token;
  assert.equal((await staff.POST(req('POST', '/api/staff', { name: 'Cy' }, { token: admin }))).status, 400, 'PIN required');
});

test('a forged or tampered session is refused', async () => {
  const token = person('bo', 'admin');
  const [data, mac] = token.split('.');
  for (const bad of ['nonsense', `${data}.x${mac.slice(1)}`, `${Buffer.from(JSON.stringify({ sid: 'bo', exp: 9e15 })).toString('base64url')}.${mac}`]) {
    const r = await subs.GET(req('GET', '/api/submissions', null, { token: bad }));
    assert.equal(r.status, 401);
    assert.equal((await r.json()).code, 'signin');
  }
});

test('Filled by comes from the signed-in person, not the device', async () => {
  const token = person('bo', 'operator');
  const r = await subs.POST(req('POST', '/api/submissions', { formId: 'receiving-log-001-cards', staffName: 'Someone Else', values: { t: 1 }, submittedAt: '1999-01-01' }, { token }));
  assert.equal(r.status, 201);
  assert.equal(T.submissions[0].staff_name, 'BO');
  assert.equal(T.submissions[0].staff_id, 'bo');
  assert.equal(T.submissions[0].submitted_at.startsWith('1999'), false);
});

test('a record sent twice after a dropped connection is saved once, with the iPad time kept', async () => {
  const token = person('bo', 'operator');
  const body = { formId: 'receiving-log-001-cards', values: { t: 1 }, clientId: 'c0ffee00-1111-2222', filledAt: '2026-10-30T09:00:00.000Z' };
  const first = await subs.POST(req('POST', '/api/submissions', body, { token }));
  const again = await subs.POST(req('POST', '/api/submissions', body, { token }));
  assert.equal(first.status, 201);
  assert.equal(again.status, 200);
  assert.equal(T.submissions.length, 1);
  assert.equal((await again.json()).id, T.submissions[0].id);
  assert.equal(T.submissions[0].filled_at, '2026-10-30T09:00:00.000Z');
  assert.notEqual(T.submissions[0].submitted_at, T.submissions[0].filled_at, 'receipt time is the server clock');
});

test('a bad clientId or filledAt is ignored, not trusted', async () => {
  const token = person('bo', 'operator');
  await subs.POST(req('POST', '/api/submissions', { formId: 'receiving-log-001-cards', clientId: 'x;drop', filledAt: 'soon' }, { token }));
  assert.equal(T.submissions[0].client_id, null);
  assert.equal(T.submissions[0].filled_at, null);
});

test('submitting needs a signed-in person and a real form', async () => {
  assert.equal((await subs.POST(req('POST', '/api/submissions', { formId: 'receiving-log-001-cards' }))).status, 401);
  const token = person('bo', 'operator');
  assert.equal((await subs.POST(req('POST', '/api/submissions', { formId: 'nope' }, { token }))).status, 400);
});

test('only QA and admin can edit or delete records', async () => {
  T.submissions.push({ id: 's1', staff_name: 'BO', values: {}, notes: '' });
  const op = person('op', 'operator'), qa = person('qa', 'qa');
  assert.equal((await subs.PATCH(req('PATCH', '/api/submissions?id=s1', { values: { a: 1 } }, { token: op }))).status, 403);
  assert.equal((await subs.DELETE(req('DELETE', '/api/submissions?id=s1', null, { token: op }))).status, 403);
  const r = await subs.PATCH(req('PATCH', '/api/submissions?id=s1', { values: { a: 2 }, staffName: 'X' }, { token: qa }));
  assert.equal(r.status, 200);
  assert.equal(T.submissions[0].staff_name, 'BO', 'original filler is kept');
  assert.equal(T.submissions[0].edited_by, 'QA');
  assert.equal((await subs.DELETE(req('DELETE', '/api/submissions?id=s1', null, { token: qa }))).status, 200);
  assert.equal(T.submissions.length, 0);
});

test('locked records give a clear 403', async () => {
  const qa = person('qa', 'qa');
  T.submissions.push({ id: 's1' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => init.method === 'GET' ? realFetch(url, init) : new Response(JSON.stringify({ code: 'P0001' }), { status: 400 });
  const r = await subs.DELETE(req('DELETE', '/api/submissions?id=s1', null, { token: qa }));
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /locked/);
});

test('only admins manage staff; PIN hashes never leave the server', async () => {
  const admin = person('ad', 'admin'), op = person('op', 'operator');
  assert.equal((await staff.POST(req('POST', '/api/staff', { name: 'Cy', role: 'qa', pin: '444444' }, { token: op }))).status, 403);
  const r = await staff.POST(req('POST', '/api/staff', { name: 'Cy', role: 'qa', pin: '444444' }, { token: admin }));
  assert.equal(r.status, 201);
  const list = await r.json();
  assert.ok(list.every(s => !('pin_hash' in s) && typeof s.hasPin === 'boolean'));
  assert.equal((await staff.POST(req('POST', '/api/staff', { name: 'cy', pin: '444444' }, { token: admin }))).status, 409);
  assert.equal((await staff.POST(req('POST', '/api/staff', { name: 'Dee', pin: '12' }, { token: admin }))).status, 400, 'short PIN');
  assert.equal((await staff.PATCH(req('PATCH', '/api/staff?id=ad', { role: 'operator' }, { token: admin }))).status, 400, 'cannot demote yourself');
  assert.equal((await staff.DELETE(req('DELETE', '/api/staff?id=ad', null, { token: admin }))).status, 400, 'cannot remove yourself');
  assert.equal((await staff.DELETE(req('DELETE', '/api/staff?id=op', null, { token: admin }))).status, 200);
  assert.equal((await subs.GET(req('GET', '/api/submissions', null, { token: op }))).status, 401, 'removed person is signed out at once');
});

test('database errors are not leaked to the page', async () => {
  const token = person('bo', 'operator');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => url.includes('/staff') ? realFetch(url, init) : new Response(JSON.stringify({ message: 'secret internals' }), { status: 500 });
  const r = await subs.GET(req('GET', '/api/submissions', null, { token }));
  assert.equal(r.status, 502);
  assert.doesNotMatch(JSON.stringify(await r.json()), /secret internals/);
});
