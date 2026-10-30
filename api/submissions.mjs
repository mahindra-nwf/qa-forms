import { db, handle, HttpError, json, listForms, newId, readBody } from './_lib.mjs';

// Column aliases give the page the same field names the local server uses.
const COLUMNS = 'id,formId:form_id,formName:form_name,formCode:form_code,category,staffName:staff_name,submittedAt:submitted_at,values,notes';

export const GET = handle(async () =>
  json(200, await db('GET', `submissions?select=${COLUMNS}&order=submitted_at.desc&limit=2000`)));

export const POST = handle(async req => {
  const b = await readBody(req);
  const form = listForms().find(f => f.id === b.formId);
  if (!form) throw new HttpError(400, 'That form no longer exists.');
  const staffName = String(b.staffName || '').trim();
  if (!staffName) throw new HttpError(400, 'Filled by is required.');
  const values = b.values && typeof b.values === 'object' && !Array.isArray(b.values) ? b.values : {};

  // submitted_at is set by the database clock, not the device.
  const [row] = await db('POST', `submissions?select=${COLUMNS}`, {
    id: newId(), form_id: form.id, form_name: form.name, form_code: form.code || '', category: form.category || '',
    staff_name: staffName, values, notes: String(b.notes || '').trim(),
  });
  return json(201, row);
});
