// Tests the Vercel API functions with a fake Supabase. Run: node --test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.ACCESS_CODE = 'plant-code';

const forms = await import('../api/forms.mjs');
const staff = await import('../api/staff.mjs');
const subs = await import('../api/submissions.mjs');

let calls, reply;
beforeEach(() => {
  calls = [];
  reply = () => new Response('[]', { status: 200 });
  globalThis.fetch = async (url, init) => { calls.push({ url, ...init, body: init.body && JSON.parse(init.body) }); return reply(url, init); };
});

const req = (method, path, body, code = 'plant-code') => new Request('https://qa.test' + path, {
  method, headers: { 'x-access-code': code, 'content-type': 'application/json' }, body: body && JSON.stringify(body),
});

test('rejects requests without the right access code', async () => {
  for (const code of ['', 'wrong']) {
    const r = await subs.GET(req('GET', '/api/submissions', null, code));
    assert.equal(r.status, 401);
    assert.equal((await r.json()).code, 'locked');
  }
  assert.equal(calls.length, 0, 'database is never called');
});

test('lists the forms from forms/', async () => {
  const list = await (await forms.GET(req('GET', '/api/forms'))).json();
  assert.ok(list.some(f => f.id === 'receiving-log-001'));
});

test('saves a submission with form details filled in by the server', async () => {
  reply = () => new Response(JSON.stringify([{ id: 'x' }]), { status: 201 });
  const r = await subs.POST(req('POST', '/api/submissions', {
    formId: 'receiving-log-001', staffName: '  Ana ', values: { temp: 34 }, notes: 'ok', submittedAt: '1999-01-01',
  }));
  assert.equal(r.status, 201);
  const sent = calls[0];
  assert.equal(sent.method, 'POST');
  assert.equal(sent.headers.apikey, 'sb_secret_test');
  assert.equal(sent.body.form_id, 'receiving-log-001');
  assert.equal(sent.body.staff_name, 'Ana');
  assert.ok(sent.body.form_name);
  assert.equal(sent.body.submitted_at, undefined, 'time comes from the database, not the device');
});

test('refuses unknown forms and missing names', async () => {
  assert.equal((await subs.POST(req('POST', '/api/submissions', { formId: 'nope', staffName: 'A' }))).status, 400);
  assert.equal((await subs.POST(req('POST', '/api/submissions', { formId: 'receiving-log-001', staffName: ' ' }))).status, 400);
  assert.equal(calls.length, 0);
});

test('duplicate staff name gives a clear message', async () => {
  reply = () => new Response(JSON.stringify({ code: '23505' }), { status: 409 });
  const r = await staff.POST(req('POST', '/api/staff', { name: 'Ana' }));
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /Ana is already listed/);
});

test('database errors are not leaked to the page', async () => {
  reply = () => new Response(JSON.stringify({ message: 'secret internals' }), { status: 500 });
  const r = await subs.GET(req('GET', '/api/submissions'));
  assert.equal(r.status, 502);
  assert.doesNotMatch(JSON.stringify(await r.json()), /secret internals/);
});

test('staff delete escapes the id', async () => {
  await staff.DELETE(req('DELETE', '/api/staff?id=a%26b'));
  assert.match(calls[0].url, /staff\?id=eq\.a%26b$/);
});
