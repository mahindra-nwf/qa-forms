// Plant QA Forms - local server. No dependencies: run `node server.js`.
// forms/*.json        form definitions (one file per paper form)
// data/staff.json     names for the "Filled by" list
// data/submissions/   one JSON file per submitted form
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const FORMS = path.join(ROOT, 'forms');
const DATA = path.join(ROOT, 'data');
const SUBS = path.join(DATA, 'submissions');
const STAFF = path.join(DATA, 'staff.json');
fs.mkdirSync(FORMS, { recursive: true });
fs.mkdirSync(SUBS, { recursive: true });

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, value) => { fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2)); fs.renameSync(file + '.tmp', file); };
const newId = () => new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + crypto.randomBytes(3).toString('hex');

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function listForms() {
  return fs.readdirSync(FORMS).filter(f => f.endsWith('.json')).map(f => {
    const form = readJson(path.join(FORMS, f), null);
    if (!form) { console.warn(`Skipping ${f}: not valid JSON`); return null; }
    return { id: path.basename(f, '.json'), ...form };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

function listSubmissions() {
  return fs.readdirSync(SUBS).filter(f => f.endsWith('.json'))
    .map(f => readJson(path.join(SUBS, f), null)).filter(Boolean)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

async function api(req, res, url) {
  const [, , kind, id] = url.pathname.split('/');
  if (kind === 'forms' && req.method === 'GET') return send(res, 200, listForms());

  if (kind === 'staff') {
    const staff = readJson(STAFF, []);
    if (req.method === 'GET') return send(res, 200, staff);
    if (req.method === 'POST') {
      const name = String((await readBody(req)).name || '').trim();
      if (!name) return send(res, 400, { error: 'Name is required.' });
      if (staff.some(s => s.name.toLowerCase() === name.toLowerCase())) return send(res, 409, { error: `${name} is already listed.` });
      staff.push({ id: newId(), name });
      staff.sort((a, b) => a.name.localeCompare(b.name));
      writeJson(STAFF, staff);
      return send(res, 201, staff);
    }
    if (req.method === 'DELETE' && id) { writeJson(STAFF, staff.filter(s => s.id !== id)); return send(res, 200, { ok: true }); }
  }

  if (kind === 'submissions') {
    if (req.method === 'GET') return send(res, 200, listSubmissions());
    if (req.method === 'POST') {
      const b = await readBody(req);
      const form = listForms().find(f => f.id === b.formId);
      if (!form) return send(res, 400, { error: 'That form no longer exists.' });
      if (!String(b.staffName || '').trim()) return send(res, 400, { error: 'Filled by is required.' });
      const sub = { id: newId(), formId: form.id, formName: form.name, formCode: form.code || '', category: form.category || '',
        staffName: String(b.staffName).trim(), submittedAt: new Date().toISOString(), values: b.values || {}, notes: String(b.notes || '').trim() };
      writeJson(path.join(SUBS, sub.id + '.json'), sub);
      return send(res, 201, sub);
    }
  }
  send(res, 404, { error: 'Not found' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === '/' || url.pathname === '/index.html')
      return send(res, 200, fs.readFileSync(path.join(ROOT, 'public', 'index.html')), 'text/html; charset=utf-8');
    send(res, 404, 'Not found', 'text/plain');
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Server error: ' + e.message });
  }
}).listen(PORT, () => {
  const nets = Object.values(require('os').networkInterfaces()).flat().filter(n => n.family === 'IPv4' && !n.internal);
  console.log(`Plant QA Forms running:\n  This PC:      http://localhost:${PORT}`);
  nets.forEach(n => console.log(`  Other devices: http://${n.address}:${PORT}`));
});
