import { db, handle, HttpError, json, listForms, newId, readBody } from './_lib.mjs';
import { requireUser } from './_auth.mjs';

// Column aliases give the page the same field names the local server uses.
const COLUMNS = 'id,formId:form_id,formName:form_name,formCode:form_code,category,staffName:staff_name,submittedAt:submitted_at,filledAt:filled_at,editedAt:edited_at,editedBy:edited_by,values,notes';

function entry(b) {
  const values = b.values && typeof b.values === 'object' && !Array.isArray(b.values) ? b.values : {};
  return { values, notes: String(b.notes || '').trim() };
}

function idParam(req) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'Missing id.');
  return `submissions?id=eq.${encodeURIComponent(id)}&select=${COLUMNS}`;
}

export const GET = handle(async req => {
  await requireUser(req);
  return json(200, await db('GET', `submissions?select=${COLUMNS}&order=submitted_at.desc&limit=2000`));
});

const byClientId = async cid => (await db('GET', `submissions?select=${COLUMNS}&client_id=eq.${encodeURIComponent(cid)}`))[0];

// "Filled by" is always the signed-in person, never a name typed on the device.
// Records filled offline arrive later with a clientId (sent again after a dropped connection = saved once)
// and filledAt, the iPad's clock when Submit was pressed.
export const POST = handle(async req => {
  const user = await requireUser(req);
  const b = await readBody(req);
  const form = listForms().find(f => f.id === b.formId);
  if (!form) throw new HttpError(400, 'That form no longer exists.');
  const clientId = /^[A-Za-z0-9-]{8,64}$/.test(b.clientId || '') ? b.clientId : null;
  const filled = new Date(b.filledAt);

  if (clientId) { const seen = await byClientId(clientId); if (seen) return json(200, seen); }
  // submitted_at is set by the database clock, not the device.
  try {
    const [row] = await db('POST', `submissions?select=${COLUMNS}`, {
      id: newId(), form_id: form.id, form_name: form.name, form_code: form.code || '', category: form.category || '',
      staff_id: user.id, staff_name: user.name, ...entry(b),
      client_id: clientId, filled_at: isNaN(filled) ? null : filled.toISOString(),
    });
    return json(201, row);
  } catch (e) {
    if (e.status === 409 && clientId) return json(200, await byClientId(clientId));
    throw e;
  }
});

// Edit and delete: QA and admin only, and only while test mode is on (otherwise the database refuses, 403).
// /api/submissions/<id> is rewritten to /api/submissions?id=<id> in vercel.json.
export const PATCH = handle(async req => {
  const user = await requireUser(req, 'qa', 'admin');
  const [row] = await db('PATCH', idParam(req), { ...entry(await readBody(req)), edited_at: new Date().toISOString(), edited_by: user.name });
  if (!row) throw new HttpError(404, 'Record not found.');
  return json(200, row);
});

export const DELETE = handle(async req => {
  await requireUser(req, 'qa', 'admin');
  const [row] = await db('DELETE', idParam(req));
  if (!row) throw new HttpError(404, 'Record not found.');
  return json(200, { ok: true });
});
