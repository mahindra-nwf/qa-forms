import { db, handle, HttpError, json, listForms, newId, readBody } from './_lib.mjs';

// Column aliases give the page the same field names the local server uses.
const COLUMNS = 'id,formId:form_id,formName:form_name,formCode:form_code,category,staffName:staff_name,submittedAt:submitted_at,editedAt:edited_at,values,notes';

function entry(b) {
  const staffName = String(b.staffName || '').trim();
  if (!staffName) throw new HttpError(400, 'Filled by is required.');
  const values = b.values && typeof b.values === 'object' && !Array.isArray(b.values) ? b.values : {};
  return { staff_name: staffName, values, notes: String(b.notes || '').trim() };
}

function idParam(req) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'Missing id.');
  return `submissions?id=eq.${encodeURIComponent(id)}&select=${COLUMNS}`;
}

export const GET = handle(async () =>
  json(200, await db('GET', `submissions?select=${COLUMNS}&order=submitted_at.desc&limit=2000`)));

export const POST = handle(async req => {
  const b = await readBody(req);
  const form = listForms().find(f => f.id === b.formId);
  if (!form) throw new HttpError(400, 'That form no longer exists.');

  // submitted_at is set by the database clock, not the device.
  const [row] = await db('POST', `submissions?select=${COLUMNS}`, {
    id: newId(), form_id: form.id, form_name: form.name, form_code: form.code || '', category: form.category || '',
    ...entry(b),
  });
  return json(201, row);
});

// Edit and delete only work while test mode is on; otherwise the database refuses (403).
// /api/submissions/<id> is rewritten to /api/submissions?id=<id> in vercel.json.
export const PATCH = handle(async req => {
  const [row] = await db('PATCH', idParam(req), { ...entry(await readBody(req)), edited_at: new Date().toISOString() });
  if (!row) throw new HttpError(404, 'Record not found.');
  return json(200, row);
});

export const DELETE = handle(async req => {
  const [row] = await db('DELETE', idParam(req));
  if (!row) throw new HttpError(404, 'Record not found.');
  return json(200, { ok: true });
});
